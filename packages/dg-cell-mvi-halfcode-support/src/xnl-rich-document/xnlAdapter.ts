import {
  parseXnl,
  stringifyLineBlock,
  wordToString,
  type DataElementNode,
  type XnlNode,
  type XnlWord,
} from 'xnl-core';
import {
  XNL_RICH_DOCUMENT_CLASSIFICATION_IDS,
  lowerXnlRichDocument,
  parseXnlRichDocumentCandidate,
  type XnlProjectionClassification,
  type XnlProjectionCompileChild,
  type XnlProjectionCompilerDialect,
  type XnlProjectionPlanNode,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
  type XnlRichDocument,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentNode,
  type XnlRichDocumentNodeKind,
  type XnlRichDocumentNormalizedResult,
  type XnlRichDocumentSerializableValue,
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  createXnlProjectionPlanNodeId,
} from 'dg-cell-mvi-halfcode-logic';
import { createXnlProjectionRootInput } from '../xnl-projection';

const TAG_BY_KIND: Readonly<Record<XnlRichDocumentNodeKind, string>> = Object.freeze({
  document: 'Document',
  paragraph: 'Paragraph',
  heading: 'Heading',
  blockquote: 'Blockquote',
  'bullet-list': 'BulletList',
  'ordered-list': 'OrderedList',
  'list-item': 'ListItem',
  'task-list': 'TaskList',
  'task-item': 'TaskItem',
  'horizontal-rule': 'HorizontalRule',
  image: 'Image',
  table: 'Table',
  'table-row': 'TableRow',
  'table-cell': 'TableCell',
  'table-header': 'TableHeader',
  'code-block': 'CodeBlock',
  mermaid: 'Mermaid',
  'component-embed': 'ComponentEmbed',
  'capsule-embed': 'CapsuleEmbed',
  'hard-break': 'HardBreak',
  text: 'Text',
});

const KIND_BY_TAG = new Map<string, XnlRichDocumentNodeKind>(
  Object.entries(TAG_BY_KIND).map(([kind, tag]) => [tag, kind as XnlRichDocumentNodeKind]),
);

export type XnlRichDocumentXnlMaterializationResult =
  | Readonly<{
      status: 'materialized';
      document: XnlNode;
      richDocument: XnlRichDocument;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]];
    }>;

export function adaptXnlNodeToRichDocument(node: XnlNode): XnlRichDocumentNormalizedResult {
  try {
    const dialect = createXnlRichDocumentProjectionDialect();
    const runtime = createXnlProjectionCompilerRuntime<XnlNode>({ dialects: [dialect] });
    const plan = compileXnlProjection(runtime, createXnlProjectionRootInput(node), {});
    return lowerXnlRichDocument({}, { plan }, {});
  } catch (error) {
    return rejected(`Concrete XNL could not be adapted to RichDocument: ${messageOf(error)}`);
  }
}

export function materializeXnlRichDocument(
  candidate: XnlRichDocumentSerializableValue,
): XnlRichDocumentXnlMaterializationResult {
  const normalized = parseXnlRichDocumentCandidate({}, { candidate }, {});
  if (normalized.status === 'rejected') return normalized;

  try {
    const concrete = toXnlNode(normalized.document);
    const reparsed = parseXnl(stringifyLineBlock(concrete)).nodes[0];
    if (reparsed === undefined) {
      return rejected('xnl-core parser produced no root node for the RichDocument candidate.');
    }
    return Object.freeze({
      status: 'materialized',
      document: deepFreeze(concrete),
      richDocument: deepFreeze(normalized.document),
    });
  } catch (error) {
    return rejected(`RichDocument candidate could not be materialized by xnl-core: ${messageOf(error)}`);
  }
}

export function createXnlRichDocumentProjectionDialect(): XnlProjectionCompilerDialect<XnlNode> {
  const transformer: XnlProjectionCompilerDialect<XnlNode>['transformers'][string] =
    (_runtime, input): XnlProjectionPlanNode => {
      const classificationId = input.classification?.id ?? 'xnl.rich-document:unsupported';
      const data = projectionData(input.node);
      return {
        kind: 'xnl-projection-plan-node',
        id: createXnlProjectionPlanNodeId(input.context.domain),
        domain: input.context.domain,
        classification: input.classification ?? { id: classificationId },
        presenter: input.presentation ?? { id: `xnl.rich-document.presenter:${classificationId}` },
        ...(data === undefined ? {} : { data }),
        children: input.children ?? [],
      };
    };
  const transformers = Object.freeze(Object.fromEntries(
    Object.values(XNL_RICH_DOCUMENT_CLASSIFICATION_IDS).map((classificationId) => [
      classificationId,
      transformer,
    ]),
  )) as XnlProjectionCompilerDialect<XnlNode>['transformers'];

  return {
    id: 'xnl-rich-document.support-xnl-dialect',
    children: (_runtime, input) => projectionChildren(input.node),
    classify: (_runtime, input): XnlProjectionClassification => {
      const kind = richKind(input.node);
      return kind === undefined
        ? {
            id: 'xnl.rich-document:unsupported',
            diagnostics: [{
              severity: 'error',
              code: 'UNSUPPORTED_XNL_RICH_DOCUMENT_TAG',
              message: 'Concrete XNL node is not part of the RichDocument dialect.',
              path: input.context.domain.path,
            }],
          }
        : { id: XNL_RICH_DOCUMENT_CLASSIFICATION_IDS[kind], facts: { kind } };
    },
    transformers,
  };
}

