import {
  XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
  XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
  XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION,
  isXnlRichDocumentSemanticEditKind,
  validateXnlProjectionInteraction,
  validateXnlProjectionPlan,
  type XnlProjectionCommandResult,
  type XnlProjectionDiagnostic,
  type XnlProjectionInteraction,
  type XnlProjectionPlanNode,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
  type XnlRichDocumentEditCommand,
  type XnlRichDocumentEditInteractionPayload,
  type XnlRichDocumentSemanticEdit,
} from 'dg-cell-mvi-halfcode-contract';
import type { XnlProjectionCompilerDialect } from '../xnl-projection/compiler';

export type XnlRichDocumentEditTranslationRuntime = Readonly<Record<PropertyKey, never>>;

export type XnlRichDocumentEditTranslationInput = Readonly<{
  planNode: XnlProjectionPlanNode;
  interaction: XnlProjectionInteraction;
}>;

export type XnlRichDocumentEditTranslationConfig = Readonly<Record<PropertyKey, never>>;

export type XnlRichDocumentEditTranslator = (
  runtime: XnlRichDocumentEditTranslationRuntime,
  input: XnlRichDocumentEditTranslationInput,
  config: XnlRichDocumentEditTranslationConfig,
) => XnlProjectionCommandResult;

type Path = readonly (string | number)[];

type ValidationContext = {
  diagnostics: XnlProjectionDiagnostic[];
};

const EMPTY = Object.freeze({}) as XnlRichDocumentEditTranslationRuntime;
const INPUT_KEYS = new Set(['planNode', 'interaction']);
const PAYLOAD_KEYS = new Set(['version', 'edits']);
const REF_KEYS = new Set(['kind', 'nodeId', 'localNodeId']);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/;

export const translateXnlRichDocumentEditInteraction: XnlRichDocumentEditTranslator = (
  _runtime,
  input,
  _config,
) => {
  try {
  const snapped = snapshotSerializable(input, [], new WeakSet());
  if (snapped.status === 'rejected') return rejected(snapped.diagnostics);
  if (!isRecord(snapped.value)) return rejected([diagnostic('INVALID_TRANSLATION_INPUT', 'Translation input must be a plain record.')]);

  const inputDiagnostic = exactKeys(snapped.value, INPUT_KEYS, [], 'Translation input');
  if (inputDiagnostic !== undefined) return rejected([inputDiagnostic]);
  const planNode = snapped.value.planNode;
  const interaction = snapped.value.interaction;
  if (!isRecord(planNode) || !isRecord(interaction)) {
    return rejected([diagnostic('INVALID_TRANSLATION_INPUT', 'Translation input requires planNode and interaction records.')]);
  }

  const planValidation = validateXnlProjectionPlan({
    kind: 'xnl-projection-plan',
    id: 'xnl-rich-document:translation-target',
    root: planNode,
  });
  if (!planValidation.ok) {
    return rejected(planValidation.issues.map((issue) => diagnostic(
      'UNRESOLVED_RICH_DOCUMENT_TARGET',
      issue.message,
      planNode,
      pathFromValidationIssue(issue.path),
    )));
  }
  const interactionValidation = validateXnlProjectionInteraction(interaction);
  if (!interactionValidation.ok) {
    return rejected(interactionValidation.issues.map((issue) => diagnostic(
      'INVALID_RICH_DOCUMENT_INTERACTION',
      issue.message,
      planNode,
      pathFromValidationIssue(issue.path),
    )));
  }

  const typedPlanNode = planNode as unknown as XnlProjectionPlanNode;
  const typedInteraction = interaction as unknown as XnlProjectionInteraction;
  if (typedInteraction.type !== XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE) {
    return unsupported([diagnostic(
      'UNSUPPORTED_RICH_DOCUMENT_INTERACTION',
      `Unsupported interaction type "${typedInteraction.type}".`,
      typedPlanNode,
    )]);
  }
  if (typedInteraction.target.planNodeId !== typedPlanNode.id) {
    return rejected([diagnostic(
      'UNRESOLVED_RICH_DOCUMENT_TARGET',
      `Interaction target "${typedInteraction.target.planNodeId}" does not resolve to plan node "${typedPlanNode.id}".`,
      typedPlanNode,
      ['target', 'planNodeId'],
    )]);
  }
  if (typedInteraction.target.domain !== undefined
    && !equalSerializable(typedInteraction.target.domain, typedPlanNode.domain)) {
    return rejected([diagnostic(
      'UNRESOLVED_RICH_DOCUMENT_TARGET',
      'Interaction target domain does not match the resolved plan node domain.',
      typedPlanNode,
      ['target', 'domain'],
    )]);
  }
  if (typedInteraction.target.path !== undefined
    && !equalSerializable(typedInteraction.target.path, typedPlanNode.domain.path)) {
    return rejected([diagnostic(
      'UNRESOLVED_RICH_DOCUMENT_TARGET',
      'Interaction target path does not match the resolved plan node domain path.',
      typedPlanNode,
      ['target', 'path'],
    )]);
  }

  const context: ValidationContext = { diagnostics: [] };
  validatePayload(typedInteraction.payload, ['payload'], context);
  if (context.diagnostics.length > 0) return rejected(context.diagnostics.map((item) => withPlan(item, typedPlanNode)));

  const payload = typedInteraction.payload as XnlRichDocumentEditInteractionPayload;
  const command: XnlRichDocumentEditCommand = {
    type: XNL_RICH_DOCUMENT_EDIT_COMMAND_TYPE,
    target: typedPlanNode.domain as XnlRichDocumentEditCommand['target'],
    payload,
    provenance: {
      interactionType: XNL_RICH_DOCUMENT_EDIT_INTERACTION_TYPE,
      ...(typedInteraction.id !== undefined ? { interactionId: typedInteraction.id } : {}),
    },
  };
  return deepFreeze({ status: 'translated', command });
  } catch {
    return rejected([diagnostic(
      'LOSSY_RICH_DOCUMENT_INTERACTION',
      'RichDocument interaction could not be inspected safely.',
    )]);
  }
};

