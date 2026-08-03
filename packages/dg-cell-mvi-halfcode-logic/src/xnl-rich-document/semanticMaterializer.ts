import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
  type XnlRichDocument,
  type XnlRichDocumentCandidateMaterializer,
  type XnlRichDocumentCopyOrigin,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentInlineRun,
  type XnlRichDocumentMark,
  type XnlRichDocumentNode,
  type XnlRichDocumentSemanticEdit,
  type XnlRichDocumentTable,
  type XnlRichDocumentText,
} from 'dg-cell-mvi-halfcode-contract';
import { classifyXnlRichDocumentIdentity } from './identity';
import {
  deepFreeze,
  parseXnlRichDocumentCandidate,
  parseXnlRichDocumentInputRecord,
} from './normalization';

type Path = readonly (string | number)[];
type RecordValue = Record<string, unknown>;
type PersistentNode = Exclude<XnlRichDocumentNode, { kind: 'text' }>;
type StructuralEdit = Extract<XnlRichDocumentSemanticEdit, {
  kind: 'insert' | 'delete' | 'move';
}>;
type ContentEdit = Extract<XnlRichDocumentSemanticEdit, {
  kind: 'text' | 'mark' | 'code' | 'mermaid-source';
}>;
type TableEdit = Extract<XnlRichDocumentSemanticEdit, { kind: 'table' }>;

type ContentUpdate =
  | Readonly<{ kind: 'inline'; content: readonly XnlRichDocumentText[] }>
  | Readonly<{ kind: 'code'; language: string | null; text: string }>
  | Readonly<{ kind: 'mermaid-source'; source: string }>
  | Readonly<{ kind: 'table'; table: XnlRichDocumentTable }>;

type NodeRecord = {
  key: string;
  kind: string;
  origin: 'accepted' | 'local';
  parentKey?: string;
  acceptedIndex?: number;
  stableNode?: PersistentNode;
  semanticNode?: RecordValue;
  sourceNodeId?: XnlRichDocumentDomainNodeId;
  temporaryId?: XnlRichDocumentDomainNodeId;
  baseChildKeys: string[];
};

type StructuralAction = Readonly<{
  kind: 'delete' | 'move';
  key: string;
}>;

type Placement = Readonly<{
  childKey: string;
  parentKey: string;
  index: number;
  path: Path;
}>;

const STRUCTURAL_EDIT_KINDS = new Set(['insert', 'delete', 'move']);
const CONTENT_EDIT_KINDS = new Set(['text', 'mark', 'code', 'mermaid-source']);
const INLINE_CONTAINER_KINDS = new Set(['paragraph', 'heading']);
const MARK_KINDS = new Set(['bold', 'italic', 'strike', 'code', 'link']);
const PERSISTENT_KINDS = new Set([
  'document',
  'paragraph',
  'heading',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'list-item',
  'image',
  'table',
  'table-row',
  'table-cell',
  'table-header',
  'code-block',
  'mermaid',
  'component-embed',
  'capsule-embed',
]);
const CONTAINER_KINDS = new Set([
  'document',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'list-item',
  'table',
  'table-row',
  'table-cell',
  'table-header',
]);
const BLOCK_KINDS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'image',
  'table',
  'code-block',
  'mermaid',
  'component-embed',
  'capsule-embed',
]);

export const materializeXnlRichDocumentSemanticCandidate: XnlRichDocumentCandidateMaterializer = (
  _runtime,
  input,
  _config,
) => {
  try {
    const safeInput = parseXnlRichDocumentInputRecord(
      input,
      new Set(['accepted', 'command']),
    );
    if (!safeInput.ok) return rejected(safeInput.diagnostics);

    const acceptedResult = parseXnlRichDocumentCandidate(
      {},
      { candidate: safeInput.value.accepted as never },
      {},
    );
    if (acceptedResult.status === 'rejected') {
      return rejected(prefixDiagnostics('accepted', acceptedResult.diagnostics));
    }

    const commandResult = parseSemanticCommand(
      safeInput.value.command,
      acceptedResult.document,
    );
    if (!commandResult.ok) return rejected(commandResult.diagnostics);

    const structuralEdits = commandResult.edits.filter(
      (edit): edit is StructuralEdit => STRUCTURAL_EDIT_KINDS.has(edit.kind),
    );
    const plan = planStructure(acceptedResult.document, structuralEdits);
    if (!plan.ok) return rejected(plan.diagnostics);

    const tablePlan = planTableEdits(commandResult.edits, structuralEdits, plan);
    if (!tablePlan.ok) return rejected(tablePlan.diagnostics);

    plan.localKeys.sort();
    allocateTemporaryIds(plan.localKeys, plan.records, plan.acceptedById);
    const provenanceDiagnostics: XnlRichDocumentDiagnostic[] = [];
    validateCopyClaims(plan.localKeys, plan.records, plan.acceptedById, provenanceDiagnostics);
    if (provenanceDiagnostics.length > 0) return rejected(provenanceDiagnostics);

    const { nodeId: acceptedDocumentNodeId } = acceptedResult.document;
    const tableUpdates = materializeTableUpdates(
      tablePlan.tables,
      plan.records,
      acceptedDocumentNodeId,
    );
    if (!tableUpdates.ok) return rejected(tableUpdates.diagnostics);

    const contentPlan = planContentEdits(
      commandResult.edits,
      plan.records,
      plan.deletedKeys,
      tableUpdates.updates,
    );
    if (!contentPlan.ok) return rejected(contentPlan.diagnostics);

    const assembled = assembleCandidate(
      plan.rootKey,
      plan.records,
      plan.plannedChildren,
      contentPlan.updates,
    );
    const normalized = parseXnlRichDocumentCandidate({}, { candidate: assembled as never }, {});
    if (normalized.status === 'rejected') {
      return rejected(prefixDiagnostics('candidate', normalized.diagnostics));
    }

    const copyOrigins = validateCopyOrigins(
      normalized.document,
      plan.records,
      plan.localKeys,
    );
    if (!copyOrigins.ok) return rejected(copyOrigins.diagnostics);

    const identity = classifyXnlRichDocumentIdentity({}, {
      accepted: acceptedResult.document,
      candidate: normalized.document,
      ...(copyOrigins.origins.length === 0 ? {} : { copyOrigins: copyOrigins.origins }),
    }, {});
    if (identity.status === 'rejected') {
      return rejected(prefixDiagnostics('identity', identity.diagnostics));
    }

    return deepFreeze({
      status: 'materialized',
      candidate: normalized.document,
      ...(copyOrigins.origins.length === 0 ? {} : { copyOrigins: copyOrigins.origins }),
    });
  } catch {
    return rejected([diagnostic(
      'LOSSY_CONSTRUCT',
      'RichDocument semantic command could not be inspected or planned safely.',
    )]);
  }
};

type ParsedCommand =
  | Readonly<{ ok: true; edits: readonly XnlRichDocumentSemanticEdit[] }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

