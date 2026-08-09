import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transaction } from '@tiptap/pm/state';
import {
  XNL_RICH_DOCUMENT_MARK_KINDS,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentMark,
  type XnlRichDocumentNodeAttributes,
  type XnlRichDocumentSerializableRecord,
  type XnlRichDocumentSerializableValue,
  type XnlRichDocumentSemanticBlockNode,
  type XnlRichDocumentSemanticInlineNode,
  type XnlRichDocumentSemanticListItem,
  type XnlRichDocumentSemanticTaskItem,
  type XnlRichDocumentTextAlignment,
} from 'dg-cell-mvi-halfcode-contract';
import { parseXnlRichDocumentCandidate } from 'dg-cell-mvi-halfcode-logic';
import {
  XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
  type XnlRichDocumentTiptapDiagnostic,
  type XnlRichDocumentTiptapInlineRun,
  type XnlRichDocumentTiptapInteractionIntent,
  type XnlRichDocumentTiptapNodeRef,
  type XnlRichDocumentTiptapSemanticEdit,
  type XnlRichDocumentTiptapSemanticNode,
  type XnlRichDocumentTiptapStableNodeRef,
  type XnlRichDocumentTiptapTransactionProcessor,
  type XnlRichDocumentTiptapTransactionResult,
} from './types';

type Path = readonly number[];

type LocatedNode = {
  node: ProseMirrorNode;
  path: Path;
  position: number;
  parent?: LocatedNode;
  index: number;
  claimedNodeId?: XnlRichDocumentDomainNodeId;
  sourceNodeId?: XnlRichDocumentDomainNodeId;
  identity?: XnlRichDocumentTiptapNodeRef;
};

type DocumentIndex = Readonly<{
  root: LocatedNode;
  nodes: readonly LocatedNode[];
  stableById: ReadonlyMap<XnlRichDocumentDomainNodeId, LocatedNode>;
}>;

type BuildContext = {
  diagnostics: XnlRichDocumentTiptapDiagnostic[];
  localSequence: number;
};

type TrustedTransactionSnapshot = Readonly<{
  docChanged: boolean;
  selectionSet: boolean;
  metadataPresent: boolean;
  before: ProseMirrorNode;
  doc: ProseMirrorNode;
  mapping: Transaction['mapping'];
}>;

const INPUT_KEYS = new Set(['transaction', 'composition']);
const CONFIG_KEYS = new Set(['schemaId', 'extensionIds', 'planNodeId']);
const TRANSACTION_OWN_KEYS = new Set([
  'doc',
  'steps',
  'docs',
  'mapping',
  'curSelectionFor',
  'updated',
  'meta',
  'time',
  'curSelection',
  'storedMarks',
]);
const SUPPORTED_NODE_TYPES = new Set([
  'doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
  'taskList', 'taskItem', 'horizontalRule', 'image', 'table', 'tableRow', 'tableCell',
  'tableHeader', 'codeBlock', 'mermaid', 'componentEmbed', 'capsuleEmbed', 'hardBreak', 'text',
]);
const TABLE_NODE_TYPES = new Set(['table', 'tableRow', 'tableCell', 'tableHeader']);
const TEXT_CONTAINER_TYPES = new Set(['paragraph', 'heading']);
const MARK_TYPES = new Set([
  'bold', 'italic', 'strike', 'underline', 'code', 'link', 'textStyle', 'highlight',
]);
const CANONICAL_MARK_ORDER = new Map(
  XNL_RICH_DOCUMENT_MARK_KINDS.map((kind, index) => [kind, index]),
);
const AUTHORITY_METADATA_KEYS = new Set([
  'allocator',
  'baseliverevision',
  'command',
  'currentrevision',
  'identityallocator',
  'proposal',
  'revision',
  'session',
  'submit',
  'translator',
  'valuehost',
  'vcs',
  'vfs',
  'writer',
]);

export const normalizeTiptapTransaction: XnlRichDocumentTiptapTransactionProcessor = (
  runtime,
  input,
  config,
) => {
  let boundary: XnlRichDocumentTiptapDiagnostic[] | undefined;
  try {
    boundary = validateBoundary(runtime, input, config);
  } catch {
    return rejected(diagnostic(
      'INVALID_TIPTAP_TRANSACTION',
      'Normalizer boundaries could not be inspected safely.',
    ));
  }
  if (boundary !== undefined) return rejected(boundary);

  const inspected = inspectConcreteTransaction(ownData(input, 'transaction'));
  if ('diagnostic' in inspected) return rejected(inspected.diagnostic);
  const transaction = inspected.snapshot;

  if (!transaction.docChanged) {
    const reason = transaction.selectionSet
      ? 'selection-only'
      : transaction.metadataPresent
        ? 'metadata-only'
        : 'no-document-change';
    return deepFreeze({ status: 'silent', reason });
  }
  if (ownData(input, 'composition') === 'intermediate') {
    return deepFreeze({ status: 'silent', reason: 'intermediate-composition' });
  }

  const context: BuildContext = { diagnostics: [], localSequence: 0 };
  let before: DocumentIndex;
  let after: DocumentIndex;
  try {
    transaction.before.check();
    transaction.doc.check();
    before = indexBefore(transaction.before, context);
    after = indexAfter(transaction.doc, before, context, transaction.mapping);
  } catch (error) {
    context.diagnostics.push(diagnostic(
      'INVALID_TIPTAP_TRANSACTION',
      `Transaction document is invalid: ${errorMessage(error)}`,
    ));
    return rejected(context.diagnostics);
  }
  if (context.diagnostics.length > 0) return rejected(context.diagnostics);

  const edits = collectSemanticEdits(before, after, context);
  if (context.diagnostics.length > 0) return rejected(context.diagnostics);
  if (edits.length === 0) {
    return rejected(diagnostic(
      'UNSUPPORTED_TIPTAP_TRANSACTION',
      'The document changed without a supported semantic edit.',
    ));
  }

  const planNodeId = ownData(config, 'planNodeId');
  const intent: XnlRichDocumentTiptapInteractionIntent = {
    kind: 'interaction',
    proposal: {
      type: 'xnl.rich-document.edit',
      target: { planNodeId: planNodeId as string },
      payload: { version: 1, edits },
      provenance: {
        adapter: 'tiptap',
        documentChanged: true,
        operationKinds: [...new Set(edits.map((edit) => edit.kind))],
      },
    },
  };
  return deepFreeze({ status: 'normalized', intent });
};