export function createXnlRichDocumentSemanticDialect(): XnlProjectionCompilerDialect<unknown> {
  return deepFreeze({
    id: 'xnl-rich-document:semantic',
    children: (_runtime, _input, _config) => [],
    classify: (_runtime, _input, _config) => ({ id: 'unsupported' }),
    transformers: {},
    translateInteraction: (_runtime, input, _config) => translateXnlRichDocumentEditInteraction(
      EMPTY,
      { planNode: input.planNode, interaction: input.interaction },
      EMPTY,
    ),
  });
}

function validatePayload(value: unknown, path: Path, context: ValidationContext): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_PAYLOAD', 'RichDocument edit payload must be a plain record.', undefined, path));
    return;
  }
  pushExactKeys(value, PAYLOAD_KEYS, path, 'RichDocument edit payload', context);
  if (value.version !== XNL_RICH_DOCUMENT_SEMANTIC_CONTRACT_VERSION) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_PAYLOAD', 'RichDocument edit payload uses an unsupported version.', undefined, [...path, 'version']));
  }
  if (!Array.isArray(value.edits) || value.edits.length === 0) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_PAYLOAD', 'RichDocument edit payload requires at least one edit.', undefined, [...path, 'edits']));
    return;
  }
  value.edits.forEach((edit, index) => validateEdit(edit, [...path, 'edits', index], context));
}

