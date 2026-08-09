import {
  XNL_RICH_DOCUMENT_CLASSIFICATION_IDS,
  XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES,
  XNL_RICH_DOCUMENT_MARK_KINDS,
  validateXnlProjectionPlan,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlRichDocument,
  type XnlRichDocumentBlockNode,
  type XnlRichDocumentDiagnostic,
  type XnlRichDocumentDomainNodeId,
  type XnlRichDocumentGenericInputRecord,
  type XnlRichDocumentInlineNode,
  type XnlRichDocumentLogicConfig,
  type XnlRichDocumentLogicRuntime,
  type XnlRichDocumentLowerInput,
  type XnlRichDocumentListItem,
  type XnlRichDocumentMark,
  type XnlRichDocumentNode,
  type XnlRichDocumentNodeKind,
  type XnlRichDocumentNormalizedResult,
  type XnlRichDocumentParseInput,
  type XnlRichDocumentSerializableRecord,
  type XnlRichDocumentSerializableValue,
  type XnlRichDocumentTableCellNode,
  type XnlRichDocumentTableRow,
  type XnlRichDocumentTaskItem,
  type XnlRichDocumentText,
} from 'dg-cell-mvi-halfcode-contract';
import { isXnlRichDocumentColor } from './color';

const CLASSIFICATION_TO_KIND = new Map<string, XnlRichDocumentNodeKind>(
  Object.entries(XNL_RICH_DOCUMENT_CLASSIFICATION_IDS)
    .map(([kind, classification]) => [classification, kind as XnlRichDocumentNodeKind]),
);

const BLOCK_KINDS = new Set<XnlRichDocumentNodeKind>([
  'paragraph',
  'heading',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'task-list',
  'horizontal-rule',
  'image',
  'table',
  'code-block',
  'mermaid',
  'component-embed',
  'capsule-embed',
]);
const INLINE_KINDS = new Set<XnlRichDocumentNodeKind>(['text', 'hard-break']);
const LIST_ITEM_KIND = new Set<XnlRichDocumentNodeKind>(['list-item']);
const TASK_ITEM_KIND = new Set<XnlRichDocumentNodeKind>(['task-item']);
const TABLE_ROW_KIND = new Set<XnlRichDocumentNodeKind>(['table-row']);
const TABLE_CELL_KINDS = new Set<XnlRichDocumentNodeKind>(['table-cell', 'table-header']);
const MARK_ORDER = new Map<string, number>(
  XNL_RICH_DOCUMENT_MARK_KINDS.map((kind, index) => [kind, index]),
);
const GENERIC_INPUT_OWNERSHIP_FIELD_NAMES = new Set<string>(
  XNL_RICH_DOCUMENT_GENERIC_INPUT_OWNERSHIP_FIELD_NAMES,
);

interface ParseContext {
  diagnostics: XnlRichDocumentDiagnostic[];
  identities: Map<string, readonly (string | number)[]>;
}

export type XnlRichDocumentSafeInputRecordResult =
  | Readonly<{
      ok: true;
      value: XnlRichDocumentSerializableRecord;
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]];
    }>;

export function parseXnlRichDocumentInputRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  path: readonly (string | number)[] = [],
): XnlRichDocumentSafeInputRecordResult {
  const context: ParseContext = {
    diagnostics: [],
    identities: new Map(),
  };
  const parsed = parseSerializableValue(value, path, context, new WeakSet(), false);
  if (!isRecord(parsed)) {
    if (context.diagnostics.length === 0) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'RichDocument processor input must be a plain serializable record.',
        path,
      ));
    }
    return {
      ok: false,
      diagnostics: context.diagnostics as [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
    };
  }
  checkAllowedKeys(parsed, allowedKeys, path, context);
  if (context.diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: context.diagnostics as [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
    };
  }
  return { ok: true, value: parsed };
}