function parseSemanticCommand(value: unknown, accepted: XnlRichDocument): ParsedCommand {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  if (!isRecord(value)) {
    return { ok: false, diagnostics: [diagnostic('LOSSY_CONSTRUCT', 'Command must be a plain record.', ['command'])] };
  }
  checkKeys(value, new Set(['type', 'target', 'payload', 'provenance', 'metadata']), ['command'], diagnostics);
  if (value.type !== XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE) {
    diagnostics.push(diagnostic('UNSUPPORTED_CONSTRUCT', 'Command type is not a RichDocument semantic edit command.', ['command', 'type']));
  }
  if (!isRecord(value.target)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Command target must be a plain record.', ['command', 'target']));
  } else {
    checkKeys(value.target, new Set(['path', 'nodeId', 'tag', 'sourceKind', 'role', 'sourceRef', 'metadata']), ['command', 'target'], diagnostics);
    if (!Array.isArray(value.target.path)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Command target path must be an array.', ['command', 'target', 'path']));
    }
    if (value.target.nodeId !== undefined && value.target.nodeId !== accepted.nodeId) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Command target identity does not match the accepted document root.', ['command', 'target', 'nodeId']));
    }
  }
  if (!isRecord(value.payload)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Command payload must be a plain record.', ['command', 'payload']));
    return { ok: false, diagnostics };
  }
  checkKeys(value.payload, new Set(['version', 'edits']), ['command', 'payload'], diagnostics);
  if (value.payload.version !== XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION) {
    diagnostics.push(diagnostic('UNSUPPORTED_CONSTRUCT', 'Command payload version is unsupported.', ['command', 'payload', 'version']));
  }
  if (!Array.isArray(value.payload.edits) || value.payload.edits.length === 0) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Command payload requires at least one edit.', ['command', 'payload', 'edits']));
    return { ok: false, diagnostics };
  }

  const edits: XnlRichDocumentSemanticEdit[] = [];
  value.payload.edits.forEach((candidate, index) => {
    const path = ['command', 'payload', 'edits', index] as const;
    if (!isRecord(candidate) || typeof candidate.kind !== 'string') {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Semantic edit must be a plain record with a kind.', path));
      return;
    }
    if (STRUCTURAL_EDIT_KINDS.has(candidate.kind)) {
      validateStructuralEdit(candidate, path, diagnostics);
    } else if (CONTENT_EDIT_KINDS.has(candidate.kind)) {
      validateContentEdit(candidate, path, diagnostics);
    } else if (candidate.kind === 'table') {
      validateTableEditHeader(candidate, path, diagnostics);
    } else {
      diagnostics.push(diagnostic(
        'UNSUPPORTED_CONSTRUCT',
        `Semantic edit kind "${candidate.kind}" is unsupported.`,
        [...path, 'kind'],
      ));
      return;
    }
    edits.push(candidate as unknown as XnlRichDocumentSemanticEdit);
  });

  return diagnostics.length === 0
    ? { ok: true, edits }
    : { ok: false, diagnostics };
}

function validateStructuralEdit(
  edit: RecordValue,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (edit.kind === 'insert') {
    checkKeys(edit, new Set(['kind', 'localNodeId', 'parent', 'index', 'node']), path, diagnostics);
    validateLocalId(edit.localNodeId, [...path, 'localNodeId'], diagnostics);
    validateRef(edit.parent, [...path, 'parent'], false, diagnostics);
    validateIndex(edit.index, [...path, 'index'], diagnostics);
    if (!isRecord(edit.node) || edit.node.localNodeId !== edit.localNodeId) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Insert root identity must match edit localNodeId.', [...path, 'node']));
    }
    return;
  }
  if (edit.kind === 'delete') {
    checkKeys(edit, new Set(['kind', 'nodeId', 'parent', 'index']), path, diagnostics);
    validateStableId(edit.nodeId, [...path, 'nodeId'], diagnostics);
    validateRef(edit.parent, [...path, 'parent'], true, diagnostics);
    validateIndex(edit.index, [...path, 'index'], diagnostics);
    return;
  }
  checkKeys(edit, new Set(['kind', 'nodeId', 'from', 'to']), path, diagnostics);
  validateStableId(edit.nodeId, [...path, 'nodeId'], diagnostics);
  validatePlacementSyntax(edit.from, [...path, 'from'], true, diagnostics);
  validatePlacementSyntax(edit.to, [...path, 'to'], false, diagnostics);
}

function validateContentEdit(
  edit: RecordValue,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  validateStableId(edit.nodeId, [...path, 'nodeId'], diagnostics);
  if (edit.kind === 'text') {
    checkKeys(
      edit,
      new Set(['kind', 'nodeId', 'before', 'after', 'beforeInlineRuns', 'afterInlineRuns']),
      path,
      diagnostics,
    );
    validateString(edit.before, [...path, 'before'], diagnostics);
    validateString(edit.after, [...path, 'after'], diagnostics);
    validateInlineRuns(edit.beforeInlineRuns, [...path, 'beforeInlineRuns'], diagnostics);
    validateInlineRuns(edit.afterInlineRuns, [...path, 'afterInlineRuns'], diagnostics);
    if (Array.isArray(edit.beforeInlineRuns)
      && inlineRunText(edit.beforeInlineRuns) !== edit.before) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Text before summary must exactly match beforeInlineRuns.',
        [...path, 'beforeInlineRuns'],
      ));
    }
    if (Array.isArray(edit.afterInlineRuns)
      && inlineRunText(edit.afterInlineRuns) !== edit.after) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Text after summary must exactly match afterInlineRuns.',
        [...path, 'afterInlineRuns'],
      ));
    }
    return;
  }
  if (edit.kind === 'mark') {
    checkKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, diagnostics);
    validateInlineRuns(edit.before, [...path, 'before'], diagnostics);
    validateInlineRuns(edit.after, [...path, 'after'], diagnostics);
    return;
  }
  if (edit.kind === 'code') {
    checkKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, diagnostics);
    validateCodeValue(edit.before, [...path, 'before'], diagnostics);
    validateCodeValue(edit.after, [...path, 'after'], diagnostics);
    return;
  }
  checkKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, diagnostics);
  validateString(edit.before, [...path, 'before'], diagnostics);
  validateString(edit.after, [...path, 'after'], diagnostics);
}

