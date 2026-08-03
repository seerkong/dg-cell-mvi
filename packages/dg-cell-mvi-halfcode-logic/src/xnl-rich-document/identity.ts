import {
  type XnlRichDocument,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentIdentityChange,
  type XnlRichDocumentIdentityClassificationInput,
  type XnlRichDocumentIdentityClassificationResult,
  type XnlRichDocumentLogicConfig,
  type XnlRichDocumentLogicRuntime,
  type XnlRichDocumentNode,
  type XnlRichDocumentOccurrenceAddressInput,
  type XnlRichDocumentOccurrenceAddressResult,
  type XnlRichDocumentOccurrenceXId,
  type XnlRichDocumentSerializableValue,
  type XnlRichDocumentSerializableRecord,
} from 'dg-cell-mvi-halfcode-contract';
import {
  deepFreeze,
  parseXnlRichDocumentCandidate,
  parseXnlRichDocumentInputRecord,
} from './normalization';

interface LocatedNode {
  node: Exclude<XnlRichDocumentNode, { kind: 'text' }>;
  path: readonly (string | number)[];
}

export function classifyXnlRichDocumentIdentity(
  runtime: XnlRichDocumentLogicRuntime,
  input: XnlRichDocumentIdentityClassificationInput,
  config: XnlRichDocumentLogicConfig = {},
): XnlRichDocumentIdentityClassificationResult {
  const safeInput = parseXnlRichDocumentInputRecord(
    input,
    new Set(['accepted', 'candidate', 'copyOrigins']),
  );
  if (!safeInput.ok) return rejectedIdentity(safeInput.diagnostics);

  const acceptedResult = parseXnlRichDocumentCandidate(
    runtime,
    { candidate: safeInput.value.accepted as XnlRichDocumentSerializableValue },
    config,
  );
  const candidateResult = parseXnlRichDocumentCandidate(
    runtime,
    { candidate: safeInput.value.candidate as XnlRichDocumentSerializableValue },
    config,
  );
  if (acceptedResult.status === 'rejected' || candidateResult.status === 'rejected') {
    const diagnostics = [
      ...(acceptedResult.status === 'rejected' ? prefixDiagnostics('accepted', acceptedResult.diagnostics) : []),
      ...(candidateResult.status === 'rejected' ? prefixDiagnostics('candidate', candidateResult.diagnostics) : []),
    ];
    return rejectedIdentity(diagnostics);
  }

  const acceptedNodes = flatten(acceptedResult.document);
  const candidateNodes = flatten(candidateResult.document);
  const acceptedById = new Map(acceptedNodes.map((entry) => [entry.node.nodeId, entry]));
  const candidateById = new Map(candidateNodes.map((entry) => [entry.node.nodeId, entry]));
  const acceptedByPath = new Map(acceptedNodes.map((entry) => [pathKey(entry.path), entry]));
  const candidateByPath = new Map(candidateNodes.map((entry) => [pathKey(entry.path), entry]));
  const origins = new Map<XnlRichDocumentDomainNodeId, XnlRichDocumentDomainNodeId>();
  const parsedOrigins = parseCopyOrigins(safeInput.value.copyOrigins);
  const provenanceDiagnostics: XnlRichDocumentDiagnostic[] = [...parsedOrigins.diagnostics];
  for (const origin of parsedOrigins.origins) {
    if (origins.has(origin.candidateNodeId)) {
      provenanceDiagnostics.push({
        severity: 'error',
        code: 'INVALID_IDENTITY_PROVENANCE',
        message: 'A candidate #id must have at most one copy origin.',
        nodeId: origin.candidateNodeId,
      });
    } else {
      origins.set(origin.candidateNodeId, origin.sourceNodeId);
    }
  }
  provenanceDiagnostics.push(...validateCopyOrigins(origins, acceptedById, candidateById));
  if (provenanceDiagnostics.length > 0) {
    return rejectedIdentity(provenanceDiagnostics);
  }

  const changes: XnlRichDocumentIdentityChange[] = [];
  const replacementAcceptedIds = new Set<XnlRichDocumentDomainNodeId>();
  const replacementCandidateIds = new Set<XnlRichDocumentDomainNodeId>();

  for (const accepted of acceptedNodes) {
    const candidate = candidateByPath.get(pathKey(accepted.path));
    if (candidate === undefined || candidate.node.nodeId === accepted.node.nodeId) continue;
    if (acceptedById.has(candidate.node.nodeId) || candidateById.has(accepted.node.nodeId)) continue;
    replacementAcceptedIds.add(accepted.node.nodeId);
    replacementCandidateIds.add(candidate.node.nodeId);
    changes.push({
      classification: 'replacement',
      path: accepted.path,
      deletedNodeId: accepted.node.nodeId,
      addedNodeId: candidate.node.nodeId,
      operations: ['delete', 'add'],
      ordinaryIdUpdate: false,
    });
  }

  for (const candidate of candidateNodes) {
    const accepted = acceptedById.get(candidate.node.nodeId);
    if (accepted === undefined) continue;
    const payloadChanged = semanticFingerprint(accepted.node) !== semanticFingerprint(candidate.node);
    if (pathKey(accepted.path) !== pathKey(candidate.path)) {
      changes.push({
        classification: 'move',
        nodeId: candidate.node.nodeId,
        fromPath: accepted.path,
        toPath: candidate.path,
        payloadChanged,
      });
    } else {
      changes.push({
        classification: payloadChanged ? 'update' : 'unchanged',
        nodeId: candidate.node.nodeId,
        path: candidate.path,
      });
    }
  }

  for (const accepted of acceptedNodes) {
    if (!candidateById.has(accepted.node.nodeId) && !replacementAcceptedIds.has(accepted.node.nodeId)) {
      changes.push({ classification: 'delete', nodeId: accepted.node.nodeId, path: accepted.path });
    }
  }
  for (const candidate of candidateNodes) {
    if (acceptedById.has(candidate.node.nodeId) || replacementCandidateIds.has(candidate.node.nodeId)) continue;
    const sourceNodeId = origins.get(candidate.node.nodeId);
    changes.push(sourceNodeId === undefined
      ? { classification: 'new', nodeId: candidate.node.nodeId, path: candidate.path }
      : { classification: 'copy', nodeId: candidate.node.nodeId, sourceNodeId, path: candidate.path });
  }

  changes.sort(compareChanges);
  return deepFreeze({
    status: 'classified',
    accepted: acceptedResult.document,
    candidate: candidateResult.document,
    changes,
  });
}