export function lowerXnlRichDocument(
  _runtime: XnlRichDocumentLogicRuntime,
  input: XnlRichDocumentLowerInput,
  _config: XnlRichDocumentLogicConfig = {},
): XnlRichDocumentNormalizedResult {
  const safeInput = parseXnlRichDocumentInputRecord(input, new Set(['plan']));
  if (!safeInput.ok) return rejected(safeInput.diagnostics);

  let validation: ReturnType<typeof validateXnlProjectionPlan>;
  try {
    validation = validateXnlProjectionPlan(safeInput.value.plan as unknown as XnlProjectionPlan);
  } catch {
    return rejected([diagnostic(
      'LOSSY_CONSTRUCT',
      'Projection plan could not be inspected as neutral RichDocument input.',
      ['plan'],
    )]);
  }
  if (!validation.ok) {
    return rejected(validation.issues.map((issue) => diagnostic(
      'LOSSY_CONSTRUCT',
      `Projection plan is not valid neutral input: ${issue.message}`,
      parseValidationPath(issue.path),
      { projectionCode: issue.code ?? 'INVALID_PROJECTION_PLAN' },
    )));
  }

  const plan = safeInput.value.plan as unknown as XnlProjectionPlan;
  const diagnostics: XnlRichDocumentDiagnostic[] = [];
  collectProjectionDiagnostics(plan.diagnostics, [], diagnostics);
  const candidate = lowerPlanNode(plan.root, [], diagnostics);
  if (diagnostics.length > 0 || candidate === undefined) {
    return rejected(diagnostics.length > 0 ? diagnostics : [diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      'Projection plan root could not be lowered.',
      [],
    )]);
  }
  return parseXnlRichDocumentCandidate(_runtime, { candidate }, _config);
}

export function parseXnlRichDocumentCandidate(
  _runtime: XnlRichDocumentLogicRuntime,
  input: XnlRichDocumentParseInput,
  _config: XnlRichDocumentLogicConfig = {},
): XnlRichDocumentNormalizedResult {
  const safeInput = parseXnlRichDocumentInputRecord(input, new Set(['candidate']));
  if (!safeInput.ok) return rejected(safeInput.diagnostics);

  const context: ParseContext = {
    diagnostics: [],
    identities: new Map(),
  };
  const document = parseNode(safeInput.value.candidate, [], new Set(['document']), context);
  if (context.diagnostics.length > 0 || document?.kind !== 'document') {
    return rejected(context.diagnostics.length > 0 ? context.diagnostics : [diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      'RichDocument candidate root must have document kind.',
      [],
    )]);
  }
  return deepFreeze({ status: 'normalized', document });
}

export const normalizeXnlRichDocument = parseXnlRichDocumentCandidate;

function lowerPlanNode(
  node: XnlProjectionPlanNode,
  path: readonly (string | number)[],
  diagnostics: XnlRichDocumentDiagnostic[],
): XnlRichDocumentSerializableValue | undefined {
  const kind = CLASSIFICATION_TO_KIND.get(node.classification.id);
  if (kind === undefined) {
    diagnostics.push(diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      `Projection classification "${node.classification.id}" has no RichDocument representation.`,
      path,
      { classification: node.classification.id },
    ));
    return undefined;
  }

  collectProjectionDiagnostics(node.diagnostics, path, diagnostics);
  collectProjectionDiagnostics(node.classification.diagnostics, path, diagnostics);

  const data = readPlanData(node, kind, path, diagnostics);
  const children = node.children.map((child, index) => lowerPlanNode(
    child,
    [...path, 'children', index],
    diagnostics,
  )).filter((child): child is XnlRichDocumentSerializableValue => child !== undefined);
  const identity = kind === 'text' ? {} : { nodeId: node.domain.nodeId ?? '' };

  switch (kind) {
    case 'document':
    case 'blockquote':
    case 'bullet-list':
    case 'task-list':
    case 'list-item':
    case 'table':
    case 'table-row':
      return { kind, ...identity, children };
    case 'task-item':
      return { kind, ...identity, ...pick(data, ['checked']), children };
    case 'ordered-list':
      return { kind, ...identity, ...pick(data, ['start']), children };
    case 'paragraph':
    case 'heading':
      return { kind, ...identity, ...pick(data, ['level', 'align']), content: children };
    case 'horizontal-rule':
    case 'hard-break':
      return { kind, ...identity };
    case 'table-cell':
    case 'table-header':
      return { kind, ...identity, ...pick(data, ['colspan', 'rowspan']), children };
    case 'image':
      return { kind, ...identity, ...pick(data, ['src', 'alt', 'title']) };
    case 'code-block':
      return { kind, ...identity, ...pick(data, ['language', 'text']) };
    case 'mermaid':
      return { kind, ...identity, ...pick(data, ['source']) };
    case 'component-embed':
      return {
        kind,
        ...identity,
        component: pick(data, ['ref', 'version']),
        ...pick(data, ['input']),
      };
    case 'capsule-embed':
      return {
        kind,
        ...identity,
        capsule: pick(data, ['ref', 'version']),
        ...pick(data, ['input']),
      };
    case 'text':
      return { kind, ...pick(data, ['text', 'marks']) };
  }
}