function validateEdit(value: unknown, path: Path, context: ValidationContext): void {
  if (!isRecord(value) || !isXnlRichDocumentSemanticEditKind(value.kind)) {
    context.diagnostics.push(diagnostic('UNSUPPORTED_RICH_DOCUMENT_EDIT', 'RichDocument edit kind is missing or unsupported.', undefined, [...path, 'kind']));
    return;
  }
  const edit = value as Record<string, unknown> & { kind: XnlRichDocumentSemanticEdit['kind'] };
  switch (edit.kind) {
    case 'insert':
      pushExactKeys(edit, new Set(['kind', 'localNodeId', 'parent', 'index', 'node']), path, 'Insert edit', context);
      validateLocalId(edit.localNodeId, [...path, 'localNodeId'], context);
      validateRef(edit.parent, [...path, 'parent'], false, context);
      validateIndex(edit.index, [...path, 'index'], context);
      validateSemanticNode(edit.node, [...path, 'node'], context, true);
      if (isRecord(edit.node) && edit.node.localNodeId !== edit.localNodeId) {
        context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Insert edit localNodeId must match its root node.', undefined, [...path, 'node', 'localNodeId']));
      }
      return;
    case 'delete':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'parent', 'index']), path, 'Delete edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateRef(edit.parent, [...path, 'parent'], true, context);
      validateIndex(edit.index, [...path, 'index'], context);
      return;
    case 'move':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'from', 'to']), path, 'Move edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validatePlacement(edit.from, [...path, 'from'], true, context);
      validatePlacement(edit.to, [...path, 'to'], false, context);
      return;
    case 'text':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'before', 'after', 'beforeInlineRuns', 'afterInlineRuns']), path, 'Text edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateString(edit.before, [...path, 'before'], context);
      validateString(edit.after, [...path, 'after'], context);
      validateInlineRuns(edit.beforeInlineRuns, [...path, 'beforeInlineRuns'], context);
      validateInlineRuns(edit.afterInlineRuns, [...path, 'afterInlineRuns'], context);
      if (Array.isArray(edit.beforeInlineRuns) && edit.beforeInlineRuns.map(runText).join('') !== edit.before) {
        context.diagnostics.push(diagnostic('LOSSY_RICH_DOCUMENT_EDIT', 'Text before summary does not match beforeInlineRuns.', undefined, [...path, 'beforeInlineRuns']));
      }
      if (Array.isArray(edit.afterInlineRuns) && edit.afterInlineRuns.map(runText).join('') !== edit.after) {
        context.diagnostics.push(diagnostic('LOSSY_RICH_DOCUMENT_EDIT', 'Text after summary does not match afterInlineRuns.', undefined, [...path, 'afterInlineRuns']));
      }
      return;
    case 'mark':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, 'Mark edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateInlineRuns(edit.before, [...path, 'before'], context);
      validateInlineRuns(edit.after, [...path, 'after'], context);
      return;
    case 'table':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, 'Table edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateSemanticNode(edit.before, [...path, 'before'], context, false, 'table');
      validateSemanticNode(edit.after, [...path, 'after'], context, false, 'table');
      if (isRecord(edit.before) && edit.before.nodeId !== edit.nodeId) {
        context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Table before identity must match edit nodeId.', undefined, [...path, 'before', 'nodeId']));
      }
      if (isRecord(edit.after) && edit.after.nodeId !== edit.nodeId) {
        context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Table after identity must match edit nodeId.', undefined, [...path, 'after', 'nodeId']));
      }
      return;
    case 'code':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, 'Code edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateCodeValue(edit.before, [...path, 'before'], context);
      validateCodeValue(edit.after, [...path, 'after'], context);
      return;
    case 'mermaid-source':
      pushExactKeys(edit, new Set(['kind', 'nodeId', 'before', 'after']), path, 'Mermaid edit', context);
      validateStableId(edit.nodeId, [...path, 'nodeId'], context);
      validateString(edit.before, [...path, 'before'], context);
      validateString(edit.after, [...path, 'after'], context);
  }
}

function validateSemanticNode(
  value: unknown,
  path: Path,
  context: ValidationContext,
  requireLocal: boolean,
  expectedKind?: string,
): void {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Semantic node must be a canonical RichDocument node record.', undefined, path));
    return;
  }
  if (expectedKind !== undefined && value.kind !== expectedKind) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', `Semantic node must have kind "${expectedKind}".`, undefined, [...path, 'kind']));
  }
  if (value.kind === 'text') {
    pushExactKeys(value, new Set(['kind', 'text', 'marks']), path, 'Text node', context);
    validateString(value.text, [...path, 'text'], context);
    if (value.marks !== undefined) validateMarks(value.marks, [...path, 'marks'], context);
    return;
  }

  const identityKeys = ['nodeId', 'localNodeId', 'sourceNodeId'];
  const payloadKeys = semanticPayloadKeys(value.kind);
  if (payloadKeys === undefined) {
    context.diagnostics.push(diagnostic('UNSUPPORTED_RICH_DOCUMENT_NODE', `Unsupported semantic node kind "${value.kind}".`, undefined, [...path, 'kind']));
    return;
  }
  pushExactKeys(value, new Set(['kind', ...identityKeys, ...payloadKeys]), path, 'Semantic node', context);
  validateSemanticIdentity(value, path, context, requireLocal);

  switch (value.kind) {
    case 'document':
    case 'blockquote':
    case 'bullet-list':
    case 'ordered-list':
    case 'list-item':
    case 'table':
    case 'table-row':
    case 'table-cell':
    case 'table-header':
      validateSemanticChildren(value.children, [...path, 'children'], context, requireLocal, allowedChildKinds(value.kind));
      break;
    case 'paragraph':
    case 'heading':
      validateInlineContent(value.content, [...path, 'content'], context);
      break;
  }
  if (value.kind === 'heading' && (!Number.isInteger(value.level) || Number(value.level) < 1 || Number(value.level) > 6)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Heading level must be an integer from 1 through 6.', undefined, [...path, 'level']));
  }
  if (value.kind === 'ordered-list' && value.start !== undefined) validatePositiveInteger(value.start, [...path, 'start'], context);
  if ((value.kind === 'table-cell' || value.kind === 'table-header')) {
    if (value.colspan !== undefined) validatePositiveInteger(value.colspan, [...path, 'colspan'], context);
    if (value.rowspan !== undefined) validatePositiveInteger(value.rowspan, [...path, 'rowspan'], context);
  }
  if (value.kind === 'image') {
    validateString(value.src, [...path, 'src'], context);
    validateOptionalString(value.alt, [...path, 'alt'], context);
    validateOptionalString(value.title, [...path, 'title'], context);
  }
  if (value.kind === 'code-block') {
    validateString(value.text, [...path, 'text'], context);
    validateOptionalString(value.language, [...path, 'language'], context);
  }
  if (value.kind === 'mermaid') validateString(value.source, [...path, 'source'], context);
  if (value.kind === 'component-embed' || value.kind === 'capsule-embed') {
    validateNonEmptyString(value.ref, [...path, 'ref'], context);
    validateOptionalString(value.version, [...path, 'version'], context);
    if (value.input !== undefined && !isRecord(value.input)) {
      context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Embed input must be a serializable record.', undefined, [...path, 'input']));
    }
  }
}