function validateBoundary(runtime: unknown, input: unknown, config: unknown): XnlRichDocumentTiptapDiagnostic[] | undefined {
  const diagnostics: XnlRichDocumentTiptapDiagnostic[] = [];
  if (!isPlainRecord(runtime) || Reflect.ownKeys(Object.getOwnPropertyDescriptors(runtime)).length !== 0) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_TRANSACTION', 'Normalizer runtime must be an empty plain record.'));
  }
  validateExactRecord(input, INPUT_KEYS, 'Transaction input', diagnostics);
  validateExactRecord(config, CONFIG_KEYS, 'Transaction config', diagnostics);
  if (isPlainRecord(input)) {
    const composition = ownData(input, 'composition');
    if (composition !== undefined && composition !== 'intermediate' && composition !== 'settled') {
      diagnostics.push(diagnostic('INVALID_TIPTAP_TRANSACTION', 'Composition must be intermediate or settled.'));
    }
  }
  if (isPlainRecord(config)) {
    const schemaId = ownData(config, 'schemaId');
    const planNodeId = ownData(config, 'planNodeId');
    const extensionIds = ownData(config, 'extensionIds');
    if (schemaId !== XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID) {
      diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_SCHEMA', 'Transaction config uses an unsupported schema.'));
    }
    if (typeof planNodeId !== 'string' || planNodeId.length === 0) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_TRANSACTION', 'Transaction config requires a non-empty planNodeId.'));
    }
    if (!isCanonicalExtensionRegistry(extensionIds)) {
      diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_SCHEMA', 'Transaction config must use the canonical extension registry.'));
    }
  }
  return diagnostics.length > 0 ? diagnostics : undefined;
}

function validateExactRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
  diagnostics: XnlRichDocumentTiptapDiagnostic[],
): void {
  if (!isPlainRecord(value)) {
    diagnostics.push(diagnostic('INVALID_TIPTAP_TRANSACTION', `${label} must be a plain record.`));
    return;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if (typeof key !== 'string' || !allowedKeys.has(key) || !descriptor.enumerable || !('value' in descriptor)) {
      diagnostics.push(diagnostic('INVALID_TIPTAP_TRANSACTION', `${label} contains an unsupported or accessor-backed field.`));
    }
  }
}

function isCanonicalExtensionRegistry(value: unknown): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined
    || !('value' in lengthDescriptor)
    || lengthDescriptor.value !== XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.length
    || keys.length !== XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.length + 1) {
    return false;
  }
  return XNL_RICH_DOCUMENT_TIPTAP_EXTENSION_IDS.every((expected, index) => {
    const descriptor = descriptors[String(index)];
    return descriptor !== undefined
      && 'value' in descriptor
      && descriptor.enumerable
      && descriptor.value === expected;
  });
}

function validateTransactionMetadata(
  metadata: unknown,
): XnlRichDocumentTiptapDiagnostic | undefined {
  if (metadata === undefined) return undefined;
  if (!isPlainRecord(metadata)) {
    return diagnostic('INVALID_TIPTAP_TRANSACTION', 'Transaction metadata must be a plain record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(metadata);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (typeof key !== 'string'
      || descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)) {
      return diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        'Transaction metadata contains an unsupported or accessor-backed field.',
      );
    }
    const normalizedKey = key.toLowerCase();
    if (AUTHORITY_METADATA_KEYS.has(normalizedKey)
      || (normalizedKey === 'kind' && descriptor.value === 'command')) {
      return diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        `Transaction metadata cannot route authority through "${key}".`,
      );
    }
  }
  return undefined;
}

function inspectConcreteTransaction(
  value: unknown,
): { snapshot: TrustedTransactionSnapshot } | { diagnostic: XnlRichDocumentTiptapDiagnostic } {
  try {
    if (!(value instanceof Transaction) || Object.getPrototypeOf(value) !== Transaction.prototype) {
      return {
        diagnostic: diagnostic(
          'INVALID_TIPTAP_TRANSACTION',
          'Transaction input must be a concrete ProseMirror Transaction.',
        ),
      };
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== TRANSACTION_OWN_KEYS.size) {
      return { diagnostic: invalidTransactionShapeDiagnostic() };
    }
    for (const key of keys) {
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (typeof key !== 'string'
        || !TRANSACTION_OWN_KEYS.has(key)
        || descriptor === undefined
        || !descriptor.enumerable
        || !descriptor.configurable
        || !('value' in descriptor)
        || !descriptor.writable) {
        return { diagnostic: invalidTransactionShapeDiagnostic() };
      }
    }

    const doc = descriptorValue<ProseMirrorNode>(descriptors, 'doc');
    const steps = descriptorValue<Transaction['steps']>(descriptors, 'steps');
    const docs = descriptorValue<readonly ProseMirrorNode[]>(descriptors, 'docs');
    const mapping = descriptorValue<Transaction['mapping']>(descriptors, 'mapping');
    const meta = descriptorValue<unknown>(descriptors, 'meta');
    if (!isStandardDenseArray(steps)
      || !isStandardDenseArray(docs)
      || !isPlainRecord(meta)) {
      return { diagnostic: invalidTransactionShapeDiagnostic() };
    }
    const metadataDiagnostic = validateTransactionMetadata(meta);
    if (metadataDiagnostic !== undefined) return { diagnostic: metadataDiagnostic };

    const transformPrototype = Object.getPrototypeOf(Transaction.prototype);
    const docChanged = callTrustedGetter<boolean>(transformPrototype, 'docChanged', value);
    const before = callTrustedGetter<ProseMirrorNode>(transformPrototype, 'before', value);
    const selectionSet = callTrustedGetter<boolean>(Transaction.prototype, 'selectionSet', value);
    if (typeof docChanged !== 'boolean' || typeof selectionSet !== 'boolean') {
      return { diagnostic: invalidTransactionShapeDiagnostic() };
    }

    return {
      snapshot: {
        docChanged,
        selectionSet,
        metadataPresent: Reflect.ownKeys(meta).length > 0,
        before,
        doc,
        mapping,
      },
    };
  } catch {
    return {
      diagnostic: diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        'Transaction input could not be inspected safely.',
      ),
    };
  }
}