function validateTableEditHeader(
  edit: RecordValue,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  checkKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, diagnostics);
  validateStableId(edit.nodeId, [...path, 'nodeId'], diagnostics);
  for (const key of ['before', 'after'] as const) {
    const snapshot = edit[key];
    if (!isRecord(snapshot)
      || snapshot.kind !== 'table'
      || snapshot.nodeId !== edit.nodeId) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Table ${key} snapshot must identify the edited table root.`,
        [...path, key],
      ));
    }
  }
}

function validateInlineRuns(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Inline runs must be an array.', path));
    return;
  }
  value.forEach((candidate, index) => {
    const runPath = [...path, index];
    if (!isRecord(candidate)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Inline run must be a plain record.', runPath));
      return;
    }
    checkKeys(candidate, new Set(['text', 'marks']), runPath, diagnostics);
    validateString(candidate.text, [...runPath, 'text'], diagnostics);
    validateMarks(candidate.marks, [...runPath, 'marks'], diagnostics);
  });
}

function validateMarks(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Inline run marks must be an array.', path));
    return;
  }
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    const markPath = [...path, index];
    if (!isRecord(candidate)
      || typeof candidate.kind !== 'string'
      || !MARK_KINDS.has(candidate.kind)) {
      diagnostics.push(diagnostic('UNSUPPORTED_CONSTRUCT', 'Inline run mark is unsupported.', markPath));
      return;
    }
    if (seen.has(candidate.kind)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Duplicate inline marks are ambiguous.', markPath));
    }
    seen.add(candidate.kind);
    if (candidate.kind === 'link') {
      checkKeys(candidate, new Set(['kind', 'href', 'title']), markPath, diagnostics);
      if (typeof candidate.href !== 'string' || candidate.href.length === 0) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Link href must be a non-empty string.', [...markPath, 'href']));
      }
      if (candidate.title !== undefined) {
        validateString(candidate.title, [...markPath, 'title'], diagnostics);
      }
    } else {
      checkKeys(candidate, new Set(['kind']), markPath, diagnostics);
    }
  });
}

function validateCodeValue(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Code value must be a plain record.', path));
    return;
  }
  checkKeys(value, new Set(['language', 'text']), path, diagnostics);
  if (value.language !== null) validateString(value.language, [...path, 'language'], diagnostics);
  validateString(value.text, [...path, 'text'], diagnostics);
}

function validateString(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (typeof value !== 'string') {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Semantic content value must be a string.', path));
  }
}

function inlineRunText(value: readonly unknown[]): string {
  return value.map((run) => (isRecord(run) && typeof run.text === 'string' ? run.text : '')).join('');
}

type PlanResult =
  | Readonly<{
      ok: true;
      rootKey: string;
      records: Map<string, NodeRecord>;
      localKeys: string[];
      plannedChildren: ReadonlyMap<string, readonly string[]>;
      deletedKeys: ReadonlySet<string>;
      acceptedById: Map<XnlRichDocumentDomainNodeId, NodeRecord>;
    }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

type PlannedTable = Readonly<{
  edit: TableEdit;
  key: string;
  path: Path;
}>;

type TablePlanResult =
  | Readonly<{ ok: true; tables: readonly PlannedTable[] }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

type TableUpdateResult =
  | Readonly<{ ok: true; updates: ReadonlyMap<string, ContentUpdate> }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

function planTableEdits(
  edits: readonly XnlRichDocumentSemanticEdit[],
  structuralEdits: readonly StructuralEdit[],
  plan: Extract<PlanResult, { ok: true }>,
): TablePlanResult {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  const tables: PlannedTable[] = [];
  const seenTableKeys = new Set<string>();
  const tableEdits = edits.flatMap((edit, index) => (
    edit.kind === 'table' ? [{ edit, index }] : []
  ));

  for (const { edit, index } of tableEdits) {
    const path = ['command', 'payload', 'edits', index] as const;
    const key = stableKey(edit.nodeId);
    const record = plan.records.get(key);
    if (record === undefined || record.kind !== 'table' || record.stableNode?.kind !== 'table') {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Table edit must target an accepted table root.',
        [...path, 'nodeId'],
        edit.nodeId,
      ));
      continue;
    }
    if (seenTableKeys.has(key)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'An accepted table root may have only one table edit per command.',
        path,
        edit.nodeId,
      ));
      continue;
    }
    seenTableKeys.add(key);
    if (plan.deletedKeys.has(key)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Table edit conflicts with a deleted or replaced table root.',
        path,
        edit.nodeId,
      ));
    }
    validateTableStructuralConflicts(key, structuralEdits, plan, path, diagnostics);

    const beforeDiagnostics: XnlRichDocumentDiagnostic[] = [];
    validateTableSnapshotIdentities(
      edit.before as unknown as RecordValue,
      key,
      undefined,
      false,
      plan,
      [...path, 'before'],
      new Set(),
      beforeDiagnostics,
    );
    const before = normalizeSemanticTableSnapshot(
      edit.before as unknown as RecordValue,
      plan.records,
      plan.records.get(plan.rootKey)!.stableNode!.nodeId,
      [...path, 'before'],
      beforeDiagnostics,
    );
    diagnostics.push(...beforeDiagnostics);
    if (before !== undefined && !sameValue(before, record.stableNode)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Table before snapshot does not exactly match the accepted table baseline.',
        [...path, 'before'],
        edit.nodeId,
      ));
    }

    validateTableSnapshotIdentities(
      edit.after as unknown as RecordValue,
      key,
      undefined,
      true,
      plan,
      [...path, 'after'],
      new Set(),
      diagnostics,
    );
    tables.push({ edit, key, path });
  }

  for (let left = 0; left < tables.length; left += 1) {
    for (let right = left + 1; right < tables.length; right += 1) {
      if (isAcceptedAncestor(tables[left]!.key, tables[right]!.key, plan.records)
        || isAcceptedAncestor(tables[right]!.key, tables[left]!.key, plan.records)) {
        diagnostics.push(diagnostic(
          'LOSSY_CONSTRUCT',
          'Ancestor and descendant table edits overlap in one command.',
          tables[right]!.path,
        ));
      }
    }
  }

  return diagnostics.length === 0
    ? { ok: true, tables }
    : { ok: false, diagnostics };
}

function validateTableStructuralConflicts(
  tableKey: string,
  edits: readonly StructuralEdit[],
  plan: Extract<PlanResult, { ok: true }>,
  tablePath: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  for (const edit of edits) {
    if (edit.kind !== 'insert') {
      const sourceKey = stableKey(edit.nodeId);
      if (sourceKey !== tableKey && isAcceptedAncestor(tableKey, sourceKey, plan.records)) {
        diagnostics.push(diagnostic(
          'LOSSY_CONSTRUCT',
          'Table edit conflicts with a structural edit on an accepted table descendant.',
          tablePath,
          edit.nodeId,
        ));
      }
    }
    const destination = edit.kind === 'insert' ? edit.parent : edit.kind === 'move' ? edit.to.parent : undefined;
    const destinationKey = destination === undefined
      ? undefined
      : resolveRef(destination, plan.acceptedById, plan.records);
    if (destinationKey !== undefined
      && (destinationKey === tableKey
        || isPlannedDescendant(tableKey, destinationKey, plan.plannedChildren))) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Table edit conflicts with a structural placement inside the edited table.',
        tablePath,
      ));
    }
  }
}

function isPlannedDescendant(
  ancestorKey: string,
  key: string,
  plannedChildren: ReadonlyMap<string, readonly string[]>,
): boolean {
  const parents = new Map<string, string>();
  for (const [parentKey, childKeys] of plannedChildren) {
    for (const childKey of childKeys) parents.set(childKey, parentKey);
  }
  let cursor = parents.get(key);
  while (cursor !== undefined) {
    if (cursor === ancestorKey) return true;
    cursor = parents.get(cursor);
  }
  return false;
}

function validateTableSnapshotIdentities(
  node: RecordValue,
  tableKey: string,
  parentKey: string | undefined,
  allowLocal: boolean,
  plan: Extract<PlanResult, { ok: true }>,
  path: Path,
  seen: Set<string>,
  diagnostics: XnlRichDocumentDiagnostic[],
): string | undefined {
  if (typeof node.kind !== 'string' || !PERSISTENT_KINDS.has(node.kind)) {
    diagnostics.push(diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      'Table snapshot contains an unsupported persistent node.',
      path,
    ));
    return undefined;
  }

  let key: string | undefined;
  if (typeof node.nodeId === 'string') {
    if (node.localNodeId !== undefined || node.sourceNodeId !== undefined) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Stable table snapshot nodes cannot also carry local or copy identity.',
        path,
      ));
    }
    key = stableKey(node.nodeId as XnlRichDocumentDomainNodeId);
    const accepted = plan.acceptedById.get(node.nodeId as XnlRichDocumentDomainNodeId);
    if (accepted === undefined
      || accepted.kind !== node.kind
      || (key !== tableKey && !isAcceptedAncestor(tableKey, key, plan.records))) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Stable table descendants must align to accepted nodes of the same kind within the table.',
        path,
        node.nodeId as XnlRichDocumentDomainNodeId,
      ));
    }
  } else if (allowLocal && typeof node.localNodeId === 'string') {
    validateLocalId(node.localNodeId, [...path, 'localNodeId'], diagnostics);
    if (node.sourceNodeId !== undefined && typeof node.sourceNodeId !== 'string') {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Copy source identity must be a stable Domain #id.',
        [...path, 'sourceNodeId'],
      ));
    }
    key = localKey(node.localNodeId);
    if (plan.records.has(key)) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Local identity is duplicated across structural and table subtrees.',
        [...path, 'localNodeId'],
      ));
    } else {
      plan.records.set(key, {
        key,
        kind: node.kind,
        origin: 'local',
        parentKey,
        semanticNode: node,
        ...(typeof node.sourceNodeId === 'string'
          ? { sourceNodeId: node.sourceNodeId as XnlRichDocumentDomainNodeId }
          : {}),
        baseChildKeys: [],
      });
      plan.localKeys.push(key);
    }
  } else {
    diagnostics.push(diagnostic(
      'INVALID_IDENTITY_PROVENANCE',
      allowLocal
        ? 'Table snapshot nodes require one stable or local identity.'
        : 'Table before snapshot nodes require accepted stable identity.',
      path,
    ));
  }

  if (key !== undefined) {
    if (seen.has(key)) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Table snapshot identity is duplicated.',
        path,
      ));
    }
    seen.add(key);
  }
  const record = key === undefined ? undefined : plan.records.get(key);
  const children = semanticPersistentChildren(node, path, diagnostics);
  for (const [index, child] of children.entries()) {
    const childKey = validateTableSnapshotIdentities(
      child,
      tableKey,
      key,
      allowLocal,
      plan,
      [...path, 'children', index],
      seen,
      diagnostics,
    );
    if (record?.origin === 'local' && childKey !== undefined) record.baseChildKeys.push(childKey);
  }
  return key;
}

function materializeTableUpdates(
  tables: readonly PlannedTable[],
  records: ReadonlyMap<string, NodeRecord>,
  documentId: XnlRichDocumentDomainNodeId,
): TableUpdateResult {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  const updates = new Map<string, ContentUpdate>();
  for (const table of tables) {
    const normalized = normalizeSemanticTableSnapshot(
      table.edit.after as unknown as RecordValue,
      records,
      documentId,
      [...table.path, 'after'],
      diagnostics,
    );
    if (normalized !== undefined) updates.set(table.key, { kind: 'table', table: normalized });
  }
  return diagnostics.length === 0
    ? { ok: true, updates }
    : { ok: false, diagnostics };
}

function normalizeSemanticTableSnapshot(
  snapshot: RecordValue,
  records: ReadonlyMap<string, NodeRecord>,
  documentId: XnlRichDocumentDomainNodeId,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): XnlRichDocumentTable | undefined {
  const candidate = semanticPersistentNodeToCandidate(snapshot, records, path, diagnostics);
  if (candidate === undefined) return undefined;
  const parsed = parseXnlRichDocumentCandidate({}, {
    candidate: {
      kind: 'document',
      nodeId: documentId,
      children: [candidate],
    } as never,
  }, {});
  if (parsed.status === 'rejected') {
    diagnostics.push(...prefixDiagnostics(path.join('.'), parsed.diagnostics));
    return undefined;
  }
  const { document: normalizedDocument } = parsed;
  const table = normalizedDocument.children[0];
  if (table?.kind !== 'table') {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Table snapshot did not normalize to a table.', path));
    return undefined;
  }
  return table;
}

function semanticPersistentNodeToCandidate(
  node: RecordValue,
  records: ReadonlyMap<string, NodeRecord>,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): RecordValue | undefined {
  const output = cloneValue(node) as RecordValue;
  if (typeof node.nodeId === 'string') {
    output.nodeId = node.nodeId;
  } else if (typeof node.localNodeId === 'string') {
    const record = records.get(localKey(node.localNodeId));
    if (record?.temporaryId === undefined) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Local table identity has no collision-free candidate identity.',
        path,
      ));
      return undefined;
    }
    output.nodeId = record.temporaryId;
  } else {
    return undefined;
  }
  delete output.localNodeId;
  delete output.sourceNodeId;

  if (node.kind === 'component-embed' || node.kind === 'capsule-embed') {
    const reference = {
      ref: output.ref,
      ...(output.version === undefined ? {} : { version: output.version }),
    };
    delete output.ref;
    delete output.version;
    output[node.kind === 'component-embed' ? 'component' : 'capsule'] = reference;
  }
  if (CONTAINER_KINDS.has(String(node.kind)) && Array.isArray(node.children)) {
    output.children = node.children.map((child, index) => (
      isRecord(child)
        ? semanticPersistentNodeToCandidate(child, records, [...path, 'children', index], diagnostics)
        : child
    ));
  }
  return output;
}

type ContentPlanResult =
  | Readonly<{ ok: true; updates: ReadonlyMap<string, ContentUpdate> }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

function planContentEdits(
  edits: readonly XnlRichDocumentSemanticEdit[],
  records: ReadonlyMap<string, NodeRecord>,
  deletedKeys: ReadonlySet<string>,
  initialUpdates: ReadonlyMap<string, ContentUpdate> = new Map(),
): ContentPlanResult {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  const updates = new Map<string, ContentUpdate>(initialUpdates);
  const seenKinds = new Map<string, Set<ContentEdit['kind']>>();
  const tableEdits = edits.filter((edit): edit is TableEdit => edit.kind === 'table');

  for (const [index, edit] of edits.entries()) {
    if (!CONTENT_EDIT_KINDS.has(edit.kind)) continue;
    const contentEdit = edit as ContentEdit;
    const path = ['command', 'payload', 'edits', index] as const;
    const key = stableKey(contentEdit.nodeId);
    const record = records.get(key);
    if (record === undefined) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Content edit target is not present in the accepted baseline.',
        [...path, 'nodeId'],
        contentEdit.nodeId,
      ));
      continue;
    }
    if (deletedKeys.has(key)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Content edit conflicts with a deleted or replaced accepted target.',
        path,
        contentEdit.nodeId,
      ));
      continue;
    }
    const owningTable = tableEdits.find((tableEdit) => {
      const tableKey = stableKey(tableEdit.nodeId);
      return tableKey === key || isAcceptedAncestor(tableKey, key, records);
    });
    if (owningTable !== undefined) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Content edit conflicts with a table edit that owns the target descendant.',
        path,
        contentEdit.nodeId,
      ));
      continue;
    }

    const kinds = seenKinds.get(key) ?? new Set<ContentEdit['kind']>();
    if (kinds.has(contentEdit.kind)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Duplicate ${contentEdit.kind} edits cannot target one accepted node.`,
        path,
        contentEdit.nodeId,
      ));
      continue;
    }
    kinds.add(contentEdit.kind);
    seenKinds.set(key, kinds);

    if (contentEdit.kind === 'text' || contentEdit.kind === 'mark') {
      planInlineEdit(contentEdit, record, key, path, updates, diagnostics);
    } else if (contentEdit.kind === 'code') {
      planCodeEdit(contentEdit, record, key, path, updates, diagnostics);
    } else {
      planMermaidEdit(contentEdit, record, key, path, updates, diagnostics);
    }
  }

  return diagnostics.length === 0
    ? { ok: true, updates }
    : { ok: false, diagnostics };
}