function semanticPayloadKeys(kind: string): readonly string[] | undefined {
  switch (kind) {
    case 'document': case 'blockquote': case 'bullet-list': case 'list-item': case 'table': case 'table-row':
      return ['children'];
    case 'ordered-list': return ['start', 'children'];
    case 'paragraph': return ['content'];
    case 'heading': return ['level', 'content'];
    case 'image': return ['src', 'alt', 'title'];
    case 'table-cell': case 'table-header': return ['colspan', 'rowspan', 'children'];
    case 'code-block': return ['language', 'text'];
    case 'mermaid': return ['source'];
    case 'component-embed': case 'capsule-embed': return ['ref', 'version', 'input'];
    default: return undefined;
  }
}

function validateSemanticIdentity(value: Record<string, unknown>, path: Path, context: ValidationContext, requireLocal: boolean): void {
  const stable = value.nodeId !== undefined;
  const local = value.localNodeId !== undefined;
  if (stable === local || (requireLocal && !local)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_IDENTITY', 'Persistent semantic nodes require exactly one stable or local identity.', undefined, path));
  }
  if (stable) validateStableId(value.nodeId, [...path, 'nodeId'], context);
  if (local) validateLocalId(value.localNodeId, [...path, 'localNodeId'], context);
  if (value.sourceNodeId !== undefined) {
    if (!local || stable) {
      context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_IDENTITY', 'Copy provenance is allowed only on local semantic nodes.', undefined, [...path, 'sourceNodeId']));
    }
    validateStableId(value.sourceNodeId, [...path, 'sourceNodeId'], context);
  }
}

function validateSemanticChildren(
  value: unknown,
  path: Path,
  context: ValidationContext,
  requireLocal: boolean,
  allowedKinds: ReadonlySet<string>,
): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Semantic node children must be an array.', undefined, path));
    return;
  }
  value.forEach((child, index) => {
    validateSemanticNode(child, [...path, index], context, requireLocal);
    if (isRecord(child) && typeof child.kind === 'string' && !allowedKinds.has(child.kind)) {
      context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', `Node kind "${child.kind}" is not allowed in this container.`, undefined, [...path, index, 'kind']));
    }
  });
}

function allowedChildKinds(parentKind: string): ReadonlySet<string> {
  switch (parentKind) {
    case 'bullet-list': case 'ordered-list': return new Set(['list-item']);
    case 'table': return new Set(['table-row']);
    case 'table-row': return new Set(['table-cell', 'table-header']);
    default: return new Set(['paragraph', 'heading', 'blockquote', 'bullet-list', 'ordered-list', 'image', 'table', 'code-block', 'mermaid', 'component-embed', 'capsule-embed']);
  }
}

function validateInlineContent(value: unknown, path: Path, context: ValidationContext): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Inline content must be an array.', undefined, path));
    return;
  }
  value.forEach((child, index) => validateSemanticNode(child, [...path, index], context, false, 'text'));
}