function invalidTransactionShapeDiagnostic(): XnlRichDocumentTiptapDiagnostic {
  return diagnostic(
    'INVALID_TIPTAP_TRANSACTION',
    'Transaction input contains unsupported, symbolic, or accessor-backed instance state.',
  );
}

function descriptorValue<T>(
  descriptors: Readonly<Record<string, PropertyDescriptor | undefined>>,
  key: string,
): T {
  const descriptor = descriptors[key];
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new TypeError(`Missing trusted transaction field "${key}".`);
  }
  return descriptor.value as T;
}

function callTrustedGetter<T>(prototype: object, key: string, receiver: Transaction): T {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
  if (descriptor?.get === undefined) {
    throw new TypeError(`Missing trusted Transaction getter "${key}".`);
  }
  return descriptor.get.call(receiver) as T;
}

function isStandardDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptorValue<number>(descriptors, 'length');
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}

function indexBefore(document: ProseMirrorNode, context: BuildContext): DocumentIndex {
  const root = locateTree(document);
  const stableById = new Map<XnlRichDocumentDomainNodeId, LocatedNode>();
  for (const located of flatten(root)) {
    if (located.node.isText) continue;
    const nodeId = readClaimedNodeId(located.node, context);
    if (nodeId === undefined) {
      context.diagnostics.push(diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        'The accepted transaction document contains a persistent node without nodeId.',
        located.path,
      ));
      continue;
    }
    if (stableById.has(nodeId)) {
      context.diagnostics.push(diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        `The accepted transaction document contains duplicate nodeId "${nodeId}".`,
        located.path,
      ));
      continue;
    }
    located.claimedNodeId = nodeId;
    located.identity = { kind: 'stable', nodeId };
    stableById.set(nodeId, located);
  }
  return { root, nodes: flatten(root), stableById };
}

function indexAfter(
  document: ProseMirrorNode,
  before: DocumentIndex,
  context: BuildContext,
  mapping: Transaction['mapping'],
): DocumentIndex {
  const root = locateTree(document);
  const nodes = flatten(root);
  const claims = new Map<XnlRichDocumentDomainNodeId, LocatedNode[]>();
  for (const located of nodes) {
    if (located.node.isText) continue;
    const nodeId = readClaimedNodeId(located.node, context);
    located.claimedNodeId = nodeId;
    if (nodeId !== undefined) {
      const list = claims.get(nodeId) ?? [];
      list.push(located);
      claims.set(nodeId, list);
    }
  }

  const stableById = new Map<XnlRichDocumentDomainNodeId, LocatedNode>();
  for (const [nodeId, candidates] of claims) {
    const previous = before.stableById.get(nodeId);
    if (previous === undefined) continue;
    const sameKind = candidates.filter((candidate) => candidate.node.type.name === previous.node.type.name);
    if (sameKind.length === 0) continue;
    const mappedPosition = previous.position < 0
      ? previous.position
      : mapping.map(previous.position, 1);
    const mappedCandidates = sameKind.filter((candidate) => candidate.position === mappedPosition);
    if (sameKind.length > 1 && mappedCandidates.length !== 1) {
      context.diagnostics.push(diagnostic(
        'INVALID_TIPTAP_TRANSACTION',
        `Persistent nodeId "${nodeId}" cannot be aligned unambiguously after a copy.`,
        previous.path,
      ));
      continue;
    }
    const stable = sameKind.length === 1 ? sameKind[0] : mappedCandidates[0];
    stable.identity = { kind: 'stable', nodeId };
    stableById.set(nodeId, stable);
  }

  for (const located of nodes) {
    if (located.node.isText || located.identity !== undefined) continue;
    located.identity = { kind: 'local', localNodeId: `local:${context.localSequence++}` };
  }
  for (const [nodeId, candidates] of claims) {
    const source = before.stableById.get(nodeId);
    if (source === undefined) continue;
    const copies = candidates.filter((candidate) => candidate.identity?.kind === 'local'
      && candidate.node.type.name === source.node.type.name
      && candidate.node.eq(source.node));
    if (copies.length === 1) copies[0].sourceNodeId = nodeId;
  }
  return { root, nodes, stableById };
}

function locateTree(
  node: ProseMirrorNode,
  parent?: LocatedNode,
  index = 0,
  path: Path = [],
  position = -1,
): LocatedNode {
  const located: LocatedNode = { node, parent, index, path, position };
  const children: LocatedNode[] = [];
  const contentStart = parent === undefined ? 0 : position + 1;
  node.forEach((child, offset, childIndex) => {
    children.push(locateTree(child, located, childIndex, [...path, childIndex], contentStart + offset));
  });
  Object.defineProperty(located, 'children', { value: children, enumerable: false });
  return located;
}

function childrenOf(node: LocatedNode): readonly LocatedNode[] {
  const descriptor = Object.getOwnPropertyDescriptor(node, 'children');
  return descriptor !== undefined && 'value' in descriptor
    ? descriptor.value as readonly LocatedNode[]
    : [];
}

function flatten(root: LocatedNode): LocatedNode[] {
  const nodes: LocatedNode[] = [];
  const visit = (node: LocatedNode): void => {
    nodes.push(node);
    childrenOf(node).forEach(visit);
  };
  visit(root);
  return nodes;
}