function planInlineEdit(
  edit: Extract<ContentEdit, { kind: 'text' | 'mark' }>,
  record: NodeRecord,
  key: string,
  path: Path,
  updates: Map<string, ContentUpdate>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!INLINE_CONTAINER_KINDS.has(record.kind) || record.stableNode === undefined) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Text and mark edits must target an accepted paragraph or heading.',
      [...path, 'nodeId'],
      edit.nodeId,
    ));
    return;
  }
  const acceptedRuns = inlineRunsFromNode(record.stableNode);
  const before = edit.kind === 'text' ? edit.beforeInlineRuns : edit.before;
  const after = edit.kind === 'text' ? edit.afterInlineRuns : edit.after;
  if (!sameValue(before, acceptedRuns)) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      `${edit.kind} before inline runs do not match the accepted baseline.`,
      [...path, edit.kind === 'text' ? 'beforeInlineRuns' : 'before'],
      edit.nodeId,
    ));
    return;
  }

  const next: ContentUpdate = { kind: 'inline', content: inlineContentFromRuns(after) };
  const existing = updates.get(key);
  if (existing !== undefined && !sameValue(existing, next)) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Text and mark edits for one node must declare the same exact final inline runs.',
      path,
      edit.nodeId,
    ));
    return;
  }
  updates.set(key, next);
}