function validateInlineRuns(value: unknown, path: Path, context: ValidationContext): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic('LOSSY_RICH_DOCUMENT_EDIT', 'Inline runs must be an array.', undefined, path));
    return;
  }
  value.forEach((run, index) => {
    const runPath = [...path, index];
    if (!isRecord(run)) {
      context.diagnostics.push(diagnostic('LOSSY_RICH_DOCUMENT_EDIT', 'Inline run must be a record.', undefined, runPath));
      return;
    }
    pushExactKeys(run, new Set(['text', 'marks']), runPath, 'Inline run', context);
    validateString(run.text, [...runPath, 'text'], context);
    validateMarks(run.marks, [...runPath, 'marks'], context);
  });
}

function validateMarks(value: unknown, path: Path, context: ValidationContext): void {
  if (!Array.isArray(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_MARK', 'Marks must be an array.', undefined, path));
    return;
  }
  value.forEach((mark, index) => {
    const markPath = [...path, index];
    if (!isRecord(mark) || typeof mark.kind !== 'string') {
      context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_MARK', 'Mark must be a canonical mark record.', undefined, markPath));
      return;
    }
    if (mark.kind === 'link') {
      pushExactKeys(mark, new Set(['kind', 'href', 'title']), markPath, 'Link mark', context);
      validateNonEmptyString(mark.href, [...markPath, 'href'], context);
      validateOptionalString(mark.title, [...markPath, 'title'], context);
    } else if (['bold', 'italic', 'strike', 'code'].includes(mark.kind)) {
      pushExactKeys(mark, new Set(['kind']), markPath, 'Mark', context);
    } else {
      context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_MARK', `Unsupported mark kind "${mark.kind}".`, undefined, [...markPath, 'kind']));
    }
  });
}

function validateRef(value: unknown, path: Path, stableOnly: boolean, context: ValidationContext): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_REFERENCE', 'Node reference must be a plain record.', undefined, path));
    return;
  }
  pushExactKeys(value, REF_KEYS, path, 'Node reference', context);
  if (value.kind === 'stable') {
    validateStableId(value.nodeId, [...path, 'nodeId'], context);
    if (value.localNodeId !== undefined) context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_REFERENCE', 'Stable reference cannot contain localNodeId.', undefined, path));
  } else if (!stableOnly && value.kind === 'local') {
    validateLocalId(value.localNodeId, [...path, 'localNodeId'], context);
    if (value.nodeId !== undefined) context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_REFERENCE', 'Local reference cannot contain nodeId.', undefined, path));
  } else {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_REFERENCE', stableOnly ? 'Reference must be stable.' : 'Reference kind must be stable or local.', undefined, [...path, 'kind']));
  }
}

function validatePlacement(value: unknown, path: Path, stableOnly: boolean, context: ValidationContext): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Placement must be a plain record.', undefined, path));
    return;
  }
  pushExactKeys(value, new Set(['parent', 'index']), path, 'Placement', context);
  validateRef(value.parent, [...path, 'parent'], stableOnly, context);
  validateIndex(value.index, [...path, 'index'], context);
}

function validateCodeValue(value: unknown, path: Path, context: ValidationContext): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Code value must be a plain record.', undefined, path));
    return;
  }
  pushExactKeys(value, new Set(['language', 'text']), path, 'Code value', context);
  if (value.language !== null) validateString(value.language, [...path, 'language'], context);
  validateString(value.text, [...path, 'text'], context);
}

function pushExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: Path, label: string, context: ValidationContext): void {
  const result = exactKeys(value, allowed, path, label);
  if (result !== undefined) context.diagnostics.push(result);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: Path, label: string): XnlProjectionDiagnostic | undefined {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  return unknown.length === 0
    ? undefined
    : diagnostic('UNKNOWN_RICH_DOCUMENT_FIELD', `${label} contains unsupported field "${unknown[0]}".`, undefined, [...path, unknown[0] as string]);
}

function validateStableId(value: unknown, path: Path, context: ValidationContext): void {
  if (typeof value !== 'string' || !STABLE_ID.test(value)) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_IDENTITY', 'Stable node identity must be a canonical non-empty string.', undefined, path));
  }
}

function validateLocalId(value: unknown, path: Path, context: ValidationContext): void {
  if (typeof value !== 'string' || value.length === 0 || !value.startsWith('local:')) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_IDENTITY', 'Local node identity must use the local: namespace.', undefined, path));
  }
}

function validateIndex(value: unknown, path: Path, context: ValidationContext): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_EDIT', 'Index must be a non-negative integer.', undefined, path));
  }
}