function projectionChildren(node: XnlNode): readonly XnlProjectionCompileChild<XnlNode>[] {
  if (!isDataElement(node)) return [];
  return (node.body ?? []).map((child, index) => {
    const element = isDataElement(child) ? child : undefined;
    return {
      node: child,
      pathSegment: index,
      path: ['body', index],
      role: 'body',
      ...(element === undefined ? {} : {
        tag: element.tag,
        ...(wordToString(element.id) === undefined ? {} : { nodeId: wordToString(element.id) }),
      }),
    };
  });
}

function projectionData(node: XnlNode): XnlProjectionSerializableRecord | undefined {
  if (!isDataElement(node)) return undefined;
  const kind = richKind(node);
  if (kind === undefined) return undefined;
  const attributes = node.attributes ?? {};
  const pick = (...keys: string[]): XnlProjectionSerializableRecord => Object.freeze(
    Object.fromEntries(keys
      .filter((key) => Object.prototype.hasOwnProperty.call(attributes, key))
      .map((key) => [key, cloneProjectionValue(attributes[key])])),
  ) as XnlProjectionSerializableRecord;

  switch (kind) {
    case 'paragraph': return pick('align');
    case 'heading': return pick('level', 'align');
    case 'ordered-list': return pick('start');
    case 'task-item': return pick('checked');
    case 'image': return pick('src', 'alt', 'title');
    case 'table-cell':
    case 'table-header': return pick('colspan', 'rowspan');
    case 'code-block': return pick('language', 'text');
    case 'mermaid': return pick('source');
    case 'component-embed':
    case 'capsule-embed': return pick('ref', 'version', 'input');
    case 'text': return pick('text', 'marks');
    default: return Object.freeze({});
  }
}

function cloneProjectionValue(value: XnlNode | undefined): XnlProjectionSerializableValue {
  return cloneXnlValue(value) as XnlProjectionSerializableValue;
}

function richKind(node: XnlNode): XnlRichDocumentNodeKind | undefined {
  return isDataElement(node) ? KIND_BY_TAG.get(node.tag) : undefined;
}

function toXnlNode(node: XnlRichDocumentNode): XnlNode {
  if (node.kind === 'text') {
    return element(node.kind, undefined, {
      text: node.text,
      ...(node.marks === undefined ? {} : { marks: cloneXnlValue(node.marks) }),
    });
  }

  switch (node.kind) {
    case 'document':
    case 'blockquote':
    case 'bullet-list':
    case 'task-list':
    case 'list-item':
    case 'table':
    case 'table-row':
      return element(node.kind, node.nodeId, {}, node.children.map(toXnlNode));
    case 'task-item':
      return element(node.kind, node.nodeId, { checked: node.checked }, node.children.map(toXnlNode));
    case 'paragraph':
      return element(node.kind, node.nodeId, node.align === undefined ? {} : { align: node.align }, node.content.map(toXnlNode));
    case 'heading':
      return element(node.kind, node.nodeId, {
        level: node.level,
        ...(node.align === undefined ? {} : { align: node.align }),
      }, node.content.map(toXnlNode));
    case 'ordered-list':
      return element(
        node.kind,
        node.nodeId,
        node.start === undefined ? {} : { start: node.start },
        node.children.map(toXnlNode),
      );
    case 'horizontal-rule':
    case 'hard-break':
      return element(node.kind, node.nodeId, {});
    case 'image':
      return element(node.kind, node.nodeId, {
        src: node.src,
        ...(node.alt === undefined ? {} : { alt: node.alt }),
        ...(node.title === undefined ? {} : { title: node.title }),
      });
    case 'table-cell':
    case 'table-header':
      return element(node.kind, node.nodeId, {
        ...(node.colspan === undefined ? {} : { colspan: node.colspan }),
        ...(node.rowspan === undefined ? {} : { rowspan: node.rowspan }),
      }, node.children.map(toXnlNode));
    case 'code-block':
      return element(node.kind, node.nodeId, {
        ...(node.language === undefined ? {} : { language: node.language }),
        text: node.text,
      });
    case 'mermaid':
      return element(node.kind, node.nodeId, { source: node.source });
    case 'component-embed':
      return element(node.kind, node.nodeId, {
        ref: node.component.ref,
        ...(node.component.version === undefined ? {} : { version: node.component.version }),
        ...(node.input === undefined ? {} : { input: cloneXnlValue(node.input) }),
      });
    case 'capsule-embed':
      return element(node.kind, node.nodeId, {
        ref: node.capsule.ref,
        ...(node.capsule.version === undefined ? {} : { version: node.capsule.version }),
        ...(node.input === undefined ? {} : { input: cloneXnlValue(node.input) }),
      });
  }
}