function planCodeEdit(
  edit: Extract<ContentEdit, { kind: 'code' }>,
  record: NodeRecord,
  key: string,
  path: Path,
  updates: Map<string, ContentUpdate>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (record.kind !== 'code-block' || record.stableNode?.kind !== 'code-block') {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Code edit must target an accepted code block.',
      [...path, 'nodeId'],
      edit.nodeId,
    ));
    return;
  }
  const acceptedValue = {
    language: record.stableNode.language ?? null,
    text: record.stableNode.text,
  };
  if (!sameValue(edit.before, acceptedValue)) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Code before language/text do not match the accepted baseline.',
      [...path, 'before'],
      edit.nodeId,
    ));
    return;
  }
  updates.set(key, { kind: 'code', language: edit.after.language, text: edit.after.text });
}

function planMermaidEdit(
  edit: Extract<ContentEdit, { kind: 'mermaid-source' }>,
  record: NodeRecord,
  key: string,
  path: Path,
  updates: Map<string, ContentUpdate>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (record.kind !== 'mermaid' || record.stableNode?.kind !== 'mermaid') {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Mermaid source edit must target an accepted Mermaid block.',
      [...path, 'nodeId'],
      edit.nodeId,
    ));
    return;
  }
  if (edit.before !== record.stableNode.source) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Mermaid before source does not match the accepted baseline.',
      [...path, 'before'],
      edit.nodeId,
    ));
    return;
  }
  updates.set(key, { kind: 'mermaid-source', source: edit.after });
}

function inlineRunsFromNode(node: PersistentNode): readonly XnlRichDocumentInlineRun[] {
  if (node.kind !== 'paragraph' && node.kind !== 'heading') return [];
  return node.content.map((text) => ({ text: text.text, marks: text.marks ?? [] }));
}

function inlineContentFromRuns(
  runs: readonly XnlRichDocumentInlineRun[],
): readonly XnlRichDocumentText[] {
  return runs.map((run) => ({
    kind: 'text',
    text: run.text,
    ...(run.marks.length === 0
      ? {}
      : { marks: cloneValue(run.marks) as readonly XnlRichDocumentMark[] }),
  }));
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && sameValue(left[key], right[key])
    ));
}