export function deriveXnlRichDocumentOccurrenceXId(
  _runtime: XnlRichDocumentLogicRuntime,
  input: XnlRichDocumentOccurrenceAddressInput,
  _config: XnlRichDocumentLogicConfig = {},
): XnlRichDocumentOccurrenceAddressResult {
  const safeInput = parseXnlRichDocumentInputRecord(
    input,
    new Set(['nodeId', 'role', 'roleCardinality']),
  );
  if (!safeInput.ok) return rejectedOccurrence(safeInput.diagnostics);

  const nodeId = safeInput.value.nodeId;
  const role = safeInput.value.role;
  const roleCardinality = safeInput.value.roleCardinality;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return rejectedOccurrence([{
      severity: 'error',
      code: 'MISSING_DOMAIN_NODE_ID',
      message: 'Occurrence x-id requires an established persistent Domain #id.',
      path: ['nodeId'],
    }]);
  }
  if (roleCardinality !== 'single' && roleCardinality !== 'multiple') {
    return rejectedOccurrence([{
      severity: 'error',
      code: 'UNSUPPORTED_CONSTRUCT',
      message: 'Occurrence role cardinality must be single or multiple.',
      path: ['roleCardinality'],
      nodeId: nodeId as XnlRichDocumentDomainNodeId,
    }]);
  }
  if (typeof role !== 'string' || (roleCardinality === 'multiple' && role.length === 0)) {
    return rejectedOccurrence([{
      severity: 'error',
      code: 'MISSING_OCCURRENCE_ROLE',
      message: 'A multi-role occurrence requires a non-empty role.',
      path: ['role'],
      nodeId: nodeId as XnlRichDocumentDomainNodeId,
    }]);
  }
  const xId = roleCardinality === 'single'
    ? (isUnnamespacedUriSafeSegment(nodeId) ? nodeId : `xrd-s-${encode(nodeId)}`) as XnlRichDocumentOccurrenceXId
    : `xrd-o-${encode(nodeId)}-${encode(role)}` as XnlRichDocumentOccurrenceXId;
  return deepFreeze({
    status: 'derived',
    nodeId: nodeId as XnlRichDocumentDomainNodeId,
    role,
    xId,
  });
}