function collectProjectionDiagnostics(
  source: XnlProjectionPlanNode['diagnostics'],
  path: readonly (string | number)[],
  target: XnlRichDocumentDiagnostic[],
): void {
  for (const sourceDiagnostic of source ?? []) {
    if (sourceDiagnostic.severity !== 'error') continue;
    target.push(diagnostic(
      sourceDiagnostic.code.includes('UNSUPPORTED') ? 'UNSUPPORTED_CONSTRUCT' : 'LOSSY_CONSTRUCT',
      `Projection data cannot be lowered: ${sourceDiagnostic.message}`,
      path,
      { projectionCode: sourceDiagnostic.code },
    ));
  }
}

function readPlanData(
  node: XnlProjectionPlanNode,
  kind: XnlRichDocumentNodeKind,
  path: readonly (string | number)[],
  diagnostics: XnlRichDocumentDiagnostic[],
): XnlRichDocumentSerializableRecord {
  const value = node.data;
  if (value === undefined) return {};
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      `RichDocument ${kind} projection data must be an object.`,
      [...path, 'data'],
    ));
    return {};
  }
  const allowed = PLAN_DATA_KEYS[kind];
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Projection data field "${key}" cannot be represented by RichDocument ${kind}.`,
        [...path, 'data', key],
      ));
    }
  }
  return value;
}

const PLAN_DATA_KEYS: Record<XnlRichDocumentNodeKind, ReadonlySet<string>> = {
  document: new Set(),
  paragraph: new Set(['align']),
  heading: new Set(['level', 'align']),
  blockquote: new Set(),
  'bullet-list': new Set(),
  'ordered-list': new Set(['start']),
  'list-item': new Set(),
  'task-list': new Set(),
  'task-item': new Set(['checked']),
  'horizontal-rule': new Set(),
  image: new Set(['src', 'alt', 'title']),
  table: new Set(),
  'table-row': new Set(),
  'table-cell': new Set(['colspan', 'rowspan']),
  'table-header': new Set(['colspan', 'rowspan']),
  'code-block': new Set(['language', 'text']),
  mermaid: new Set(['source']),
  'component-embed': new Set(['ref', 'version', 'input']),
  'capsule-embed': new Set(['ref', 'version', 'input']),
  'hard-break': new Set(),
  text: new Set(['text', 'marks']),
};

function parseNode(
  value: unknown,
  path: readonly (string | number)[],
  expectedKinds: ReadonlySet<XnlRichDocumentNodeKind>,
  context: ParseContext,
): XnlRichDocumentNode | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      'RichDocument node must be an object with a supported kind.',
      path,
    ));
    return undefined;
  }
  const kind = value.kind as XnlRichDocumentNodeKind;
  if (!Object.prototype.hasOwnProperty.call(XNL_RICH_DOCUMENT_CLASSIFICATION_IDS, kind)) {
    context.diagnostics.push(diagnostic(
      'UNSUPPORTED_CONSTRUCT',
      `RichDocument node kind "${value.kind}" is unsupported.`,
      [...path, 'kind'],
      { sourceKind: value.kind },
    ));
    return undefined;
  }
  if (!expectedKinds.has(kind)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      `RichDocument ${kind} is not valid at this structural position.`,
      path,
    ));
  }
  checkAllowedKeys(value, NODE_KEYS[kind], path, context);

  if (kind === 'text') return parseText(value, path, context);
  const nodeId = parseNodeId(value.nodeId, path, context);
  const identity = { nodeId: nodeId ?? ('' as XnlRichDocumentDomainNodeId) };

  switch (kind) {
    case 'document':
      return { kind, ...identity, children: parseBlockChildren(value.children, path, context) };
    case 'paragraph':
      return {
        kind,
        ...identity,
        ...parseOptionalAlignment(value.align, [...path, 'align'], context),
        content: parseInlineChildren(value.content, path, context),
      };
    case 'heading':
      return {
        kind,
        ...identity,
        level: parseInteger(value.level, [...path, 'level'], context, 1, 6) as 1 | 2 | 3 | 4 | 5 | 6,
        ...parseOptionalAlignment(value.align, [...path, 'align'], context),
        content: parseInlineChildren(value.content, path, context),
      };
    case 'blockquote':
      return { kind, ...identity, children: parseBlockChildren(value.children, path, context) };
    case 'bullet-list':
      return {
        kind,
        ...identity,
        children: parseListItems(value.children, path, context),
      };
    case 'ordered-list': {
      const start = parseOptionalInteger(value.start, [...path, 'start'], context, 1);
      return {
        kind,
        ...identity,
        ...(start === undefined ? {} : { start }),
        children: parseListItems(value.children, path, context),
      };
    }
    case 'list-item':
      return { kind, ...identity, children: parseBlockChildren(value.children, path, context) };
    case 'task-list':
      return {
        kind,
        ...identity,
        children: parseTaskItems(value.children, path, context),
      };
    case 'task-item':
      return {
        kind,
        ...identity,
        checked: parseBoolean(value.checked, [...path, 'checked'], context),
        children: parseBlockChildren(value.children, path, context),
      };
    case 'horizontal-rule':
    case 'hard-break':
      return { kind, ...identity };
    case 'image': {
      const src = parseRequiredString(value.src, [...path, 'src'], context);
      const alt = parseOptionalString(value.alt, [...path, 'alt'], context);
      const title = parseOptionalString(value.title, [...path, 'title'], context);
      return {
        kind,
        ...identity,
        src,
        ...(alt === undefined ? {} : { alt }),
        ...(title === undefined ? {} : { title }),
      };
    }
    case 'table':
      return { kind, ...identity, children: parseTableRows(value.children, path, context) };
    case 'table-row':
      return { kind, ...identity, children: parseTableCells(value.children, path, context) };
    case 'table-cell':
    case 'table-header': {
      const colspan = parseOptionalInteger(value.colspan, [...path, 'colspan'], context, 1);
      const rowspan = parseOptionalInteger(value.rowspan, [...path, 'rowspan'], context, 1);
      return {
        kind,
        ...identity,
        ...(colspan === undefined ? {} : { colspan }),
        ...(rowspan === undefined ? {} : { rowspan }),
        children: parseBlockChildren(value.children, path, context),
      };
    }
    case 'code-block': {
      const language = parseOptionalString(value.language, [...path, 'language'], context);
      return {
        kind,
        ...identity,
        ...(language === undefined ? {} : { language }),
        text: parseString(value.text, [...path, 'text'], context),
      };
    }
    case 'mermaid':
      return { kind, ...identity, source: parseString(value.source, [...path, 'source'], context) };
    case 'component-embed':
      return {
        kind,
        ...identity,
        component: parseEmbedRef(value.component, [...path, 'component'], context),
        ...parseOptionalInput(value.input, path, context),
      };
    case 'capsule-embed':
      return {
        kind,
        ...identity,
        capsule: parseEmbedRef(value.capsule, [...path, 'capsule'], context),
        ...parseOptionalInput(value.input, path, context),
      };
  }
}

const NODE_KEYS: Record<XnlRichDocumentNodeKind, ReadonlySet<string>> = {
  document: new Set(['kind', 'nodeId', 'children']),
  paragraph: new Set(['kind', 'nodeId', 'align', 'content']),
  heading: new Set(['kind', 'nodeId', 'level', 'align', 'content']),
  blockquote: new Set(['kind', 'nodeId', 'children']),
  'bullet-list': new Set(['kind', 'nodeId', 'children']),
  'ordered-list': new Set(['kind', 'nodeId', 'start', 'children']),
  'list-item': new Set(['kind', 'nodeId', 'children']),
  'task-list': new Set(['kind', 'nodeId', 'children']),
  'task-item': new Set(['kind', 'nodeId', 'checked', 'children']),
  'horizontal-rule': new Set(['kind', 'nodeId']),
  image: new Set(['kind', 'nodeId', 'src', 'alt', 'title']),
  table: new Set(['kind', 'nodeId', 'children']),
  'table-row': new Set(['kind', 'nodeId', 'children']),
  'table-cell': new Set(['kind', 'nodeId', 'colspan', 'rowspan', 'children']),
  'table-header': new Set(['kind', 'nodeId', 'colspan', 'rowspan', 'children']),
  'code-block': new Set(['kind', 'nodeId', 'language', 'text']),
  mermaid: new Set(['kind', 'nodeId', 'source']),
  'component-embed': new Set(['kind', 'nodeId', 'component', 'input']),
  'capsule-embed': new Set(['kind', 'nodeId', 'capsule', 'input']),
  'hard-break': new Set(['kind', 'nodeId']),
  text: new Set(['kind', 'text', 'marks']),
};

function parseText(
  value: XnlRichDocumentSerializableRecord,
  path: readonly (string | number)[],
  context: ParseContext,
): XnlRichDocumentNode {
  const marks = parseMarks(value.marks, [...path, 'marks'], context);
  return {
    kind: 'text',
    text: parseString(value.text, [...path, 'text'], context),
    ...(marks.length === 0 ? {} : { marks }),
  };
}

function parseMarks(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentMark[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Text marks must be an array.', path));
    return [];
  }
  const seen = new Set<string>();
  const marks: XnlRichDocumentMark[] = [];
  value.forEach((candidate, index) => {
    const markPath = [...path, index];
    if (!isRecord(candidate) || typeof candidate.kind !== 'string'
      || !MARK_ORDER.has(candidate.kind)) {
      context.diagnostics.push(diagnostic('UNSUPPORTED_CONSTRUCT', 'Text mark is unsupported.', markPath));
      return;
    }
    const kind = candidate.kind as XnlRichDocumentMark['kind'];
    if (seen.has(kind)) {
      context.diagnostics.push(diagnostic('LOSSY_CONSTRUCT', `Duplicate ${kind} mark is ambiguous.`, markPath));
      return;
    }
    seen.add(kind);
    if (kind === 'link') {
      checkAllowedKeys(candidate, new Set(['kind', 'href', 'title']), markPath, context);
      const href = parseRequiredString(candidate.href, [...markPath, 'href'], context);
      const title = parseOptionalString(candidate.title, [...markPath, 'title'], context);
      marks.push({ kind, href, ...(title === undefined ? {} : { title }) });
    } else if (kind === 'text-color' || kind === 'highlight') {
      checkAllowedKeys(candidate, new Set(['kind', 'color']), markPath, context);
      const color = kind === 'highlight'
        ? parseOptionalColor(candidate.color, [...markPath, 'color'], context)
        : parseRequiredColor(candidate.color, [...markPath, 'color'], context);
      if (kind === 'text-color') {
        if (color !== undefined) marks.push({ kind, color });
      } else {
        marks.push({ kind, ...(color === undefined ? {} : { color }) });
      }
    } else {
      checkAllowedKeys(candidate, new Set(['kind']), markPath, context);
      marks.push({ kind });
    }
  });
  return marks.sort((left, right) => (MARK_ORDER.get(left.kind) ?? 0) - (MARK_ORDER.get(right.kind) ?? 0));
}

function parseNodeId(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): XnlRichDocumentDomainNodeId | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    context.diagnostics.push(diagnostic(
      'MISSING_DOMAIN_NODE_ID',
      'A persistent RichDocument node must have a non-empty Domain #id.',
      [...path, 'nodeId'],
    ));
    return undefined;
  }
  const existing = context.identities.get(value);
  if (existing !== undefined) {
    context.diagnostics.push(diagnostic(
      'DUPLICATE_DOMAIN_NODE_ID',
      `Persistent Domain #id "${value}" is duplicated.`,
      [...path, 'nodeId'],
      { firstPath: existing },
      value as XnlRichDocumentDomainNodeId,
    ));
  } else {
    context.identities.set(value, [...path, 'nodeId']);
  }
  return value as XnlRichDocumentDomainNodeId;
}