function planStructure(accepted: XnlRichDocument, edits: readonly StructuralEdit[]): PlanResult {
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  const records = new Map<string, NodeRecord>();
  const acceptedById = new Map<XnlRichDocumentDomainNodeId, NodeRecord>();
  const rootKey = registerAccepted(accepted, undefined, undefined, records, acceptedById);

  for (const [index, edit] of edits.entries()) {
    if (edit.kind !== 'insert') continue;
    registerLocalSubtree(
      edit.node as unknown as RecordValue,
      undefined,
      undefined,
      records,
      ['command', 'payload', 'edits', index, 'node'],
      diagnostics,
    );
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const localRecords = [...records.values()].filter((record) => record.origin === 'local');
  const localKeys = localRecords.map((record) => record.key).sort();
  const actions = new Map<string, StructuralAction>();
  const unresolvedPlacements: Array<Readonly<{
    childKey: string;
    parent: unknown;
    index: number;
    path: Path;
  }>> = [];

  for (const [index, edit] of edits.entries()) {
    const path = ['command', 'payload', 'edits', index] as const;
    if (edit.kind === 'insert') {
      const key = localKey(edit.localNodeId);
      const record = records.get(key);
      if (record === undefined || record.parentKey !== undefined) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Insert root has a forged or duplicate local identity.', [...path, 'localNodeId']));
        continue;
      }
      unresolvedPlacements.push({ childKey: key, parent: edit.parent, index: edit.index, path: [...path, 'parent'] });
      continue;
    }

    const record = acceptedById.get(edit.nodeId);
    if (record === undefined || record.key === rootKey) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Structural source identity is unknown or cannot target the document root.', [...path, 'nodeId']));
      continue;
    }
    if (!matchesAcceptedPlacement(record, edit.kind === 'move' ? edit.from : edit)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Structural source parent/index does not match the accepted baseline.', path));
      continue;
    }
    if (actions.has(record.key)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'A persistent node may have only one structural action.', [...path, 'nodeId']));
      continue;
    }
    actions.set(record.key, { kind: edit.kind, key: record.key });
    if (edit.kind === 'move') {
      unresolvedPlacements.push({ childKey: record.key, parent: edit.to.parent, index: edit.to.index, path: [...path, 'to', 'parent'] });
    }
  }

  rejectAncestorActions(actions, records, diagnostics);
  const deleted = collectDeletedKeys(actions, records);
  const placements: Placement[] = [];
  for (const unresolved of unresolvedPlacements) {
    const parentKey = resolveRef(unresolved.parent, acceptedById, records);
    if (parentKey === undefined) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement parent reference is unknown.', unresolved.path));
      continue;
    }
    if (deleted.has(parentKey)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement parent is deleted by the same command.', unresolved.path));
      continue;
    }
    placements.push({ ...unresolved, parentKey });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const placementByChild = new Map(placements.map((placement) => [placement.childKey, placement]));
  const activeKeys = new Set([...records.keys()].filter((key) => !deleted.has(key)));
  const parentOf = new Map<string, string>();
  for (const key of activeKeys) {
    if (key === rootKey) continue;
    const record = records.get(key)!;
    const placement = placementByChild.get(key);
    const parentKey = placement?.parentKey ?? record.parentKey;
    if (parentKey === undefined || !activeKeys.has(parentKey)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final structural node is disconnected from the accepted root.'));
      continue;
    }
    parentOf.set(key, parentKey);
    const parent = records.get(parentKey)!;
    if (!allowsChild(parent.kind, record.kind)) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', `RichDocument ${record.kind} cannot be placed in ${parent.kind}.`, placement?.path));
    }
  }
  rejectCycles(activeKeys, rootKey, parentOf, diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const plannedChildren = new Map<string, readonly string[]>();
  for (const parentKey of activeKeys) {
    const parent = records.get(parentKey)!;
    if (!CONTAINER_KINDS.has(parent.kind)) continue;
    const base = parent.baseChildKeys.filter((childKey) => (
      activeKeys.has(childKey)
      && parentOf.get(childKey) === parentKey
      && !placementByChild.has(childKey)
    ));
    const incoming = placements.filter((placement) => placement.parentKey === parentKey);
    const finalCount = base.length + incoming.length;
    const slots: Array<string | undefined> = Array.from({ length: finalCount });
    for (const placement of incoming) {
      if (placement.index >= finalCount) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement index is outside the planned child range.', placement.path));
      } else if (slots[placement.index] !== undefined) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Two structural edits claim the same final placement slot.', placement.path));
      } else {
        slots[placement.index] = placement.childKey;
      }
    }
    let baseIndex = 0;
    for (let index = 0; index < slots.length; index += 1) {
      if (slots[index] === undefined) slots[index] = base[baseIndex++];
    }
    if (slots.some((key) => key === undefined) || baseIndex !== base.length) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement plan could not be assembled without ambiguity.'));
    }
    plannedChildren.set(parentKey, slots.filter((key): key is string => key !== undefined));
  }

  return diagnostics.length === 0
    ? {
        ok: true,
        rootKey,
        records,
        localKeys,
        plannedChildren,
        deletedKeys: deleted,
        acceptedById,
      }
    : { ok: false, diagnostics };
}

function registerAccepted(
  node: PersistentNode,
  parentKey: string | undefined,
  index: number | undefined,
  records: Map<string, NodeRecord>,
  acceptedById: Map<XnlRichDocumentDomainNodeId, NodeRecord>,
): string {
  const key = stableKey(node.nodeId);
  const record: NodeRecord = {
    key,
    kind: node.kind,
    origin: 'accepted',
    parentKey,
    acceptedIndex: index,
    stableNode: node,
    baseChildKeys: [],
  };
  records.set(key, record);
  acceptedById.set(node.nodeId, record);
  for (const [childIndex, child] of persistentChildren(node).entries()) {
    record.baseChildKeys.push(registerAccepted(child, key, childIndex, records, acceptedById));
  }
  return key;
}

function registerLocalSubtree(
  node: RecordValue,
  parentKey: string | undefined,
  index: number | undefined,
  records: Map<string, NodeRecord>,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): string | undefined {
  if (typeof node.kind !== 'string' || !PERSISTENT_KINDS.has(node.kind)) {
    diagnostics.push(diagnostic('UNSUPPORTED_CONSTRUCT', 'Inserted semantic subtree contains an unsupported persistent node.', path));
    return undefined;
  }
  if (node.nodeId !== undefined
    || typeof node.localNodeId !== 'string'
    || !node.localNodeId.startsWith('local:')
    || node.localNodeId.length === 'local:'.length) {
    diagnostics.push(diagnostic('INVALID_IDENTITY_PROVENANCE', 'Inserted persistent nodes must use only canonical local identity.', path));
    return undefined;
  }
  if (node.sourceNodeId !== undefined && typeof node.sourceNodeId !== 'string') {
    diagnostics.push(diagnostic('INVALID_IDENTITY_PROVENANCE', 'Copy source identity must be a stable Domain #id.', [...path, 'sourceNodeId']));
  }
  const key = localKey(node.localNodeId);
  if (records.has(key)) {
    diagnostics.push(diagnostic('INVALID_IDENTITY_PROVENANCE', 'Local identity is duplicated across inserted subtrees.', [...path, 'localNodeId']));
    return key;
  }
  const record: NodeRecord = {
    key,
    kind: node.kind,
    origin: 'local',
    parentKey,
    acceptedIndex: index,
    semanticNode: node,
    ...(typeof node.sourceNodeId === 'string'
      ? { sourceNodeId: node.sourceNodeId as XnlRichDocumentDomainNodeId }
      : {}),
    baseChildKeys: [],
  };
  records.set(key, record);
  const children = semanticPersistentChildren(node, path, diagnostics);
  for (const [childIndex, child] of children.entries()) {
    const childKey = registerLocalSubtree(
      child,
      key,
      childIndex,
      records,
      [...path, 'children', childIndex],
      diagnostics,
    );
    if (childKey !== undefined) record.baseChildKeys.push(childKey);
  }
  return key;
}