interface ParsedCopyOrigins {
  readonly origins: readonly Readonly<{
    candidateNodeId: XnlRichDocumentDomainNodeId;
    sourceNodeId: XnlRichDocumentDomainNodeId;
  }>[];
  readonly diagnostics: readonly XnlRichDocumentDiagnostic[];
}

function parseCopyOrigins(value: XnlRichDocumentSerializableValue | undefined): ParsedCopyOrigins {
  if (value === undefined) return { origins: [], diagnostics: [] };
  if (!Array.isArray(value)) {
    return {
      origins: [],
      diagnostics: [identityProvenanceDiagnostic('Copy origins must be a dense array.', ['copyOrigins'])],
    };
  }

  const origins: Array<{
    candidateNodeId: XnlRichDocumentDomainNodeId;
    sourceNodeId: XnlRichDocumentDomainNodeId;
  }> = [];
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  value.forEach((candidate, index) => {
    const path = ['copyOrigins', index] as const;
    if (!isSerializableRecord(candidate)) {
      diagnostics.push(identityProvenanceDiagnostic('Copy origin must be a plain record.', path));
      return;
    }
    for (const key of Object.keys(candidate)) {
      if (key !== 'candidateNodeId' && key !== 'sourceNodeId') {
        diagnostics.push(identityProvenanceDiagnostic(
          `Copy origin field "${key}" is not supported.`,
          [...path, key],
        ));
      }
    }
    const candidateNodeId = candidate.candidateNodeId;
    const sourceNodeId = candidate.sourceNodeId;
    if (typeof candidateNodeId !== 'string' || candidateNodeId.length === 0) {
      diagnostics.push(identityProvenanceDiagnostic(
        'Copy origin candidateNodeId must be a non-empty Domain #id.',
        [...path, 'candidateNodeId'],
      ));
    }
    if (typeof sourceNodeId !== 'string' || sourceNodeId.length === 0) {
      diagnostics.push(identityProvenanceDiagnostic(
        'Copy origin sourceNodeId must be a non-empty Domain #id.',
        [...path, 'sourceNodeId'],
      ));
    }
    if (typeof candidateNodeId === 'string' && candidateNodeId.length > 0
      && typeof sourceNodeId === 'string' && sourceNodeId.length > 0) {
      origins.push({
        candidateNodeId: candidateNodeId as XnlRichDocumentDomainNodeId,
        sourceNodeId: sourceNodeId as XnlRichDocumentDomainNodeId,
      });
    }
  });
  return { origins, diagnostics };
}

function isSerializableRecord(value: unknown): value is XnlRichDocumentSerializableRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identityProvenanceDiagnostic(
  message: string,
  path: readonly (string | number)[],
): XnlRichDocumentDiagnostic {
  return {
    severity: 'error',
    code: 'INVALID_IDENTITY_PROVENANCE',
    message,
    path,
  };
}