function collectSemanticEdits(
  before: DocumentIndex,
  after: DocumentIndex,
  context: BuildContext,
): XnlRichDocumentTiptapSemanticEdit[] {
  const edits: XnlRichDocumentTiptapSemanticEdit[] = [];
  const changedTables = changedStableTables(before, after, context);
  const deletedIds = new Set([...before.stableById.keys()].filter((id) => !after.stableById.has(id)));

  for (const located of after.nodes) {
    if (located.node.isText || located.identity?.kind !== 'local') continue;
    if (located.node.type.name === 'hardBreak') continue;
    if (hasAncestor(located, (ancestor) => ancestor.identity?.kind === 'local')) continue;
    if (insideChangedTable(located, changedTables)) continue;
    const parent = located.parent?.identity;
    if (parent === undefined) continue;
    const node = semanticNode(located, context);
    if (node !== undefined && node.kind !== 'text' && 'localNodeId' in node && typeof node.localNodeId === 'string') {
      edits.push({
        kind: 'insert',
        localNodeId: located.identity.localNodeId,
        parent,
        index: located.index,
        node,
      });
    }
  }

  for (const [nodeId, located] of before.stableById) {
    if (!deletedIds.has(nodeId)) continue;
    if (located.node.type.name === 'hardBreak') continue;
    if (hasAncestor(located, (ancestor) => ancestor.claimedNodeId !== undefined && deletedIds.has(ancestor.claimedNodeId))) continue;
    if (insideChangedTable(located, changedTables)) continue;
    const parent = stableRef(located.parent);
    if (parent !== undefined) edits.push({ kind: 'delete', nodeId, parent, index: located.index });
  }

  for (const nodeId of movedStableNodeIds(before, after)) {
    const fromNode = before.stableById.get(nodeId);
    const toNode = after.stableById.get(nodeId);
    if (fromNode === undefined
      || toNode === undefined
      || toNode.node.type.name === 'hardBreak'
      || insideChangedTable(toNode, changedTables)) continue;
    const fromParent = stableRef(fromNode.parent);
    const toParent = toNode.parent?.identity;
    if (fromParent !== undefined && toParent !== undefined) {
      edits.push({
        kind: 'move',
        nodeId,
        from: { parent: fromParent, index: fromNode.index },
        to: { parent: toParent, index: toNode.index },
      });
    }
  }

  for (const [nodeId, beforeNode] of before.stableById) {
    const afterNode = after.stableById.get(nodeId);
    if (afterNode === undefined || changedTables.has(nodeId) || insideChangedTable(afterNode, changedTables)) continue;
    if (beforeNode.node.type.name === 'codeBlock') {
      const beforeCode = codeValue(beforeNode.node, context, beforeNode.path);
      const afterCode = codeValue(afterNode.node, context, afterNode.path);
      if (!equalValue(beforeCode, afterCode)) {
        edits.push({ kind: 'code', nodeId, before: beforeCode, after: afterCode });
      }
      continue;
    }
    if (beforeNode.node.type.name === 'mermaid') {
      const beforeSource = mermaidSourceValue(beforeNode.node, context, beforeNode.path);
      const afterSource = mermaidSourceValue(afterNode.node, context, afterNode.path);
      if (beforeSource !== afterSource) {
        edits.push({ kind: 'mermaid-source', nodeId, before: beforeSource, after: afterSource });
      }
      continue;
    }
    if (TEXT_CONTAINER_TYPES.has(beforeNode.node.type.name)) {
      const beforeInline = inlineContent(beforeNode, context);
      const afterInline = inlineContent(afterNode, context);
      if (containsHardBreak(beforeInline) || containsHardBreak(afterInline)) {
        if (!equalValue(beforeInline, afterInline)) {
          edits.push({ kind: 'inline', nodeId, before: beforeInline, after: afterInline });
        }
      } else {
        const beforeRuns = inlineRuns(beforeNode.node, context, beforeNode.path);
        const afterRuns = inlineRuns(afterNode.node, context, afterNode.path);
        const beforeText = beforeRuns.map((run) => run.text).join('');
        const afterText = afterRuns.map((run) => run.text).join('');
        if (beforeText !== afterText) {
          edits.push({
            kind: 'text',
            nodeId,
            before: beforeText,
            after: afterText,
            beforeInlineRuns: beforeRuns,
            afterInlineRuns: afterRuns,
          });
        }
        if (!equalValue(markSignature(beforeRuns), markSignature(afterRuns))) {
          edits.push({ kind: 'mark', nodeId, before: beforeRuns, after: afterRuns });
        }
      }
      const beforeAttrs = textContainerAttributes(beforeNode, context);
      const afterAttrs = textContainerAttributes(afterNode, context);
      if (beforeAttrs !== undefined
        && afterAttrs !== undefined
        && !equalValue(beforeAttrs, afterAttrs)) {
        edits.push({ kind: 'node-attributes', nodeId, before: beforeAttrs, after: afterAttrs });
      }
    }
    if (beforeNode.node.type.name === 'taskItem') {
      const beforeAttrs = taskItemAttributes(beforeNode, context);
      const afterAttrs = taskItemAttributes(afterNode, context);
      if (beforeAttrs !== undefined
        && afterAttrs !== undefined
        && !equalValue(beforeAttrs, afterAttrs)) {
        edits.push({ kind: 'node-attributes', nodeId, before: beforeAttrs, after: afterAttrs });
      }
    }
    validateNoUnsupportedStableChange(beforeNode, afterNode, context);
  }

  for (const nodeId of changedTables) {
    const beforeNode = before.stableById.get(nodeId);
    const afterNode = after.stableById.get(nodeId);
    if (beforeNode === undefined || afterNode === undefined) continue;
    const beforeSnapshot = semanticNode(beforeNode, context);
    const afterSnapshot = semanticNode(afterNode, context);
    if (beforeSnapshot?.kind === 'table' && afterSnapshot?.kind === 'table') {
      edits.push({ kind: 'table', nodeId, before: beforeSnapshot, after: afterSnapshot });
    }
  }
  return edits;
}

function changedStableTables(
  before: DocumentIndex,
  after: DocumentIndex,
  context: BuildContext,
): Set<XnlRichDocumentDomainNodeId> {
  const changed = new Set<XnlRichDocumentDomainNodeId>();
  for (const [nodeId, beforeNode] of before.stableById) {
    if (beforeNode.node.type.name !== 'table') continue;
    const afterNode = after.stableById.get(nodeId);
    if (afterNode === undefined) continue;
    const beforeSnapshot = semanticNode(beforeNode, context);
    const afterSnapshot = semanticNode(afterNode, context);
    if (!equalValue(beforeSnapshot, afterSnapshot)) changed.add(nodeId);
  }
  return changed;
}