function validatePositiveInteger(value: unknown, path: Path, context: ValidationContext): void {
  if (!Number.isInteger(value) || Number(value) < 1) {
    context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_SEMANTIC_NODE', 'Span must be a positive integer.', undefined, path));
  }
}

function validateString(value: unknown, path: Path, context: ValidationContext): void {
  if (typeof value !== 'string') context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_VALUE', 'Value must be a string.', undefined, path));
}

function validateNonEmptyString(value: unknown, path: Path, context: ValidationContext): void {
  if (typeof value !== 'string' || value.length === 0) context.diagnostics.push(diagnostic('INVALID_RICH_DOCUMENT_VALUE', 'Value must be a non-empty string.', undefined, path));
}

function validateOptionalString(value: unknown, path: Path, context: ValidationContext): void {
  if (value !== undefined) validateString(value, path, context);
}

function runText(value: unknown): string {
  return isRecord(value) && typeof value.text === 'string' ? value.text : '';
}

function rejected(diagnostics: readonly XnlProjectionDiagnostic[]): XnlProjectionCommandResult {
  return deepFreeze({ status: 'rejected', diagnostics: [...diagnostics] });
}

function unsupported(diagnostics: readonly XnlProjectionDiagnostic[]): XnlProjectionCommandResult {
  return deepFreeze({ status: 'unsupported', diagnostics: [...diagnostics] });
}

function diagnostic(code: string, message: string, planNode?: XnlProjectionPlanNode | Record<string, unknown>, path?: Path): XnlProjectionDiagnostic {
  const id = planNode !== undefined && typeof planNode.id === 'string' ? planNode.id : undefined;
  const domain = planNode !== undefined && isRecord(planNode.domain) ? planNode.domain : undefined;
  const domainPath = domain !== undefined && Array.isArray(domain.path) ? domain.path : undefined;
  return {
    severity: 'error',
    code,
    message,
    ...(path !== undefined ? { path: path as XnlProjectionDiagnostic['path'] } : domainPath !== undefined ? { path: domainPath as XnlProjectionDiagnostic['path'] } : {}),
    ...(id !== undefined ? { planNodeId: id } : {}),
  };
}

function withPlan(value: XnlProjectionDiagnostic, planNode: XnlProjectionPlanNode): XnlProjectionDiagnostic {
  return { ...value, planNodeId: planNode.id };
}

function pathFromValidationIssue(value: string): Path {
  return [value];
}

function equalSerializable(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type SnapshotResult =
  | { status: 'snapshotted'; value: XnlProjectionSerializableValue }
  | { status: 'rejected'; diagnostics: readonly XnlProjectionDiagnostic[] };

function snapshotSerializable(value: unknown, path: Path, seen: WeakSet<object>): SnapshotResult {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { status: 'snapshotted', value };
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return { status: 'snapshotted', value };
  if (typeof value !== 'object') return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction data must be serializable.', undefined, path)] };
  if (seen.has(value)) return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction data must not contain cycles.', undefined, path)] };

  const array = Array.isArray(value);
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction prototype could not be inspected safely.', undefined, path)] };
  }
  if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) {
    return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction data cannot contain runtime instances.', undefined, path)] };
  }
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction descriptors could not be inspected safely.', undefined, path)] };
  }
  seen.add(value);
  const output: XnlProjectionSerializableValue[] | Record<string, XnlProjectionSerializableValue> = array ? [] : {};
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== 'length');
  const invalidArrayKeys = array && (keys.length !== value.length
    || keys.some((key, index) => key !== String(index)));
  if (keys.some((key) => typeof key !== 'string') || invalidArrayKeys) {
    seen.delete(value);
    return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction data must use enumerable string data fields and dense arrays.', undefined, path)] };
  }
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      seen.delete(value);
      return { status: 'rejected', diagnostics: [diagnostic('LOSSY_RICH_DOCUMENT_INTERACTION', 'Interaction data cannot contain accessors or hidden fields.', undefined, [...path, key])] };
    }
    const child = snapshotSerializable(descriptor.value, [...path, array ? Number(key) : key], seen);
    if (child.status === 'rejected') {
      seen.delete(value);
      return child;
    }
    if (array) (output as XnlProjectionSerializableValue[]).push(child.value);
    else (output as Record<string, XnlProjectionSerializableValue>)[key] = child.value;
  }
  seen.delete(value);
  return { status: 'snapshotted', value: output };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ('value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