function parseBlockChildren(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentBlockNode[] {
  return parseChildren(value, path, 'children', BLOCK_KINDS, context) as readonly XnlRichDocumentBlockNode[];
}

function parseInlineChildren(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentInlineNode[] {
  return parseChildren(value, path, 'content', INLINE_KINDS, context) as readonly XnlRichDocumentInlineNode[];
}

function parseTaskItems(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentTaskItem[] {
  return parseChildren(value, path, 'children', TASK_ITEM_KIND, context) as readonly XnlRichDocumentTaskItem[];
}

function parseListItems(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentListItem[] {
  return parseChildren(value, path, 'children', LIST_ITEM_KIND, context) as readonly XnlRichDocumentListItem[];
}

function parseTableRows(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentTableRow[] {
  return parseChildren(value, path, 'children', TABLE_ROW_KIND, context) as readonly XnlRichDocumentTableRow[];
}

function parseTableCells(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): readonly XnlRichDocumentTableCellNode[] {
  return parseChildren(value, path, 'children', TABLE_CELL_KINDS, context) as readonly XnlRichDocumentTableCellNode[];
}

function parseChildren(
  value: unknown,
  path: readonly (string | number)[],
  childKey: 'children' | 'content',
  expectedKinds: ReadonlySet<XnlRichDocumentNodeKind>,
  context: ParseContext,
): readonly XnlRichDocumentNode[] {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      `RichDocument ${childKey} must be an array.`,
      [...path, childKey],
    ));
    return [];
  }
  return value.map((child, index) => parseNode(
    child,
    [...path, childKey, index],
    expectedKinds,
    context,
  ))
    .filter((child): child is XnlRichDocumentNode => child !== undefined);
}

function parseEmbedRef(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): { readonly ref: string; readonly version?: string } {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Embed reference must be an object.', path));
    return { ref: '' };
  }
  checkAllowedKeys(value, new Set(['ref', 'version']), path, context);
  const version = parseOptionalString(value.version, [...path, 'version'], context);
  return {
    ref: parseRequiredString(value.ref, [...path, 'ref'], context),
    ...(version === undefined ? {} : { version }),
  };
}

function parseOptionalInput(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): { readonly input?: XnlRichDocumentGenericInputRecord } {
  if (value === undefined) return {};
  const inputPath = [...path, 'input'];
  const parsed = parseSerializableValue(value, inputPath, context, new WeakSet(), true);
  if (!isRecord(parsed)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Embed input must be a serializable record.',
      inputPath,
    ));
    return {};
  }
  return { input: parsed as XnlRichDocumentGenericInputRecord };
}

