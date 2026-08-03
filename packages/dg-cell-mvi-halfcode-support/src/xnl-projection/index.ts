import {
  wordToString,
  type CommentNode,
  type DataElementNode,
  type ElementNode,
  type TextElementNode,
  type XnlNode,
  type XnlWord,
} from 'xnl-core';
import {
  createXnlProjectionPlanNodeId,
  type XnlProjectionClassification,
  type XnlProjectionCompileChild,
  type XnlProjectionCompilerInput,
  type XnlProjectionCompilerDialect,
  type XnlProjectionPlanNode,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-logic';

export * from './presenterRegistry';
export * from './presenterCapabilities';
export * from './presentationRunner';
export * from './neutralPresenters';

export type XnlProjectionNodeFamily =
  | 'dataElement'
  | 'textElement'
  | 'word'
  | 'comment'
  | 'array'
  | 'record'
  | 'literalString'
  | 'literalNumber'
  | 'literalBoolean'
  | 'literalNull'
  | 'unknown';

export const XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS: Readonly<Record<XnlProjectionNodeFamily, string>> = Object.freeze({
  dataElement: 'xnl.data-element',
  textElement: 'xnl.text-element',
  word: 'xnl.word',
  comment: 'xnl.comment',
  array: 'xnl.array',
  record: 'xnl.record',
  literalString: 'xnl.literal.string',
  literalNumber: 'xnl.literal.number',
  literalBoolean: 'xnl.literal.boolean',
  literalNull: 'xnl.literal.null',
  unknown: 'xnl.unknown',
});

export const XNL_PROJECTION_DEFAULT_PRESENTER_IDS: Readonly<Record<XnlProjectionNodeFamily, string>> = Object.freeze({
  dataElement: 'xnl.presenter.data-element',
  textElement: 'xnl.presenter.text-element',
  word: 'xnl.presenter.word',
  comment: 'xnl.presenter.comment',
  array: 'xnl.presenter.array',
  record: 'xnl.presenter.record',
  literalString: 'xnl.presenter.literal',
  literalNumber: 'xnl.presenter.literal',
  literalBoolean: 'xnl.presenter.literal',
  literalNull: 'xnl.presenter.literal',
  unknown: 'xnl.presenter.unsupported',
});

export interface XnlProjectionRootInputOptions {
  role?: string;
  sourceRef?: string;
  sourceKind?: string;
  metadata?: XnlProjectionSerializableRecord;
}

export interface CreateDefaultXnlProjectionDialectOptions {
  classifications?: Partial<Record<XnlProjectionNodeFamily, string>>;
  presenters?: Partial<Record<XnlProjectionNodeFamily, string>>;
  metadata?: XnlProjectionSerializableRecord;
}

export function createXnlProjectionRootInput(
  node: XnlNode,
  options: XnlProjectionRootInputOptions = {},
): XnlProjectionCompilerInput<XnlNode> {
  const element = isElementNode(node) ? node : undefined;
  const sourceKind = options.sourceKind ?? sourceKindFor(node);
  return {
    node,
    ...(element?.id !== undefined ? { nodeId: wordToString(element.id) } : {}),
    ...(element !== undefined ? { tag: element.tag } : {}),
    ...(options.role !== undefined ? { role: options.role } : {}),
    ...(sourceKind !== undefined ? { sourceKind } : {}),
    ...(options.sourceRef !== undefined ? { sourceRef: options.sourceRef } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

export function createDefaultXnlProjectionDialect(
  options: CreateDefaultXnlProjectionDialectOptions = {},
): XnlProjectionCompilerDialect<XnlNode> {
  const classifications: Readonly<Record<XnlProjectionNodeFamily, string>> = Object.freeze({
    ...XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS,
    ...(options.classifications ?? {}),
  });
  const presenters: Readonly<Record<XnlProjectionNodeFamily, string>> = Object.freeze({
    ...XNL_PROJECTION_DEFAULT_PRESENTER_IDS,
    ...(options.presenters ?? {}),
  });
  const presenterBindings = Object.freeze(
    Object.entries(classifications).map(([family, classification]) =>
      Object.freeze({
        classification,
        presenter: Object.freeze({
          id: presenters[family as XnlProjectionNodeFamily],
        }),
      })),
  );
  return {
    id: 'xnl-projection.default-xnl-dialect',
    children: (_runtime, input, _config) => enumerateChildren(input.node),
    classify: (_runtime, input, _config) => classifyNode(input.node, input.context.domain.path, classifications),
    transformers: makeTransformers(classifications),
    presenterBindings,
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

function enumerateChildren(node: XnlNode): readonly XnlProjectionCompileChild<XnlNode>[] {
  if (isDataElementNode(node)) {
    const bodyChildren = (node.body ?? []).map((child, index) => childRef(child, ['body', index], 'body'));
    return [...bodyChildren, ...enumerateExtendChildren(node.extend)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => childRef(child, [index], 'array-item'));
  }
  if (isPlainRecordNode(node)) {
    return stableRecordKeys(node).flatMap((key) => childRef(node[key] as XnlNode, [key], 'record-entry', { key }));
  }
  return [];
}

function enumerateExtendChildren(extend: DataElementNode['extend']): readonly XnlProjectionCompileChild<XnlNode>[] {
  if (extend === undefined) return [];
  const seen = new Set<string>();
  const ordered = extend.order.filter((key) => {
    if (seen.has(key) || extend.children[key] === undefined) return false;
    seen.add(key);
    return true;
  });
  const unordered = Object.keys(extend.children).filter((key) => !seen.has(key)).sort(compareCodePointStrings);
  return [...ordered, ...unordered].map((key) =>
    childRef(extend.children[key] as XnlNode, ['extend', key], 'extend', { key }));
}

function childRef(
  node: XnlNode,
  path: readonly (string | number)[],
  role: string,
  metadata?: XnlProjectionSerializableRecord,
): XnlProjectionCompileChild<XnlNode> {
  const element = isElementNode(node) ? node : undefined;
  return {
    node,
    path,
    pathSegment: path[path.length - 1] ?? role,
    role,
    sourceKind: sourceKindFor(node),
    ...(element?.id !== undefined ? { nodeId: wordToString(element.id) } : {}),
    ...(element !== undefined ? { tag: element.tag } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function classifyNode(
  node: XnlNode,
  path: readonly (string | number)[],
  classifications: Readonly<Record<XnlProjectionNodeFamily, string>>,
): XnlProjectionClassification {
  const family = familyFor(node);
  const diagnostics = family === 'unknown'
    ? [{
        severity: 'error' as const,
        code: 'UNKNOWN_XNL_NODE_KIND',
        message: `Unknown XNL kind "${String((node as { kind?: unknown }).kind)}" cannot be projected as a known node family.`,
        path,
      }]
    : undefined;
  return {
    id: classifications[family],
    traits: traitsFor(family),
    facts: factsFor(node, family),
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}

function makeTransformers(
  classifications: Readonly<Record<XnlProjectionNodeFamily, string>>,
): Readonly<Record<string, XnlProjectionCompilerDialect<XnlNode>['transformers'][string]>> {
  return Object.freeze(Object.fromEntries(
    (Object.keys(classifications) as XnlProjectionNodeFamily[]).map((family) => {
      const transformer: XnlProjectionCompilerDialect<XnlNode>['transformers'][string] =
        (_runtime, input, _config): XnlProjectionPlanNode => {
          const data = dataFor(input.node);
          const element = isElementNode(input.node) ? input.node : undefined;
          const explicitId = element?.id === undefined ? undefined : serializableWord(element.id);
          return {
            kind: 'xnl-projection-plan-node',
            id: createXnlProjectionPlanNodeId(input.context.domain),
            domain: input.context.domain,
            classification: input.classification ?? { id: classifications[family] },
            presenter: input.presentation ?? { id: XNL_PROJECTION_DEFAULT_PRESENTER_IDS[family] },
            ...(data !== undefined ? { data } : {}),
            children: input.children ?? [],
            ...(explicitId !== undefined ? { provenance: { xnl: { explicitId } } } : {}),
          };
        };
      return [classifications[family], transformer] as const;
    }),
  ));
}

function dataFor(node: XnlNode): XnlProjectionSerializableRecord | undefined {
  if (isDataElementNode(node)) {
    return {
      kind: 'DataElement',
      tag: node.tag,
      metadata: serializableRecordEntries(node.metadata),
      ...(node.attributes !== undefined ? { attributes: serializableRecordEntries(node.attributes) } : {}),
      ...(node.body !== undefined ? { bodyLength: node.body.length } : {}),
      ...(node.extend !== undefined ? { extendOrder: [...node.extend.order] } : {}),
    };
  }
  if (isTextElementNode(node)) {
    return {
      kind: 'TextElement',
      tag: node.tag,
      metadata: serializableRecordEntries(node.metadata),
      ...(node.attributes !== undefined ? { attributes: serializableRecordEntries(node.attributes) } : {}),
      ...(node.text !== undefined ? { text: node.text } : {}),
      ...(node.textMarker !== undefined ? { textMarker: node.textMarker } : {}),
    };
  }
  if (isWordNode(node)) return serializableWord(node);
  if (isCommentNode(node)) return { kind: 'Comment', value: node.value };
  if (Array.isArray(node)) return { kind: 'array', length: node.length };
  if (isPlainRecordNode(node)) return { kind: 'record', entryCount: Object.keys(node).length, keys: stableRecordKeys(node) };
  if (typeof node === 'string') return { kind: 'literal.string', value: node };
  if (typeof node === 'number') return { kind: 'literal.number', value: node };
  if (typeof node === 'boolean') return { kind: 'literal.boolean', value: node };
  if (node === null) return { kind: 'literal.null', value: null };
  return { kind: 'unknown' };
}

function serializableNodeData(node: XnlNode): XnlProjectionSerializableValue {
  if (Array.isArray(node)) return { kind: 'array', length: node.length, items: node.map((item) => serializableNodeData(item)) };
  if (isPlainRecordNode(node)) return { kind: 'record', entries: serializableRecordEntries(node) };
  return dataFor(node) ?? { kind: 'unknown' };
}

function serializableRecordEntries(record: Record<string, XnlNode>): XnlProjectionSerializableValue {
  return stableRecordKeys(record).map((key) => ({
    key,
    value: serializableNodeData(record[key] as XnlNode),
  }));
}

function serializableWord(word: XnlWord): XnlProjectionSerializableRecord {
  return {
    kind: 'Word',
    namespace: [...(word.namespace ?? [])],
    name: word.name,
    ...(wordToString(word) !== undefined ? { value: wordToString(word) } : {}),
  };
}

function familyFor(node: XnlNode): XnlProjectionNodeFamily {
  if (isDataElementNode(node)) return 'dataElement';
  if (isTextElementNode(node)) return 'textElement';
  if (isWordNode(node)) return 'word';
  if (isCommentNode(node)) return 'comment';
  if (Array.isArray(node)) return 'array';
  if (isPlainRecordNode(node)) return Object.prototype.hasOwnProperty.call(node, 'kind') ? 'unknown' : 'record';
  if (typeof node === 'string') return 'literalString';
  if (typeof node === 'number') return 'literalNumber';
  if (typeof node === 'boolean') return 'literalBoolean';
  if (node === null) return 'literalNull';
  return 'unknown';
}

function sourceKindFor(node: XnlNode): string {
  return XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS[familyFor(node)];
}

function traitsFor(family: XnlProjectionNodeFamily): readonly string[] {
  if (family === 'literalString' || family === 'literalNumber' || family === 'literalBoolean' || family === 'literalNull') return ['xnl.literal'];
  if (family === 'dataElement' || family === 'textElement') return ['xnl.element'];
  if (family === 'array' || family === 'record') return ['xnl.container'];
  return [];
}

function factsFor(node: XnlNode, family: XnlProjectionNodeFamily): XnlProjectionSerializableRecord {
  if (isElementNode(node)) return { family, tag: node.tag };
  if (Array.isArray(node)) return { family, length: node.length };
  if (isPlainRecordNode(node)) return { family, entryCount: Object.keys(node).length };
  if (family.startsWith('literal')) return { family, valueType: node === null ? 'null' : typeof node };
  return { family };
}

function stableRecordKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort(compareCodePointStrings);
}

function compareCodePointStrings(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const maxLength = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPoint = leftCodePoints[index]?.codePointAt(0) ?? 0;
    const rightPoint = rightCodePoints[index]?.codePointAt(0) ?? 0;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function isElementNode(value: XnlNode): value is ElementNode {
  return isDataElementNode(value) || isTextElementNode(value);
}

function isDataElementNode(value: XnlNode): value is DataElementNode {
  return isRecord(value) && value.kind === 'DataElement';
}

function isTextElementNode(value: XnlNode): value is TextElementNode {
  return isRecord(value) && value.kind === 'TextElement';
}

function isWordNode(value: XnlNode): value is XnlWord {
  return isRecord(value) && value.kind === 'Word';
}

function isCommentNode(value: XnlNode): value is CommentNode {
  return isRecord(value) && value.kind === 'Comment';
}

function isPlainRecordNode(value: XnlNode): value is Record<string, XnlNode> {
  return isRecord(value)
    && !Array.isArray(value)
    && !isDataElementNode(value)
    && !isTextElementNode(value)
    && !isWordNode(value)
    && !isCommentNode(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