function movedStableNodeIds(
  before: DocumentIndex,
  after: DocumentIndex,
): Set<XnlRichDocumentDomainNodeId> {
  const moved = new Set<XnlRichDocumentDomainNodeId>();
  for (const [nodeId, beforeNode] of before.stableById) {
    const afterNode = after.stableById.get(nodeId);
    if (afterNode === undefined) continue;
    if (beforeNode.parent?.claimedNodeId !== identityNodeId(afterNode.parent)) {
      moved.add(nodeId);
    }
  }
  const parentIds = new Set<XnlRichDocumentDomainNodeId>();
  for (const node of before.nodes) if (node.claimedNodeId !== undefined) parentIds.add(node.claimedNodeId);
  for (const parentId of parentIds) {
    const beforeParent = before.stableById.get(parentId);
    const afterParent = after.stableById.get(parentId);
    if (beforeParent === undefined || afterParent === undefined) continue;
    const beforeIds = directStableChildIds(beforeParent).filter((id) => after.stableById.has(id));
    const afterIds = directStableChildIds(afterParent).filter((id) => before.stableById.has(id));
    for (const id of sequenceDifference(beforeIds, afterIds)) moved.add(id);
  }
  return moved;
}

function identityNodeId(node: LocatedNode | undefined): XnlRichDocumentDomainNodeId | undefined {
  return node?.identity?.kind === 'stable' ? node.identity.nodeId : undefined;
}

function directStableChildIds(parent: LocatedNode): XnlRichDocumentDomainNodeId[] {
  return childrenOf(parent).flatMap((child) => child.identity?.kind === 'stable' ? [child.identity.nodeId] : []);
}

function sequenceDifference(
  before: readonly XnlRichDocumentDomainNodeId[],
  after: readonly XnlRichDocumentDomainNodeId[],
): Set<XnlRichDocumentDomainNodeId> {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      matrix[row][column] = before[row - 1] === after[column - 1]
        ? matrix[row - 1][column - 1] + 1
        : Math.max(matrix[row - 1][column], matrix[row][column - 1]);
    }
  }
  const retained = new Set<XnlRichDocumentDomainNodeId>();
  let row = before.length;
  let column = after.length;
  while (row > 0 && column > 0) {
    if (before[row - 1] === after[column - 1]) {
      retained.add(before[row - 1]);
      row -= 1;
      column -= 1;
    } else if (matrix[row - 1][column] >= matrix[row][column - 1]) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return new Set(before.filter((id) => after.includes(id) && !retained.has(id)));
}

function semanticNode(located: LocatedNode, context: BuildContext): XnlRichDocumentTiptapSemanticNode | undefined {
  const node = located.node;
  if (!SUPPORTED_NODE_TYPES.has(node.type.name)) {
    context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', `Unsupported node type "${node.type.name}".`, located.path));
    return undefined;
  }
  const attrs = semanticAttrs(node, context, [...located.path, 'attrs']);
  if (attrs === undefined) return undefined;
  const content = childrenOf(located).map((child) => semanticNode(child, context)).filter(
    (child): child is XnlRichDocumentTiptapSemanticNode => child !== undefined,
  );
  const marks = node.isText ? semanticMarks(node.marks, context, [...located.path, 'marks']) : undefined;
  if (node.isText) {
    return {
      kind: 'text',
      text: node.text ?? '',
      ...(marks !== undefined && marks.length > 0 ? { marks } : {}),
    };
  }
  const identity = semanticIdentity(located);
  if (identity === undefined) {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Persistent semantic node has no resolved identity.', located.path));
    return undefined;
  }

  switch (node.type.name) {
    case 'doc':
      return { kind: 'document', ...identity, children: blockChildren(content, located, context) };
    case 'paragraph': {
      const attributes = textContainerAttributes(located, context);
      if (attributes === undefined) return undefined;
      return {
        kind: 'paragraph',
        ...identity,
        ...(attributes.align === undefined ? {} : { align: attributes.align }),
        content: inlineChildren(content, located, context),
      };
    }
    case 'heading': {
      const level = attrs.level;
      if (!Number.isInteger(level) || Number(level) < 1 || Number(level) > 6) {
        context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Heading level must be an integer from 1 through 6.', [...located.path, 'attrs', 'level']));
        return undefined;
      }
      const align = textAlignment(attrs.textAlign, located, context);
      if (attrs.textAlign !== undefined && align === undefined) return undefined;
      return {
        kind: 'heading',
        ...identity,
        level: level as 1 | 2 | 3 | 4 | 5 | 6,
        ...(align === undefined ? {} : { align }),
        content: inlineChildren(content, located, context),
      };
    }
    case 'blockquote':
      return { kind: 'blockquote', ...identity, children: blockChildren(content, located, context) };
    case 'bulletList':
      return { kind: 'bullet-list', ...identity, children: listItemChildren(content, located, context) };
    case 'orderedList':
      return {
        kind: 'ordered-list',
        ...identity,
        ...(typeof attrs.start === 'number' ? { start: attrs.start } : {}),
        children: listItemChildren(content, located, context),
      };
    case 'listItem':
      return { kind: 'list-item', ...identity, children: blockChildren(content, located, context) };
    case 'taskList':
      return { kind: 'task-list', ...identity, children: taskItemChildren(content, located, context) };
    case 'taskItem': {
      const attributes = taskItemAttributes(located, context);
      if (attributes === undefined) return undefined;
      return {
        kind: 'task-item',
        ...identity,
        checked: attributes.checked,
        children: blockChildren(content, located, context),
      };
    }
    case 'horizontalRule':
      return { kind: 'horizontal-rule', ...identity };
    case 'image':
      if (typeof attrs.src !== 'string') {
        context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Image src must be a string.', [...located.path, 'attrs', 'src']));
        return undefined;
      }
      return {
        kind: 'image',
        ...identity,
        src: attrs.src,
        ...(typeof attrs.alt === 'string' ? { alt: attrs.alt } : {}),
        ...(typeof attrs.title === 'string' ? { title: attrs.title } : {}),
      };
    case 'table':
      return { kind: 'table', ...identity, children: tableRowChildren(content, located, context) };
    case 'tableRow':
      return { kind: 'table-row', ...identity, children: tableCellChildren(content, located, context) };
    case 'tableCell':
    case 'tableHeader':
      return {
        kind: node.type.name === 'tableCell' ? 'table-cell' : 'table-header',
        ...identity,
        ...canonicalTableSpanAttrs(attrs),
        children: blockChildren(content, located, context),
      };
    case 'codeBlock':
      return {
        kind: 'code-block',
        ...identity,
        ...(typeof attrs.language === 'string' ? { language: attrs.language } : {}),
        text: node.textContent,
      };
    case 'mermaid':
      if (typeof attrs.source !== 'string') {
        context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Mermaid source must be a string.', [...located.path, 'attrs', 'source']));
        return undefined;
      }
      return { kind: 'mermaid', ...identity, source: attrs.source };
    case 'componentEmbed':
    case 'capsuleEmbed':
      if (typeof attrs.ref !== 'string' || attrs.ref.length === 0) {
        context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Embed ref must be a non-empty string.', [...located.path, 'attrs', 'ref']));
        return undefined;
      }
      return {
        kind: node.type.name === 'componentEmbed' ? 'component-embed' : 'capsule-embed',
        ...identity,
        ref: attrs.ref,
        ...(typeof attrs.version === 'string' ? { version: attrs.version } : {}),
        ...(isPlainRecord(attrs.input) ? { input: attrs.input } : {}),
      };
    case 'hardBreak':
      return { kind: 'hard-break', ...identity };
    default:
      return undefined;
  }
}

