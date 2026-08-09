import {
  snapshotSerializableValue,
  validateDocumentEditorPresentation,
  validateDocumentEditorToolbarPlan,
  type DocumentEditorCapabilities,
  type DocumentEditorConditionRef,
  type DocumentEditorContext,
  type DocumentEditorPresentation,
  type DocumentEditorPresenterDefinition,
  type DocumentEditorSerializableRecord,
  type DocumentEditorToolbarDiagnostic,
  type DocumentEditorToolbarGroupPlan,
  type DocumentEditorToolbarPlan,
  type DocumentEditorToolbarToolPlan,
  type DocumentEditorToolDefinition,
} from 'dg-cell-mvi-halfcode-contract';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;

export type DocumentEditorConditionInput = Readonly<{
  context: DocumentEditorContext;
  options?: DocumentEditorSerializableRecord;
}>;

export type DocumentEditorConditionConfig = Readonly<{ id: string }>;

export type DocumentEditorConditionProcessor<TRuntime extends object = object> = (
  runtime: TRuntime,
  input: DocumentEditorConditionInput,
  config: DocumentEditorConditionConfig,
) => boolean;

export type DocumentEditorConditionBinding<TRuntime extends object = object> = Readonly<{
  runtime: TRuntime;
  processor: DocumentEditorConditionProcessor<TRuntime>;
}>;

export type DocumentEditorPresentationCompilerRuntime = Readonly<{
  tools: ReadonlyMap<string, DocumentEditorToolDefinition>;
  presenters: ReadonlyMap<string, DocumentEditorPresenterDefinition>;
  conditions: ReadonlyMap<string, DocumentEditorConditionBinding>;
}>;

export type DocumentEditorPresentationCompilerInput = Readonly<{
  presentation: DocumentEditorPresentation;
  capabilities: DocumentEditorCapabilities;
  editorContext: DocumentEditorContext;
}>;

export type DocumentEditorPresentationCompilerConfig = Readonly<{
  unknownToolPolicy: 'diagnostic' | 'reject';
}>;

export type DocumentEditorPresentationCompilerResult =
  | Readonly<{
      status: 'compiled';
      plan: DocumentEditorToolbarPlan;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [
        DocumentEditorToolbarDiagnostic,
        ...DocumentEditorToolbarDiagnostic[],
      ];
    }>;

export function compileDocumentEditorPresentation(
  runtime: DocumentEditorPresentationCompilerRuntime,
  input: DocumentEditorPresentationCompilerInput,
  config: DocumentEditorPresentationCompilerConfig,
): DocumentEditorPresentationCompilerResult {
  const boundary = validateBoundary(runtime, input, config);
  if (boundary.length > 0) return rejected(boundary);

  const presentation = snapshotPresentation(input.presentation);
  if (presentation === undefined) {
    return rejected([diagnostic(
      'error',
      'INVALID_PRESENTATION_SNAPSHOT',
      'DocumentEditorPresentation could not be snapshotted safely.',
      '$.presentation',
    )]);
  }

  const diagnostics: DocumentEditorToolbarDiagnostic[] = [];
  const toolCapabilities = new Set(input.capabilities.tools);
  const presenterCapabilities = new Set(input.capabilities.presenters);
  const conditionCapabilities = new Set(input.capabilities.conditions);
  const grants = new Set(input.capabilities.grants ?? []);
  const groups: DocumentEditorToolbarGroupPlan[] = [];

  presentation.groups.forEach((group, groupIndex) => {
    const tools: DocumentEditorToolbarToolPlan[] = [];
    group.tools.forEach((tool, toolIndex) => {
      const path = `$.presentation.groups[${groupIndex}].tools[${toolIndex}]`;
      const definition = runtime.tools.get(tool.id);
      if (definition === undefined || !toolCapabilities.has(tool.id)) {
        unknown(diagnostics, config, 'UNKNOWN_TOOL', `Unknown or unavailable tool "${tool.id}".`, `${path}.id`);
        return;
      }

      const presenterRef = tool.presenter ?? { id: definition.defaultPresenterId };
      if (!runtime.presenters.has(presenterRef.id) || !presenterCapabilities.has(presenterRef.id)) {
        unknown(
          diagnostics,
          config,
          'UNKNOWN_PRESENTER',
          `Unknown or unavailable presenter "${presenterRef.id}".`,
          `${path}.presenter.id`,
        );
        return;
      }

      const condition = tool.visibleWhen ?? definition.defaultVisibleWhen;
      const visible = condition === undefined
        ? true
        : evaluateCondition(runtime, input, config, condition, path, conditionCapabilities, diagnostics);
      const enabled = definition.requiredGrant === undefined || grants.has(definition.requiredGrant);
      if (!enabled) {
        diagnostics.push(diagnostic(
          'warning',
          'MISSING_TOOL_GRANT',
          `Tool "${tool.id}" requires grant "${definition.requiredGrant}".`,
          `${path}.id`,
        ));
      }
      tools.push(deepFreeze({
        id: definition.id,
        commandId: definition.commandId,
        label: definition.label,
        ...(definition.icon === undefined ? {} : { icon: definition.icon }),
        presenter: cloneRef(presenterRef),
        ...(tool.options === undefined ? {} : { options: cloneRecord(tool.options) }),
        visible,
        enabled,
      }));
    });
    groups.push(deepFreeze({
      id: group.id,
      ...(group.label === undefined ? {} : { label: group.label }),
      priority: group.priority ?? groupIndex,
      tools,
    }));
  });

  if (diagnostics.some((entry) => entry.severity === 'error')) return rejected(diagnostics);
  const plan = deepFreeze({
    kind: 'document-editor-toolbar-plan' as const,
    id: presentation.id,
    groups,
    diagnostics,
  });
  const planValidation = validateDocumentEditorToolbarPlan(plan);
  if (!planValidation.ok) return rejected(planValidation.issues);
  return deepFreeze({ status: 'compiled' as const, plan });
}