function parseSerializableValue(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
  ancestors: WeakSet<object>,
  rejectOwnershipFields: boolean,
): XnlRichDocumentSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable numbers must be finite and must not be negative zero.',
      path,
    ));
    return undefined;
  }
  if (typeof value !== 'object') {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      `Value of runtime type "${typeof value}" is not serializable.`,
      path,
    ));
    return undefined;
  }

  let array: boolean;
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable data descriptors could not be inspected safely.',
      path,
    ));
    return undefined;
  }

  if ((array && prototype !== Array.prototype)
    || (!array && prototype !== Object.prototype && prototype !== null)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable data must use a plain object or array prototype.',
      path,
    ));
    return undefined;
  }
  if (ancestors.has(value)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable data must not contain cycles.',
      path,
    ));
    return undefined;
  }

  const descriptorKeys = Reflect.ownKeys(descriptors);
  const symbolKey = descriptorKeys.find((key) => typeof key === 'symbol');
  if (symbolKey !== undefined) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable data must not contain symbol keys.',
      path,
    ));
    return undefined;
  }

  ancestors.add(value);
  try {
    if (array) {
      return parseSerializableArray(
        descriptors,
        path,
        context,
        ancestors,
        rejectOwnershipFields,
      );
    }
    return parseSerializableRecord(
      descriptors,
      path,
      context,
      ancestors,
      rejectOwnershipFields,
    );
  } finally {
    ancestors.delete(value);
  }
}