function semanticIdentity(located: LocatedNode):
  | Readonly<{ nodeId: XnlRichDocumentDomainNodeId }>
  | Readonly<{ localNodeId: string; sourceNodeId?: XnlRichDocumentDomainNodeId }>
  | undefined {
  if (located.identity?.kind === 'stable') return { nodeId: located.identity.nodeId };
  if (located.identity?.kind === 'local') {
    return {
      localNodeId: located.identity.localNodeId,
      ...(located.sourceNodeId !== undefined ? { sourceNodeId: located.sourceNodeId } : {}),
    };
  }
  return undefined;
}

function canonicalTableSpanAttrs(attrs: XnlRichDocumentSerializableRecord): XnlRichDocumentSerializableRecord {
  const colspan = typeof attrs.colspan === 'number' ? attrs.colspan : undefined;
  const rowspan = typeof attrs.rowspan === 'number' ? attrs.rowspan : undefined;
  const normalizedColspan = colspan ?? 1;
  const normalizedRowspan = rowspan ?? 1;
  if (normalizedColspan === 1 && normalizedRowspan === 1) return {};
  return {
    ...(colspan === undefined ? {} : { colspan }),
    ...(rowspan === undefined ? {} : { rowspan }),
  };
}

function inlineContent(
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentSemanticInlineNode[] {
  const content = childrenOf(located).map((child) => semanticNode(child, context)).filter(
    (child): child is XnlRichDocumentTiptapSemanticNode => child !== undefined,
  );
  return inlineChildren(content, located, context);
}

function containsHardBreak(content: readonly XnlRichDocumentSemanticInlineNode[]): boolean {
  return content.some((child) => child.kind === 'hard-break');
}

function textContainerAttributes(
  located: LocatedNode,
  context: BuildContext,
): Extract<XnlRichDocumentNodeAttributes, { kind: 'paragraph' | 'heading' }> | undefined {
  const attrs = semanticAttrs(located.node, context, [...located.path, 'attrs']);
  if (attrs === undefined) return undefined;
  const align = textAlignment(attrs.textAlign, located, context);
  if (attrs.textAlign !== undefined && align === undefined) return undefined;
  return {
    kind: located.node.type.name as 'paragraph' | 'heading',
    ...(align === undefined ? {} : { align }),
  };
}

function textAlignment(
  value: XnlRichDocumentSerializableValue | undefined,
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentTextAlignment | undefined {
  if (value === undefined) return undefined;
  if (value === 'start' || value === 'center' || value === 'end' || value === 'justify') {
    return value;
  }
  context.diagnostics.push(diagnostic(
    'LOSSY_TIPTAP_TRANSACTION',
    'Text alignment must be start, center, end, justify, or absent.',
    [...located.path, 'attrs', 'textAlign'],
  ));
  return undefined;
}

function taskItemAttributes(
  located: LocatedNode,
  context: BuildContext,
): Extract<XnlRichDocumentNodeAttributes, { kind: 'task-item' }> | undefined {
  const attrs = semanticAttrs(located.node, context, [...located.path, 'attrs']);
  if (attrs === undefined) return undefined;
  if (typeof attrs.checked !== 'boolean') {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_TRANSACTION',
      'Task-item checked state must be boolean.',
      [...located.path, 'attrs', 'checked'],
    ));
    return undefined;
  }
  return { kind: 'task-item', checked: attrs.checked };
}

function inlineChildren(
  content: readonly XnlRichDocumentTiptapSemanticNode[],
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentSemanticInlineNode[] {
  const invalid = content.find((child) => child.kind !== 'text' && child.kind !== 'hard-break');
  if (invalid !== undefined) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_TRANSACTION',
      'Inline container contains a non-inline semantic child.',
      located.path,
    ));
  }
  return content.filter((child): child is XnlRichDocumentSemanticInlineNode => (
    child.kind === 'text' || child.kind === 'hard-break'
  ));
}

function blockChildren(
  content: readonly XnlRichDocumentTiptapSemanticNode[],
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentSemanticBlockNode[] {
  const allowed = new Set([
    'paragraph', 'heading', 'blockquote', 'bullet-list', 'ordered-list', 'task-list',
    'horizontal-rule', 'image', 'table', 'code-block', 'mermaid', 'component-embed',
    'capsule-embed',
  ]);
  if (content.some((child) => !allowed.has(child.kind))) context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Block container contains an unsupported semantic child.', located.path));
  return content.filter((child) => allowed.has(child.kind)) as XnlRichDocumentSemanticBlockNode[];
}

function listItemChildren(
  content: readonly XnlRichDocumentTiptapSemanticNode[],
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentSemanticListItem[] {
  if (content.some((child) => child.kind !== 'list-item')) context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'List contains a non-list-item semantic child.', located.path));
  return content.filter((child): child is XnlRichDocumentSemanticListItem => child.kind === 'list-item');
}