function allocateTemporaryIds(
  localKeys: readonly string[],
  records: Map<string, NodeRecord>,
  acceptedById: ReadonlyMap<XnlRichDocumentDomainNodeId, NodeRecord>,
): void {
  const reserved = new Set<string>([
    ...acceptedById.keys(),
    ...localKeys.flatMap((key) => {
      const temporaryId = records.get(key)?.temporaryId;
      return temporaryId === undefined ? [] : [temporaryId];
    }),
  ]);
  let sequence = 0;
  for (const key of localKeys) {
    if (records.get(key)?.temporaryId !== undefined) continue;
    let candidate = `xnl-temporary:${sequence}`;
    while (reserved.has(candidate)) {
      sequence += 1;
      candidate = `xnl-temporary:${sequence}`;
    }
    records.get(key)!.temporaryId = candidate as XnlRichDocumentDomainNodeId;
    reserved.add(candidate);
    sequence += 1;
  }
}

function validateCopyClaims(
  localKeys: readonly string[],
  records: ReadonlyMap<string, NodeRecord>,
  acceptedById: ReadonlyMap<XnlRichDocumentDomainNodeId, NodeRecord>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  for (const key of localKeys) {
    const local = records.get(key)!;
    if (local.sourceNodeId === undefined) continue;
    const source = acceptedById.get(local.sourceNodeId);
    if (source === undefined || source.kind !== local.kind) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Copy provenance must reference an accepted node of the same kind.',
        undefined,
        local.sourceNodeId,
      ));
    }
  }
}

function rejectAncestorActions(
  actions: ReadonlyMap<string, StructuralAction>,
  records: ReadonlyMap<string, NodeRecord>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  const keys = [...actions.keys()];
  for (let left = 0; left < keys.length; left += 1) {
    for (let right = left + 1; right < keys.length; right += 1) {
      if (isAcceptedAncestor(keys[left]!, keys[right]!, records)
        || isAcceptedAncestor(keys[right]!, keys[left]!, records)) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Ancestor and descendant structural actions conflict in one command.'));
      }
    }
  }
}

function collectDeletedKeys(
  actions: ReadonlyMap<string, StructuralAction>,
  records: ReadonlyMap<string, NodeRecord>,
): Set<string> {
  const deleted = new Set<string>();
  const visit = (key: string): void => {
    if (deleted.has(key)) return;
    deleted.add(key);
    for (const childKey of records.get(key)?.baseChildKeys ?? []) visit(childKey);
  };
  for (const action of actions.values()) if (action.kind === 'delete') visit(action.key);
  return deleted;
}

function rejectCycles(
  activeKeys: ReadonlySet<string>,
  rootKey: string,
  parentOf: ReadonlyMap<string, string>,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  for (const key of activeKeys) {
    const seen = new Set<string>();
    let cursor: string | undefined = key;
    while (cursor !== undefined && cursor !== rootKey) {
      if (seen.has(cursor)) {
        diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement plan contains a cyclic or self move.'));
        return;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
    if (cursor !== rootKey) {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Final placement plan is not rooted in the accepted tree.'));
      return;
    }
  }
}

function assembleCandidate(
  key: string,
  records: ReadonlyMap<string, NodeRecord>,
  plannedChildren: ReadonlyMap<string, readonly string[]>,
  contentUpdates: ReadonlyMap<string, ContentUpdate>,
): unknown {
  const record = records.get(key)!;
  const source = record.origin === 'accepted' ? record.stableNode! : record.semanticNode!;
  const output = cloneValue(source) as RecordValue;
  if (record.origin === 'local') {
    delete output.localNodeId;
    delete output.sourceNodeId;
    delete output.nodeId;
    output.nodeId = record.temporaryId!;
    if (record.kind === 'component-embed' || record.kind === 'capsule-embed') {
      const reference = {
        ref: output.ref,
        ...(output.version === undefined ? {} : { version: output.version }),
      };
      delete output.ref;
      delete output.version;
      output[record.kind === 'component-embed' ? 'component' : 'capsule'] = reference;
    }
  }
  const contentUpdate = contentUpdates.get(key);
  if (contentUpdate?.kind === 'table') {
    return cloneValue(contentUpdate.table);
  }
  if (contentUpdate?.kind === 'inline') {
    output.content = cloneValue(contentUpdate.content);
  } else if (contentUpdate?.kind === 'code') {
    if (contentUpdate.language === null) delete output.language;
    else output.language = contentUpdate.language;
    output.text = contentUpdate.text;
  } else if (contentUpdate?.kind === 'mermaid-source') {
    output.source = contentUpdate.source;
  }
  if (CONTAINER_KINDS.has(record.kind)) {
    output.children = (plannedChildren.get(key) ?? []).map((childKey) => (
      assembleCandidate(childKey, records, plannedChildren, contentUpdates)
    ));
  }
  return output;
}

type CopyOriginResult =
  | Readonly<{ ok: true; origins: readonly XnlRichDocumentCopyOrigin[] }>
  | Readonly<{ ok: false; diagnostics: readonly XnlRichDocumentDiagnostic[] }>;

function validateCopyOrigins(
  candidate: XnlRichDocument,
  records: ReadonlyMap<string, NodeRecord>,
  localKeys: readonly string[],
): CopyOriginResult {
  const candidateById = flattenById(candidate);
  const localByTemporaryId = new Map(localKeys.flatMap((key) => {
    const record = records.get(key)!;
    return record.temporaryId === undefined ? [] : [[record.temporaryId, record] as const];
  }));
  const origins: XnlRichDocumentCopyOrigin[] = [];
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  for (const key of localKeys) {
    const local = records.get(key)!;
    if (local.sourceNodeId === undefined) continue;
    const source = records.get(stableKey(local.sourceNodeId))?.stableNode;
    const candidateNode = local.temporaryId === undefined
      ? undefined
      : candidateById.get(local.temporaryId);
    if (source === undefined
      || candidateNode === undefined
      || JSON.stringify(withoutPersistentIdentities(candidateNode))
        !== JSON.stringify(withoutPersistentIdentities(source))) {
      diagnostics.push(diagnostic(
        'INVALID_IDENTITY_PROVENANCE',
        'Copy provenance does not exactly describe the accepted source semantics.',
        undefined,
        local.temporaryId,
      ));
      continue;
    }
    const coverageDiagnostic = validateCopiedSubtreeCoverage(
      candidateNode,
      source,
      localByTemporaryId,
    );
    if (coverageDiagnostic !== undefined) {
      diagnostics.push(coverageDiagnostic);
      continue;
    }
    origins.push({ candidateNodeId: local.temporaryId!, sourceNodeId: local.sourceNodeId });
  }
  return diagnostics.length === 0 ? { ok: true, origins } : { ok: false, diagnostics };
}

function validateCopiedSubtreeCoverage(
  candidate: PersistentNode,
  source: PersistentNode,
  localByTemporaryId: ReadonlyMap<XnlRichDocumentDomainNodeId, NodeRecord>,
): XnlRichDocumentDiagnostic | undefined {
  const local = localByTemporaryId.get(candidate.nodeId);
  if (local === undefined || local.sourceNodeId !== source.nodeId) {
    return diagnostic(
      'INVALID_IDENTITY_PROVENANCE',
      'Every persistent node in a copied subtree must carry its exact accepted source identity.',
      undefined,
      candidate.nodeId,
    );
  }
  const candidateChildren = persistentChildren(candidate);
  const sourceChildren = persistentChildren(source);
  for (let index = 0; index < candidateChildren.length; index += 1) {
    const childDiagnostic = validateCopiedSubtreeCoverage(
      candidateChildren[index]!,
      sourceChildren[index]!,
      localByTemporaryId,
    );
    if (childDiagnostic !== undefined) return childDiagnostic;
  }
  return undefined;
}

function persistentChildren(node: PersistentNode): readonly PersistentNode[] {
  switch (node.kind) {
    case 'document':
    case 'blockquote':
    case 'bullet-list':
    case 'ordered-list':
    case 'list-item':
    case 'table':
    case 'table-row':
    case 'table-cell':
    case 'table-header':
      return node.children as readonly PersistentNode[];
    default:
      return [];
  }
}

function semanticPersistentChildren(
  node: RecordValue,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): readonly RecordValue[] {
  if (!CONTAINER_KINDS.has(String(node.kind))) return [];
  if (!Array.isArray(node.children)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Inserted container requires a children array.', [...path, 'children']));
    return [];
  }
  return node.children.flatMap((child, index) => {
    if (!isRecord(child) || child.kind === 'text') {
      diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Inserted structural children must be persistent semantic nodes.', [...path, 'children', index]));
      return [];
    }
    return [child];
  });
}

function matchesAcceptedPlacement(
  record: NodeRecord,
  placement: Readonly<{ parent: unknown; index: number }>,
): boolean {
  if (!isRecord(placement.parent)
    || placement.parent.kind !== 'stable'
    || typeof placement.parent.nodeId !== 'string') return false;
  return record.parentKey === stableKey(placement.parent.nodeId as XnlRichDocumentDomainNodeId)
    && record.acceptedIndex === placement.index;
}

function resolveRef(
  value: unknown,
  acceptedById: ReadonlyMap<XnlRichDocumentDomainNodeId, NodeRecord>,
  records: ReadonlyMap<string, NodeRecord>,
): string | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'stable' && typeof value.nodeId === 'string') {
    return acceptedById.get(value.nodeId as XnlRichDocumentDomainNodeId)?.key;
  }
  if (value.kind === 'local' && typeof value.localNodeId === 'string') {
    const key = localKey(value.localNodeId);
    return records.has(key) ? key : undefined;
  }
  return undefined;
}