function parseSerializableArray(
  descriptors: PropertyDescriptorMap,
  path: readonly (string | number)[],
  context: ParseContext,
  ancestors: WeakSet<object>,
  rejectOwnershipFields: boolean,
): readonly XnlRichDocumentSerializableValue[] | undefined {
  const lengthDescriptor = descriptors.length;
  if (!isDataDescriptor(lengthDescriptor)
    || typeof lengthDescriptor.value !== 'number'
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Serializable array length must be a safe non-negative integer data property.',
      path,
    ));
    return undefined;
  }

  const length = lengthDescriptor.value;
  const allowedKeys = new Set<string>(['length']);
  const result: XnlRichDocumentSerializableValue[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedKeys.add(key);
    const descriptor = descriptors[key];
    if (!isEnumerableDataDescriptor(descriptor)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        'Serializable arrays must be dense and contain data properties only.',
        [...path, index],
      ));
      continue;
    }
    const child = parseSerializableValue(
      descriptor.value,
      [...path, index],
      context,
      ancestors,
      rejectOwnershipFields,
    );
    if (child !== undefined) result[index] = child;
  }

  for (const key of Object.keys(descriptors)) {
    if (!allowedKeys.has(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Array property "${key}" is not representable as serializable data.`,
        [...path, key],
      ));
    }
  }
  return result;
}

function parseSerializableRecord(
  descriptors: PropertyDescriptorMap,
  path: readonly (string | number)[],
  context: ParseContext,
  ancestors: WeakSet<object>,
  rejectOwnershipFields: boolean,
): XnlRichDocumentSerializableRecord {
  const result: Record<string, XnlRichDocumentSerializableValue> = {};
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    if (!isEnumerableDataDescriptor(descriptor)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Serializable property "${key}" must be an enumerable data property.`,
        [...path, key],
      ));
      continue;
    }
    if (rejectOwnershipFields && GENERIC_INPUT_OWNERSHIP_FIELD_NAMES.has(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Ownership-bearing field "${key}" is not permitted in generic serializable data.`,
        [...path, key],
      ));
      continue;
    }
    const child = parseSerializableValue(
      descriptor.value,
      [...path, key],
      context,
      ancestors,
      rejectOwnershipFields,
    );
    if (child !== undefined) {
      Object.defineProperty(result, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
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

function isEnumerableDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & {
  readonly value: unknown;
} {
  return isDataDescriptor(descriptor) && descriptor.enumerable === true;
}

function checkAllowedKeys(
  value: XnlRichDocumentSerializableRecord,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[],
  context: ParseContext,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      context.diagnostics.push(diagnostic(
        'LOSSY_CONSTRUCT',
        `Field "${key}" is not representable in canonical RichDocument data.`,
        [...path, key],
      ));
    }
  }
}

function parseRequiredString(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): string {
  const parsed = parseString(value, path, context);
  if (parsed.length === 0) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Value must be a non-empty string.',
      path,
    ));
  }
  return parsed;
}

function parseString(value: unknown, path: readonly (string | number)[], context: ParseContext): string {
  if (typeof value === 'string') return value;
  context.diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Value must be a string.', path));
  return '';
}

function parseOptionalString(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): string | undefined {
  if (value === undefined) return undefined;
  return parseString(value, path, context);
}

const ALIGNMENTS = new Set(['start', 'center', 'end', 'justify']);

function parseOptionalAlignment(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): { readonly align?: 'start' | 'center' | 'end' | 'justify' } {
  if (value === undefined) return {};
  if (typeof value !== 'string' || !ALIGNMENTS.has(value)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Text alignment must be start, center, end or justify.',
      path,
    ));
    return {};
  }
  return { align: value as 'start' | 'center' | 'end' | 'justify' };
}

function parseRequiredColor(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): string | undefined {
  if (!isXnlRichDocumentColor(value)) {
    context.diagnostics.push(diagnostic(
      'LOSSY_CONSTRUCT',
      'Color must be a safe canonical color token.',
      path,
    ));
    return undefined;
  }
  return value;
}

function parseOptionalColor(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): string | undefined {
  return value === undefined ? undefined : parseRequiredColor(value, path, context);
}

function parseBoolean(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
): boolean {
  if (typeof value === 'boolean') return value;
  context.diagnostics.push(diagnostic('LOSSY_CONSTRUCT', 'Value must be a boolean.', path));
  return false;
}

function parseInteger(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum) return value;
  context.diagnostics.push(diagnostic(
    'LOSSY_CONSTRUCT',
    `Value must be an integer from ${minimum} to ${maximum}.`,
    path,
  ));
  return minimum;
}

function parseOptionalInteger(
  value: unknown,
  path: readonly (string | number)[],
  context: ParseContext,
  minimum: number,
): number | undefined {
  if (value === undefined) return undefined;
  return parseInteger(value, path, context, minimum);
}

function pick(record: XnlRichDocumentSerializableRecord, keys: readonly string[]): XnlRichDocumentSerializableRecord {
  const result: Record<string, XnlRichDocumentSerializableValue> = {};
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) result[key] = cloneSerializable(value);
  }
  return result;
}

function cloneSerializable(value: XnlRichDocumentSerializableValue): XnlRichDocumentSerializableValue {
  if (Array.isArray(value)) return value.map(cloneSerializable);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
      const child = value[key];
      return child === undefined ? [] : [[key, cloneSerializable(child)]];
    })) as XnlRichDocumentSerializableRecord;
  }
  return value;
}

function rejected(diagnostics: readonly XnlRichDocumentDiagnostic[]): XnlRichDocumentNormalizedResult {
  const nonEmpty = diagnostics.length > 0
    ? diagnostics
    : [diagnostic('LOSSY_CONSTRUCT', 'RichDocument normalization failed.', [])];
  return deepFreeze({
    status: 'rejected',
    diagnostics: nonEmpty as [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]],
  });
}

function diagnostic(
  code: XnlRichDocumentDiagnostic['code'],
  message: string,
  path: readonly (string | number)[],
  details?: XnlRichDocumentSerializableRecord,
  nodeId?: XnlRichDocumentDomainNodeId,
): XnlRichDocumentDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    path,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(details === undefined ? {} : { details }),
  };
}

function parseValidationPath(path: string): readonly (string | number)[] {
  return path === '$' ? [] : [path];
}

function isRecord(value: unknown): value is XnlRichDocumentSerializableRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