function taskItemChildren(
  content: readonly XnlRichDocumentTiptapSemanticNode[],
  located: LocatedNode,
  context: BuildContext,
): XnlRichDocumentSemanticTaskItem[] {
  if (content.some((child) => child.kind !== 'task-item')) {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_TRANSACTION',
      'Task list contains a non-task-item semantic child.',
      located.path,
    ));
  }
  return content.filter((child): child is XnlRichDocumentSemanticTaskItem => child.kind === 'task-item');
}

function tableRowChildren(content: readonly XnlRichDocumentTiptapSemanticNode[], located: LocatedNode, context: BuildContext) {
  if (content.some((child) => child.kind !== 'table-row')) context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Table contains a non-row semantic child.', located.path));
  return content.filter((child): child is Extract<XnlRichDocumentTiptapSemanticNode, { kind: 'table-row' }> => child.kind === 'table-row');
}

function tableCellChildren(content: readonly XnlRichDocumentTiptapSemanticNode[], located: LocatedNode, context: BuildContext) {
  if (content.some((child) => child.kind !== 'table-cell' && child.kind !== 'table-header')) context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Table row contains a non-cell semantic child.', located.path));
  return content.filter((child): child is Extract<XnlRichDocumentTiptapSemanticNode, { kind: 'table-cell' | 'table-header' }> => child.kind === 'table-cell' || child.kind === 'table-header');
}

function semanticAttrs(
  node: ProseMirrorNode,
  context: BuildContext,
  path: readonly (string | number)[],
): XnlRichDocumentSerializableRecord | undefined {
  const attrs = node.attrs;
  if (!isPlainRecord(attrs)) {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Node attrs must be a plain record.', path));
    return undefined;
  }
  const output = Object.create(null) as Record<string, XnlRichDocumentSerializableValue>;
  const descriptors = Object.getOwnPropertyDescriptors(attrs);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(attrs, key);
    if (descriptor === undefined) continue;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Node attrs contain an accessor or symbol field.', [...path, String(key)]));
      return undefined;
    }
    if (key === 'nodeId' || descriptor.value === null || descriptor.value === undefined) continue;
    const value = snapshotSerializable(descriptor.value, [...path, key], context, new WeakSet());
    if (value === undefined && descriptor.value !== undefined) return undefined;
    Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return output;
}

function snapshotSerializable(
  value: unknown,
  path: readonly (string | number)[],
  context: BuildContext,
  seen: WeakSet<object>,
): XnlRichDocumentSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (typeof value !== 'object') {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Emitted semantic data must be serializable.', path));
    return undefined;
  }
  if (seen.has(value)) {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Emitted semantic data must not contain cycles.', path));
    return undefined;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key)))
      || keys.filter((key) => key !== 'length').length !== value.length) {
      context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Semantic arrays must be dense standard arrays.', path));
      seen.delete(value);
      return undefined;
    }
    const result: XnlRichDocumentSerializableValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !('value' in descriptor)) {
        context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Semantic arrays must use data entries.', [...path, index]));
        seen.delete(value);
        return undefined;
      }
      const child = snapshotSerializable(descriptor.value, [...path, index], context, seen);
      if (child === undefined) {
        seen.delete(value);
        return undefined;
      }
      result.push(child);
    }
    seen.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Runtime instances cannot enter semantic edit data.', path));
    seen.delete(value);
    return undefined;
  }
  const result = Object.create(null) as Record<string, XnlRichDocumentSerializableValue>;
  for (const key of Reflect.ownKeys(Object.getOwnPropertyDescriptors(value))) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Semantic records must use enumerable string data fields.', [...path, String(key)]));
      seen.delete(value);
      return undefined;
    }
    const child = snapshotSerializable(descriptor.value, [...path, key], context, seen);
    if (child === undefined) {
      seen.delete(value);
      return undefined;
    }
    Object.defineProperty(result, key, { value: child, enumerable: true, writable: true, configurable: true });
  }
  seen.delete(value);
  return result;
}

function semanticMarks(
  marks: readonly Mark[],
  context: BuildContext,
  path: readonly (string | number)[],
): XnlRichDocumentMark[] {
  const result = marks.flatMap<XnlRichDocumentMark>((mark, index) => {
    if (!MARK_TYPES.has(mark.type.name)) {
      context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', `Unsupported mark "${mark.type.name}".`, [...path, index]));
      return [];
    }
    if (mark.type.name === 'bold'
      || mark.type.name === 'italic'
      || mark.type.name === 'strike'
      || mark.type.name === 'underline'
      || mark.type.name === 'code') {
      return [{ kind: mark.type.name }];
    }
    const attrs = semanticMarkAttrs(mark, context, [...path, index, 'attrs']);
    if (attrs === undefined) return [];
    if (mark.type.name === 'textStyle') {
      return [{ kind: 'text-color', color: attrs.color as string }];
    }
    if (mark.type.name === 'highlight') {
      return [attrs.color === undefined
        ? { kind: 'highlight' }
        : { kind: 'highlight', color: attrs.color as string }];
    }
    if (typeof attrs.href !== 'string' || attrs.href.length === 0) {
      context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Link marks require a non-empty href.', [...path, index, 'attrs', 'href']));
      return [];
    }
    return [{
      kind: 'link',
      href: attrs.href,
      ...(typeof attrs.title === 'string' ? { title: attrs.title } : {}),
    }];
  }).sort((left, right) => (
    (CANONICAL_MARK_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER)
    - (CANONICAL_MARK_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER)
  ));
  validateCanonicalMarks(result, path, context);
  return result;
}