function rejectedIdentity(
  diagnostics: readonly XnlRichDocumentDiagnostic[],
): XnlRichDocumentIdentityClassificationResult {
  const nonEmpty = diagnostics.length > 0 ? diagnostics : [identityProvenanceDiagnostic(
    'Identity classification input was rejected.',
    [],
  )];
  return deepFreeze({
    status: 'rejected',
    diagnostics: nonEmpty as [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
  });
}

function rejectedOccurrence(
  diagnostics: readonly XnlRichDocumentDiagnostic[],
): XnlRichDocumentOccurrenceAddressResult {
  const nonEmpty = diagnostics.length > 0 ? diagnostics : [{
    severity: 'error' as const,
    code: 'LOSSY_CONSTRUCT' as const,
    message: 'Occurrence address input was rejected.',
    path: [],
  }];
  return deepFreeze({
    status: 'rejected',
    diagnostics: nonEmpty as [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
  });
}

function flatten(document: XnlRichDocument): readonly LocatedNode[] {
  const nodes: LocatedNode[] = [];
  const visit = (node: XnlRichDocumentNode, path: readonly (string | number)[]): void => {
    if (node.kind === 'text') return;
    nodes.push({ node, path });
    switch (node.kind) {
      case 'paragraph':
      case 'heading':
      case 'image':
      case 'code-block':
      case 'mermaid':
      case 'component-embed':
      case 'capsule-embed':
        return;
      default:
        node.children.forEach((child, index) => visit(child, [...path, 'children', index]));
    }
  };
  visit(document, []);
  return nodes;
}

function semanticFingerprint(node: LocatedNode['node']): string {
  let value: XnlRichDocumentSerializableValue;
  switch (node.kind) {
    case 'document':
    case 'blockquote':
    case 'bullet-list':
    case 'list-item':
    case 'table':
    case 'table-row':
      value = { kind: node.kind };
      break;
    case 'ordered-list':
      value = { kind: node.kind, ...(node.start === undefined ? {} : { start: node.start }) };
      break;
    case 'table-cell':
    case 'table-header':
      value = {
        kind: node.kind,
        ...(node.colspan === undefined ? {} : { colspan: node.colspan }),
        ...(node.rowspan === undefined ? {} : { rowspan: node.rowspan }),
      };
      break;
    case 'paragraph':
    case 'heading':
      value = {
        kind: node.kind,
        ...('level' in node ? { level: node.level } : {}),
        content: node.content,
      };
      break;
    case 'image':
      value = {
        kind: node.kind,
        src: node.src,
        ...(node.alt === undefined ? {} : { alt: node.alt }),
        ...(node.title === undefined ? {} : { title: node.title }),
      };
      break;
    case 'code-block':
      value = { kind: node.kind, ...(node.language === undefined ? {} : { language: node.language }), text: node.text };
      break;
    case 'mermaid':
      value = { kind: node.kind, source: node.source };
      break;
    case 'component-embed':
      value = {
        kind: node.kind,
        component: node.component,
        ...(node.input === undefined ? {} : { input: node.input }),
      };
      break;
    case 'capsule-embed':
      value = { kind: node.kind, capsule: node.capsule, ...(node.input === undefined ? {} : { input: node.input }) };
      break;
  }
  return JSON.stringify(value);
}

function validateCopyOrigins(
  origins: ReadonlyMap<XnlRichDocumentDomainNodeId, XnlRichDocumentDomainNodeId>,
  acceptedById: ReadonlyMap<XnlRichDocumentDomainNodeId, LocatedNode>,
  candidateById: ReadonlyMap<XnlRichDocumentDomainNodeId, LocatedNode>,
): XnlRichDocumentDiagnostic[] {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  for (const [candidateNodeId, sourceNodeId] of origins) {
    if (!candidateById.has(candidateNodeId)
      || acceptedById.has(candidateNodeId)
      || !acceptedById.has(sourceNodeId)
      || candidateNodeId === sourceNodeId) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_IDENTITY_PROVENANCE',
        message: 'Copy provenance must link a fresh candidate #id to an accepted source #id.',
        nodeId: candidateNodeId,
        details: { sourceNodeId },
      });
    }
  }
  return diagnostics;
}

function prefixDiagnostics(
  prefix: string,
  diagnostics: readonly XnlRichDocumentDiagnostic[],
): XnlRichDocumentDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [prefix, ...(item.path ?? [])] }));
}

function compareChanges(left: XnlRichDocumentIdentityChange, right: XnlRichDocumentIdentityChange): number {
  const leftPath = pathKey(changePath(left));
  const rightPath = pathKey(changePath(right));
  if (leftPath !== rightPath) return leftPath < rightPath ? -1 : 1;
  return left.classification < right.classification ? -1 : left.classification > right.classification ? 1 : 0;
}

function changePath(change: XnlRichDocumentIdentityChange): readonly (string | number)[] {
  return change.classification === 'move' ? change.toPath : change.path;
}

function pathKey(path: readonly (string | number)[]): string {
  return JSON.stringify(path);
}

function encode(value: string): string {
  let encoded = '';
  for (let index = 0; index < value.length; index += 1) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `${value.length.toString(16)}-${encoded}`;
}

function isUnnamespacedUriSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9._~-]+$/.test(value)
    && !value.startsWith('xrd-o-')
    && !value.startsWith('xrd-s-');
}