function validateBoundary(
  runtime: DocumentEditorPresentationCompilerRuntime,
  input: DocumentEditorPresentationCompilerInput,
  config: DocumentEditorPresentationCompilerConfig,
): DocumentEditorToolbarDiagnostic[] {
  const diagnostics: DocumentEditorToolbarDiagnostic[] = [];
  if (runtime === null || typeof runtime !== 'object'
    || !(runtime.tools instanceof Map)
    || !(runtime.presenters instanceof Map)
    || !(runtime.conditions instanceof Map)) {
    diagnostics.push(diagnostic('error', 'INVALID_COMPILER_RUNTIME',
      'Compiler runtime must contain concrete tool, presenter and condition Maps.', '$.runtime'));
  }
  const presentation = validateDocumentEditorPresentation(input?.presentation);
  diagnostics.push(...presentation.issues);
  if (!validCapabilities(input?.capabilities) || !validContext(input?.editorContext)) {
    diagnostics.push(diagnostic('error', 'INVALID_COMPILER_INPUT',
      'Compiler capabilities and editorContext must be closed serializable data.', '$.input'));
  }
  if (config?.unknownToolPolicy !== 'diagnostic' && config?.unknownToolPolicy !== 'reject') {
    diagnostics.push(diagnostic('error', 'INVALID_COMPILER_CONFIG',
      'unknownToolPolicy must be diagnostic or reject.', '$.config.unknownToolPolicy'));
  }
  return diagnostics;
}

function evaluateCondition(
  runtime: DocumentEditorPresentationCompilerRuntime,
  input: DocumentEditorPresentationCompilerInput,
  config: DocumentEditorPresentationCompilerConfig,
  condition: DocumentEditorConditionRef,
  path: string,
  available: ReadonlySet<string>,
  diagnostics: DocumentEditorToolbarDiagnostic[],
): boolean {
  const binding = runtime.conditions.get(condition.id);
  if (binding === undefined || !available.has(condition.id)) {
    unknown(diagnostics, config, 'UNKNOWN_CONDITION',
      `Unknown or unavailable condition "${condition.id}".`, `${path}.visibleWhen.id`);
    return false;
  }
  try {
    return binding.processor(
      binding.runtime,
      {
        context: input.editorContext,
        ...(condition.options === undefined ? {} : { options: cloneRecord(condition.options) }),
      },
      { id: condition.id },
    ) === true;
  } catch {
    diagnostics.push(diagnostic('error', 'CONDITION_EVALUATION_FAILED',
      `Condition "${condition.id}" failed.`, `${path}.visibleWhen.id`));
    return false;
  }
}

function unknown(
  diagnostics: DocumentEditorToolbarDiagnostic[],
  config: DocumentEditorPresentationCompilerConfig,
  code: string,
  message: string,
  path: string,
): void {
  diagnostics.push(diagnostic(config.unknownToolPolicy === 'reject' ? 'error' : 'warning', code, message, path));
}

function snapshotPresentation(value: unknown): DocumentEditorPresentation | undefined {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$.presentation', issues);
  return issues.length === 0 ? snapshot as unknown as DocumentEditorPresentation : undefined;
}

type SchemaEditorValidationIssue = { path: string; code?: string; message: string };

function validCapabilities(value: unknown): value is DocumentEditorCapabilities {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !['tools', 'presenters', 'conditions', 'grants'].includes(key))) return false;
  return stringArray(value.tools)
    && stringArray(value.presenters)
    && stringArray(value.conditions)
    && (value.grants === undefined || stringArray(value.grants));
}

function validContext(value: unknown): value is DocumentEditorContext {
  if (!plain(value) || Object.keys(value).some((key) => (
    !['editable', 'selection', 'activeNodeKinds', 'activeMarks'].includes(key)
  ))) return false;
  return typeof value.editable === 'boolean'
    && ['none', 'caret', 'range'].includes(String(value.selection))
    && stringArray(value.activeNodeKinds)
    && stringArray(value.activeMarks);
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim() === entry && entry.length > 0)
    && new Set(value).size === value.length;
}

function cloneRef(value: DocumentEditorConditionRef) {
  return deepFreeze({
    id: value.id,
    ...(value.options === undefined ? {} : { options: cloneRecord(value.options) }),
  });
}

function cloneRecord(value: DocumentEditorSerializableRecord): DocumentEditorSerializableRecord {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(value, '$', issues);
  if (issues.length > 0 || snapshot === undefined || !plain(snapshot)) return EMPTY;
  return deepFreeze(snapshot as DocumentEditorSerializableRecord);
}

function diagnostic(
  severity: 'warning' | 'error',
  code: string,
  message: string,
  path: string,
): DocumentEditorToolbarDiagnostic {
  return Object.freeze({ severity, code, message, path });
}

function rejected(
  diagnostics: readonly DocumentEditorToolbarDiagnostic[],
): DocumentEditorPresentationCompilerResult {
  const frozen = Object.freeze([...diagnostics]);
  return Object.freeze({
    status: 'rejected' as const,
    diagnostics: frozen as readonly [
      DocumentEditorToolbarDiagnostic,
      ...DocumentEditorToolbarDiagnostic[],
    ],
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