function semanticMarkAttrs(
  mark: Mark,
  context: BuildContext,
  path: readonly (string | number)[],
): XnlRichDocumentSerializableRecord | undefined {
  const attrs = mark.attrs;
  if (!isPlainRecord(attrs)) {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Mark attrs must be a plain record.', path));
    return undefined;
  }
  const output: Record<string, XnlRichDocumentSerializableValue> = {};
  const keys = mark.type.name === 'link' ? ['href', 'title'] : ['color'];
  for (const key of keys) {
    const value = ownData(attrs, key);
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') {
      context.diagnostics.push(diagnostic(
        'LOSSY_TIPTAP_TRANSACTION',
        'Canonical mark attrs must be strings when present.',
        [...path, key],
      ));
      return undefined;
    }
    output[key] = value;
  }
  return output;
}

function validateCanonicalMarks(
  marks: readonly XnlRichDocumentMark[],
  path: readonly (string | number)[],
  context: BuildContext,
): void {
  if (marks.length === 0) return;
  const result = parseXnlRichDocumentCandidate({}, {
    candidate: {
      kind: 'document',
      nodeId: 'validation.document',
      children: [{
        kind: 'paragraph',
        nodeId: 'validation.paragraph',
        content: [{ kind: 'text', text: 'validation', marks }],
      }],
    },
  }, {});
  if (result.status === 'rejected') {
    context.diagnostics.push(diagnostic(
      'LOSSY_TIPTAP_TRANSACTION',
      `Marks do not satisfy canonical RichDocument validation: ${result.diagnostics[0]?.message ?? 'invalid marks'}`,
      path,
    ));
  }
}

function inlineRuns(
  node: ProseMirrorNode,
  context: BuildContext,
  path: Path,
): XnlRichDocumentTiptapInlineRun[] {
  const runs: XnlRichDocumentTiptapInlineRun[] = [];
  node.forEach((child, _offset, index) => {
    if (!child.isText) {
      context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', 'Inline edit contains a non-text child.', [...path, index]));
      return;
    }
    runs.push({
      text: child.text ?? '',
      marks: semanticMarks(child.marks, context, [...path, index, 'marks']),
    });
  });
  return runs;
}

function codeValue(
  node: ProseMirrorNode,
  context: BuildContext,
  path: Path,
): { language: string | null; text: string } {
  const language = ownData(node.attrs, 'language');
  if (language !== null && language !== undefined && typeof language !== 'string') {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Code language must be a string or null.', [...path, 'attrs', 'language']));
  }
  return { language: typeof language === 'string' ? language : null, text: node.textContent };
}

function mermaidSourceValue(
  node: ProseMirrorNode,
  context: BuildContext,
  path: Path,
): string {
  const source = ownData(node.attrs, 'source');
  if (typeof source !== 'string') {
    context.diagnostics.push(diagnostic('LOSSY_TIPTAP_TRANSACTION', 'Mermaid source must be a string.', [...path, 'attrs', 'source']));
    return '';
  }
  return source;
}

function validateNoUnsupportedStableChange(
  before: LocatedNode,
  after: LocatedNode,
  context: BuildContext,
): void {
  if (TEXT_CONTAINER_TYPES.has(before.node.type.name)) {
    return;
  }
  if (['doc', 'blockquote', 'bulletList', 'listItem', 'taskList', 'taskItem', 'horizontalRule', 'hardBreak']
    .includes(before.node.type.name)) return;
  if (before.node.type.name === 'orderedList') {
    const beforeAttrs = semanticAttrs(before.node, context, [...before.path, 'attrs']);
    const afterAttrs = semanticAttrs(after.node, context, [...after.path, 'attrs']);
    if (!equalValue(beforeAttrs, afterAttrs)) context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', 'Ordered-list attribute edits are not supported.', after.path));
    return;
  }
  if (TABLE_NODE_TYPES.has(before.node.type.name) || before.node.type.name === 'codeBlock') return;
  const beforeSnapshot = semanticNode(before, context);
  const afterSnapshot = semanticNode(after, context);
  if (!equalValue(beforeSnapshot, afterSnapshot)) {
    context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', `Semantic updates for ${before.node.type.name} are not supported by T2.2.`, after.path));
  }
}

function readClaimedNodeId(
  node: ProseMirrorNode,
  context: BuildContext,
): XnlRichDocumentDomainNodeId | undefined {
  if (!SUPPORTED_NODE_TYPES.has(node.type.name)) {
    context.diagnostics.push(diagnostic('UNSUPPORTED_TIPTAP_TRANSACTION', `Unsupported node type "${node.type.name}".`));
    return undefined;
  }
  const value = ownData(node.attrs, 'nodeId');
  return typeof value === 'string' && value.length > 0
    ? value as XnlRichDocumentDomainNodeId
    : undefined;
}

function stableRef(node: LocatedNode | undefined): XnlRichDocumentTiptapStableNodeRef | undefined {
  return node?.identity?.kind === 'stable' ? node.identity : undefined;
}

function hasAncestor(node: LocatedNode, predicate: (ancestor: LocatedNode) => boolean): boolean {
  let current = node.parent;
  while (current !== undefined) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

function insideChangedTable(
  node: LocatedNode,
  changedTables: ReadonlySet<XnlRichDocumentDomainNodeId>,
): boolean {
  return hasAncestor(node, (ancestor) => ancestor.identity?.kind === 'stable' && changedTables.has(ancestor.identity.nodeId));
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function markSignature(runs: readonly XnlRichDocumentTiptapInlineRun[]): readonly unknown[] {
  return runs.map((run) => run.marks);
}

function ownData(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function diagnostic(
  code: XnlRichDocumentTiptapDiagnostic['code'],
  message: string,
  path: readonly (string | number)[] = [],
): XnlRichDocumentTiptapDiagnostic {
  return { severity: 'error', code, message, path };
}

function rejected(
  diagnostics: XnlRichDocumentTiptapDiagnostic | readonly XnlRichDocumentTiptapDiagnostic[],
): XnlRichDocumentTiptapTransactionResult {
  const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
  return deepFreeze({
    status: 'rejected',
    diagnostics: list as [XnlRichDocumentTiptapDiagnostic, ...XnlRichDocumentTiptapDiagnostic[]],
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