function isAcceptedAncestor(
  possibleAncestor: string,
  key: string,
  records: ReadonlyMap<string, NodeRecord>,
): boolean {
  let cursor = records.get(key)?.parentKey;
  while (cursor !== undefined) {
    if (cursor === possibleAncestor) return true;
    cursor = records.get(cursor)?.parentKey;
  }
  return false;
}

function allowsChild(parentKind: string, childKind: string): boolean {
  switch (parentKind) {
    case 'document':
    case 'blockquote':
    case 'list-item':
    case 'table-cell':
    case 'table-header':
      return BLOCK_KINDS.has(childKind);
    case 'bullet-list':
    case 'ordered-list':
      return childKind === 'list-item';
    case 'table':
      return childKind === 'table-row';
    case 'table-row':
      return childKind === 'table-cell' || childKind === 'table-header';
    default:
      return false;
  }
}

function flattenById(document: XnlRichDocument): Map<XnlRichDocumentDomainNodeId, PersistentNode> {
  const result = new Map<XnlRichDocumentDomainNodeId, PersistentNode>();
  const visit = (node: PersistentNode): void => {
    result.set(node.nodeId, node);
    for (const child of persistentChildren(node)) visit(child);
  };
  visit(document);
  return result;
}

function withoutPersistentIdentities(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPersistentIdentities);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => (
    key === 'nodeId' ? [] : [[key, withoutPersistentIdentities(child)]]
  )));
}

function validatePlacementSyntax(
  value: unknown,
  path: Path,
  stableOnly: boolean,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Structural placement must be a plain record.', path));
    return;
  }
  checkKeys(value, new Set(['parent', 'index']), path, diagnostics);
  validateRef(value.parent, [...path, 'parent'], stableOnly, diagnostics);
  validateIndex(value.index, [...path, 'index'], diagnostics);
}

function validateRef(
  value: unknown,
  path: Path,
  stableOnly: boolean,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Node reference must be a plain record.', path));
    return;
  }
  if (value.kind === 'stable') {
    checkKeys(value, new Set(['kind', 'nodeId']), path, diagnostics);
    validateStableId(value.nodeId, [...path, 'nodeId'], diagnostics);
  } else if (!stableOnly && value.kind === 'local') {
    checkKeys(value, new Set(['kind', 'localNodeId']), path, diagnostics);
    validateLocalId(value.localNodeId, [...path, 'localNodeId'], diagnostics);
  } else {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Node reference kind is invalid for this placement.', [...path, 'kind']));
  }
}

function validateStableId(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(diagnostic('MISSING_DOMAIN_NODE_ID', 'Stable identity must be a non-empty Domain #id.', path));
  }
}

function validateLocalId(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (typeof value !== 'string' || !value.startsWith('local:') || value.length === 'local:'.length) {
    diagnostics.push(diagnostic('INVALID_IDENTITY_PROVENANCE', 'Local identity must use the non-empty local: namespace.', path));
  }
}

function validateIndex(
  value: unknown,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Structural index must be a safe non-negative integer.', path));
  }
}

function checkKeys(
  value: RecordValue,
  allowed: ReadonlySet<string>,
  path: Path,
  diagnostics: XnlRichDocumentDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) diagnostics.push(diagnostic('LOSSY_CONSTRUCT', `Field "${key}" is not allowed here.`, [...path, key]));
  }
}

function prefixDiagnostics(
  prefix: string,
  diagnostics: readonly XnlRichDocumentDiagnostic[],
): XnlRichDocumentDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [prefix, ...(item.path ?? [])] }));
}

function rejected(diagnostics: readonly XnlRichDocumentDiagnostic[]) {
  const nonEmpty = diagnostics.length === 0
    ? [diagnostic('LOSSY_CONSTRUCT', 'RichDocument structural materialization was rejected.')]
    : diagnostics;
  return deepFreeze({
    status: 'rejected' as const,
    diagnostics: nonEmpty as readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
  });
}

function diagnostic(
  code: XnlRichDocumentDiagnostic['code'],
  message: string,
  path?: Path,
  nodeId?: XnlRichDocumentDomainNodeId,
): XnlRichDocumentDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    ...(path === undefined ? {} : { path }),
    ...(nodeId === undefined ? {} : { nodeId }),
  };
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableKey(nodeId: XnlRichDocumentDomainNodeId): string {
  return `stable:${nodeId}`;
}

function localKey(localNodeId: string): string {
  return `local:${localNodeId}`;
}