function element(
  kind: XnlRichDocumentNodeKind,
  nodeId: string | undefined,
  attributes: Readonly<Record<string, XnlNode>>,
  body?: readonly XnlNode[],
): DataElementNode {
  const concreteAttributes = cloneXnlValue(attributes) as Record<string, XnlNode>;
  return {
    kind: 'DataElement',
    tag: TAG_BY_KIND[kind],
    ...(nodeId === undefined ? {} : { id: wordFromId(nodeId) }),
    metadata: {},
    ...(Object.keys(attributes).length === 0 ? {} : { attributes: concreteAttributes }),
    ...(body === undefined ? {} : { body: [...body] }),
  };
}

function wordFromId(nodeId: string): XnlWord {
  const segments = nodeId.split('.');
  return {
    kind: 'Word',
    namespace: segments.slice(0, -1),
    name: segments.at(-1) ?? nodeId,
  };
}

function cloneXnlValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): XnlNode {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    throw new TypeError('Structured XNL numbers must be finite and must not be negative zero.');
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Structured XNL cannot represent a value of runtime type "${typeof value}".`);
  }

  let array: boolean;
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError('Structured XNL value descriptors could not be inspected safely.');
  }
  if ((array && prototype !== Array.prototype)
    || (!array && prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError('Structured XNL values must use plain object or array prototypes.');
  }
  if (ancestors.has(value)) {
    throw new TypeError('Structured XNL values must not contain cycles.');
  }
  if (Reflect.ownKeys(descriptors).some((key) => typeof key === 'symbol')) {
    throw new TypeError('Structured XNL values must not contain symbol keys.');
  }

  ancestors.add(value);
  try {
    if (array) return cloneXnlArray(descriptors, ancestors);
    return cloneXnlRecord(descriptors, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function cloneXnlArray(
  descriptors: PropertyDescriptorMap,
  ancestors: WeakSet<object>,
): XnlNode[] {
  const lengthDescriptor = descriptors.length;
  if (!isDataDescriptor(lengthDescriptor)
    || typeof lengthDescriptor.value !== 'number'
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0) {
    throw new TypeError('Structured XNL arrays require a safe non-negative length.');
  }
  const length = lengthDescriptor.value;
  const allowedKeys = new Set<string>(['length']);
  const result = new Array<XnlNode>(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedKeys.add(key);
    const descriptor = descriptors[key];
    if (!isEnumerableDataDescriptor(descriptor)) {
      throw new TypeError('Structured XNL arrays must be dense data-property arrays.');
    }
    result[index] = cloneXnlValue(descriptor.value, ancestors);
  }
  if (Object.keys(descriptors).some((key) => !allowedKeys.has(key))) {
    throw new TypeError('Structured XNL arrays must not contain custom properties.');
  }
  return result;
}

function cloneXnlRecord(
  descriptors: PropertyDescriptorMap,
  ancestors: WeakSet<object>,
): Record<string, XnlNode> {
  const result = Object.create(null) as Record<string, XnlNode>;
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!isEnumerableDataDescriptor(descriptor)) {
      throw new TypeError('Structured XNL records must contain enumerable data properties only.');
    }
    Object.defineProperty(result, key, {
      value: cloneXnlValue(descriptor.value, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & {
  readonly value: unknown;
} {
  return descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

function isEnumerableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return isDataDescriptor(descriptor) && descriptor.enumerable === true;
}

function isDataElement(value: XnlNode): value is DataElementNode {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'DataElement';
}

function rejected(message: string): XnlRichDocumentNormalizedResult & XnlRichDocumentXnlMaterializationResult {
  return Object.freeze({
    status: 'rejected',
    diagnostics: Object.freeze([{
      severity: 'error',
      code: 'LOSSY_CONSTRUCT',
      message,
      path: [],
    }]) as readonly [XnlRichDocumentDiagnostic],
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
