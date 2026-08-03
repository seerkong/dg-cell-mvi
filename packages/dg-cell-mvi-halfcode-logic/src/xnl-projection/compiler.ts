import {
  XNL_PROJECTION_RESOLUTION_PRECEDENCE,
  validateXnlProjectionCommandResult,
  validateXnlProjectionDialect,
  validateXnlProjectionInteraction,
  validateXnlProjectionPlan,
  XNL_PROJECTION_OWNERSHIP_FIELD_NAMES,
  type XnlProjectionClassification,
  type XnlProjectionCommandResult,
  type XnlProjectionCompileChild,
  type XnlProjectionCompileContext,
  type XnlProjectionCompileRuntime,
  type XnlProjectionDiagnostic,
  type XnlProjectionDialect,
  type XnlProjectionDomainPath,
  type XnlProjectionDomainPathSegment,
  type XnlProjectionDomainRef,
  type XnlProjectionInteraction,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionPresentation,
  type XnlProjectionPresentationRule,
  type XnlProjectionPresenterRef,
  type XnlProjectionProcessorInput,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import { createXnlProjectionPlanNodeId } from './identity';

export interface XnlProjectionCompilerInput<TNode = unknown> {
  node: TNode;
  presentation?: XnlProjectionPresentation;
  nodeId?: string;
  tag?: string;
  role?: string;
  sourceKind?: string;
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
}

export type XnlProjectionCompilerConfig = XnlProjectionSerializableRecord & {
  dialect?: never;
  dialects?: never;
  classifier?: never;
  transformers?: never;
  presenterRegistry?: never;
  runtime?: never;
  function?: never;
};

export type XnlProjectionDialectProcessorConfig = XnlProjectionSerializableRecord;

export interface XnlProjectionCompilerRuntime<TNode = unknown>
  extends XnlProjectionCompileRuntime<TNode, XnlProjectionPlanNode> {
  dialect: XnlProjectionDialect<TNode, XnlProjectionCompilerRuntime<TNode>, XnlProjectionDialectProcessorConfig>;
  presentation?: XnlProjectionPresentation;
  compile(input: XnlProjectionCompileChild<TNode>, config: XnlProjectionCompilerConfig): XnlProjectionPlanNode;
}

export type XnlProjectionCompilerDialect<TNode = unknown> = XnlProjectionDialect<
  TNode,
  XnlProjectionCompilerRuntime<TNode>,
  XnlProjectionDialectProcessorConfig
>;

export interface CreateXnlProjectionCompilerRuntimeOptions<TNode = unknown> {
  dialects?: readonly XnlProjectionCompilerDialect<TNode>[];
  presentation?: XnlProjectionPresentation;
}

export interface XnlProjectionTranslateInput<TNode = unknown> {
  planNode: XnlProjectionPlanNode;
  interaction: XnlProjectionInteraction;
  sourceNode?: TNode;
}

const FORBIDDEN_XNL_PROJECTION_COMPILER_CONFIG_KEYS = [
  'dialect',
  'dialects',
  'classifier',
  'transformers',
  'presenterRegistry',
  'runtime',
  'function',
] as const;

const EMPTY_XNL_PROJECTION_DIALECT_PROCESSOR_CONFIG = Object.freeze({}) as XnlProjectionDialectProcessorConfig;

const RUNTIME_FRAMES = new WeakMap<object, CompileFrame[]>();

export function compileXnlProjection<TNode>(
  runtime: XnlProjectionCompilerRuntime<TNode>,
  input: XnlProjectionCompilerInput<TNode>,
  invocationConfig: XnlProjectionCompilerConfig = {},
): XnlProjectionPlan {
  assertXnlProjectionCompilerConfig(invocationConfig);

  const frames = RUNTIME_FRAMES.get(runtime) ?? [];
  const root = compileProjectionNode(runtime, {
    node: input.node,
    path: [],
    ancestors: [],
    nodeId: input.nodeId,
    tag: input.tag,
    role: input.role,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    metadata: input.metadata,
    presentation: input.presentation ?? runtime.presentation,
  }, invocationConfig, frames);
  const diagnostics = collectPlanDiagnostics(root);
  const plan: XnlProjectionPlan = {
    kind: 'xnl-projection-plan',
    id: readPlanId(invocationConfig) ?? `${root.id}.projection`,
    root,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    provenance: {
      dialectId: runtime.dialect.id,
      resolutionOrder: [...XNL_PROJECTION_RESOLUTION_PRECEDENCE],
    },
  };

  const validation = validateXnlProjectionPlan(plan);
  if (!validation.ok) {
    throw new Error(`XNL Projection plan validation failed: ${formatIssues(validation.issues)}`);
  }
  return plan;
}

export function createXnlProjectionCompilerRuntime<TNode = unknown>(
  options: CreateXnlProjectionCompilerRuntimeOptions<TNode> = {},
): XnlProjectionCompilerRuntime<TNode> {
  const dialect = options.dialects === undefined || options.dialects.length === 0
    ? createUnsupportedDialect<TNode>()
    : composeXnlProjectionDialects(options.dialects);
  assertValidDialect(dialect, 'runtime dialect');
  const frames: CompileFrame[] = [];

  const runtime: XnlProjectionCompilerRuntime<TNode> = {
    dialect,
    ...(options.presentation !== undefined ? { presentation: options.presentation } : {}),
    compile(input, config) {
      assertXnlProjectionCompilerConfig(config);
      const parent = frames[frames.length - 1];
      const relativePath = input.path ?? [input.pathSegment];
      return compileProjectionNode(runtime, {
        node: input.node,
        path: parent === undefined ? relativePath : [...parent.domain.path, ...relativePath],
        ancestors: parent === undefined ? [] : [...parent.ancestors, parent.domain],
        nodeId: input.nodeId,
        tag: input.tag,
        role: input.role,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef ?? parent?.domain.sourceRef,
        metadata: input.metadata,
        presentation: parent?.presentation ?? runtime.presentation,
      }, config, frames);
    },
  };
  RUNTIME_FRAMES.set(runtime, frames);

  return runtime;
}

export function composeXnlProjectionDialects<TNode>(
  dialects: readonly XnlProjectionCompilerDialect<TNode>[],
): XnlProjectionCompilerDialect<TNode> {
  if (dialects.length === 0) {
    throw new Error('XNL Projection dialect composition requires at least one ordered layer.');
  }
  dialects.forEach((dialect, index) => assertValidDialect(dialect, `layer ${index}`));

  const last = dialects[dialects.length - 1];
  const transformers = Object.assign({}, ...dialects.map((dialect) => dialect.transformers));
  const presenterBindings = Object.freeze(
    dialects
      .flatMap((dialect) => dialect.presenterBindings ?? [])
      .map((binding) => Object.freeze({
        ...binding,
        presenter: freezePresenterRef(binding.presenter),
      })),
  );
  const config = mergeSerializableRecords(dialects.map((dialect) => dialect.config));
  const metadata = mergeSerializableRecords(dialects.map((dialect) => dialect.metadata));
  const translateInteraction = lastDefined(dialects.map((dialect) => dialect.translateInteraction));

  const composed: XnlProjectionCompilerDialect<TNode> = {
    id: `xnl-projection.composed:${dialects.map((dialect) => dialect.id).join(':')}`,
    children: last.children,
    classify: last.classify,
    transformers,
    ...(presenterBindings.length > 0 ? { presenterBindings } : {}),
    ...(translateInteraction !== undefined ? { translateInteraction } : {}),
    ...(config !== undefined ? { config } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  assertValidDialect(composed, 'composed result');
  return composed;
}

export function translateXnlProjectionInteraction<TNode>(
  runtime: XnlProjectionCompilerRuntime<TNode>,
  input: XnlProjectionTranslateInput<TNode>,
  invocationConfig: XnlProjectionCompilerConfig = {},
): XnlProjectionCommandResult {
  assertXnlProjectionCompilerConfig(invocationConfig);

  const interactionValidation = validateXnlProjectionInteraction(input.interaction);
  if (!interactionValidation.ok) {
    return rejectedInteraction(
      input.planNode,
      input.interaction?.type ?? 'unknown',
      `Interaction validation failed: ${formatIssues(interactionValidation.issues)}`,
      'INVALID_INTERACTION',
    );
  }

  if (input.interaction.target.planNodeId !== input.planNode.id) {
    return rejectedInteraction(
      input.planNode,
      input.interaction.type,
      `Interaction target planNodeId "${input.interaction.target.planNodeId}" does not match plan node "${input.planNode.id}".`,
    );
  }

  const translator = runtime.dialect.translateInteraction;
  if (translator === undefined) {
    return unsupportedInteraction(input.planNode, input.interaction.type, 'No interaction translator is bound for this projection runtime.');
  }

  const translated = translator(runtime, input, processorConfigFor(runtime));
  if (isPromiseLike(translated)) {
    throw new Error('XNL Projection interaction translator returned a Promise; synchronous translation is required.');
  }

  const validation = validateXnlProjectionCommandResult(translated);
  if (!validation.ok) {
    return unsupportedInteraction(
      input.planNode,
      input.interaction.type,
      `Interaction translator produced an invalid command result: ${formatIssues(validation.issues)}`,
    );
  }
  return translated;
}

interface CompileNodeInput<TNode> {
  node: TNode;
  path: XnlProjectionDomainPath;
  ancestors: readonly XnlProjectionDomainRef[];
  nodeId?: string;
  tag?: string;
  role?: string;
  sourceKind?: string;
  sourceRef?: string;
  metadata?: XnlProjectionSerializableRecord;
  presentation?: XnlProjectionPresentation;
}

interface CompileFrame {
  domain: XnlProjectionDomainRef;
  ancestors: readonly XnlProjectionDomainRef[];
  presentation?: XnlProjectionPresentation;
}

function compileProjectionNode<TNode>(
  runtime: XnlProjectionCompilerRuntime<TNode>,
  input: CompileNodeInput<TNode>,
  invocationConfig: XnlProjectionCompilerConfig,
  frames: CompileFrame[],
): XnlProjectionPlanNode {
  const domain = domainRefFor(input);
  const context: XnlProjectionCompileContext = {
    domain,
    ancestors: input.ancestors,
    ...(input.presentation !== undefined ? { presentationId: input.presentation.id } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
  const processorConfig = processorConfigFor(runtime);
  const classification = classifyNode(runtime, input.node, context, processorConfig);
  frames.push({ domain, ancestors: input.ancestors, presentation: input.presentation });
  let children: readonly XnlProjectionPlanNode[];
  try {
    children = compileChildren(runtime, input.node, context, invocationConfig, processorConfig);
  } finally {
    frames.pop();
  }
  const resolution = resolvePresenter({
    bindings: runtime.dialect.presenterBindings ?? [],
    presentation: input.presentation,
    domain,
    classification: classification.value,
  });
  const processorInput: XnlProjectionProcessorInput<TNode> = {
    node: input.node,
    context,
    children,
    classification: classification.value,
    presentation: resolution.presenter,
    ...(resolution.presentationData !== undefined ? { presentationData: resolution.presentationData } : {}),
    ...(resolution.presentationRuleIds.length > 0 ? { presentationRuleIds: resolution.presentationRuleIds } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
  const diagnostics = [
    ...classification.diagnostics,
    ...resolution.diagnostics,
  ];
  const transformer = runtime.dialect.transformers[classification.value.id];
  if (transformer === undefined) {
    return unsupportedNode(domain, classification.value, children, 'UNSUPPORTED_PROJECTION_NODE', 'No transformer is bound for this domain node.', diagnostics);
  }

  const transformed = transformer(runtime, processorInput, processorConfig);
  if (isPromiseLike(transformed)) {
    throw new Error(`XNL Projection transformer "${classification.value.id}" returned a Promise; synchronous compilation is required.`);
  }

  const planNode = withCompilerDiagnosticsAndProvenance(
    transformed,
    diagnostics,
    runtime.dialect.id,
    classification.value.id,
  );
  const validation = validateXnlProjectionPlan({
    kind: 'xnl-projection-plan',
    id: 'xnl-projection.node-validation',
    root: planNode,
  });
  if (!validation.ok) {
    return unsupportedNode(
      domain,
      classification.value,
      children,
      'INVALID_TRANSFORMER_OUTPUT',
      `Transformer "${classification.value.id}" produced an invalid plan node: ${formatIssues(validation.issues)}`,
      diagnostics,
    );
  }
  return planNode;
}

function compileChildren<TNode>(
  runtime: XnlProjectionCompilerRuntime<TNode>,
  node: TNode,
  context: XnlProjectionCompileContext,
  invocationConfig: XnlProjectionCompilerConfig,
  processorConfig: XnlProjectionDialectProcessorConfig,
): readonly XnlProjectionPlanNode[] {
  const childRefs = runtime.dialect.children(runtime, { node, context }, processorConfig);
  if (isPromiseLike(childRefs)) {
    throw new Error('XNL Projection children processor returned a Promise; synchronous compilation is required.');
  }
  return childRefs.map((child) => runtime.compile(child, invocationConfig));
}

function classifyNode<TNode>(
  runtime: XnlProjectionCompilerRuntime<TNode>,
  node: TNode,
  context: XnlProjectionCompileContext,
  processorConfig: XnlProjectionDialectProcessorConfig,
): { value: XnlProjectionClassification; diagnostics: readonly XnlProjectionDiagnostic[] } {
  const classified = runtime.dialect.classify(runtime, { node, context }, processorConfig);
  if (isPromiseLike(classified)) {
    throw new Error('XNL Projection classifier returned a Promise; synchronous compilation is required.');
  }
  if (!isValidClassification(classified)) {
    return {
      value: { id: 'unsupported' },
      diagnostics: [{
        severity: 'error',
        code: 'INVALID_CLASSIFICATION_OUTPUT',
        message: 'Classifier produced an invalid classification.',
        path: context.domain.path,
      }],
    };
  }
  return { value: classified, diagnostics: classified.diagnostics ?? [] };
}

function processorConfigFor<TNode>(runtime: XnlProjectionCompilerRuntime<TNode>): XnlProjectionDialectProcessorConfig {
  return runtime.dialect.config ?? EMPTY_XNL_PROJECTION_DIALECT_PROCESSOR_CONFIG;
}

interface ResolvePresenterInput {
  bindings: readonly {
    classification?: string;
    trait?: string;
    role?: string;
    sourceKind?: string;
    presenter: XnlProjectionPresenterRef;
    diagnostics?: readonly XnlProjectionDiagnostic[];
  }[];
  presentation?: XnlProjectionPresentation;
  domain: XnlProjectionDomainRef;
  classification: XnlProjectionClassification;
}

function resolvePresenter(input: ResolvePresenterInput): {
  presenter: XnlProjectionPresenterRef;
  presentationData?: XnlProjectionSerializableRecord;
  presentationRuleIds: readonly string[];
  diagnostics: readonly XnlProjectionDiagnostic[];
} {
  const diagnostics: XnlProjectionDiagnostic[] = [];
  const matchingRules = input.presentation?.rules.filter((rule) => matchesRule(rule, input.domain, input.classification)) ?? [];
  const presentationRuleIds = matchingRules.map((rule) => rule.id);
  const presentationData = mergeSerializableRecords(matchingRules.map((rule) => rule.data));
  for (const rule of matchingRules) {
    if (rule.visible === false) {
      diagnostics.push({
        severity: 'warning',
        code: 'LOSSY_PRESENTATION_HIDDEN',
        message: `Presentation rule "${rule.id}" hides this domain node from the projected surface.`,
        path: input.domain.path,
        details: { ruleId: rule.id },
      });
    }
  }
  const explicit = lastDefined(matchingRules.map((rule) => rule.presenter));
  if (explicit !== undefined) {
    return {
      presenter: clonePresenterRef(explicit),
      diagnostics,
      presentationData,
      presentationRuleIds,
    };
  }

  const semantic = matchingBinding(input, 'semantic');
  if (semantic !== undefined) {
    return {
      presenter: clonePresenterRef(semantic),
      diagnostics,
      presentationData,
      presentationRuleIds,
    };
  }

  const classification = matchingBinding(input, 'classification');
  if (classification !== undefined) {
    return {
      presenter: clonePresenterRef(classification),
      diagnostics,
      presentationData,
      presentationRuleIds,
    };
  }

  const sourceKind = matchingBinding(input, 'source-kind');
  if (sourceKind !== undefined) {
    return {
      presenter: clonePresenterRef(sourceKind),
      diagnostics,
      presentationData,
      presentationRuleIds,
    };
  }

  return { presenter: { id: 'unsupported' }, diagnostics, presentationData, presentationRuleIds };
}

function matchingBinding(input: ResolvePresenterInput, stage: 'semantic' | 'classification' | 'source-kind'): XnlProjectionPresenterRef | undefined {
  const matches = input.bindings.filter((binding) => matchesBinding(binding, input, stage));
  return matches[matches.length - 1]?.presenter;
}

function matchesBinding(
  binding: ResolvePresenterInput['bindings'][number],
  input: ResolvePresenterInput,
  stage: 'semantic' | 'classification' | 'source-kind',
): boolean {
  if (stage === 'semantic') {
    if (binding.trait === undefined) return false;
    if (!(input.classification.traits ?? []).includes(binding.trait)) return false;
  }
  if (stage === 'classification') {
    if (binding.trait !== undefined || binding.sourceKind !== undefined) return false;
    if (binding.classification === undefined) return false;
  }
  if (stage === 'source-kind') {
    if (binding.sourceKind === undefined) return false;
  }
  if (binding.classification !== undefined && binding.classification !== input.classification.id) return false;
  if (binding.role !== undefined && binding.role !== input.domain.role) return false;
  if (binding.sourceKind !== undefined && binding.sourceKind !== input.domain.sourceKind) return false;
  return true;
}

function matchesRule(
  rule: XnlProjectionPresentationRule,
  domain: XnlProjectionDomainRef,
  classification: XnlProjectionClassification,
): boolean {
  const match = rule.match;
  if (match.path !== undefined && !samePath(match.path, domain.path)) return false;
  if (match.nodeId !== undefined && match.nodeId !== domain.nodeId) return false;
  if (match.tag !== undefined && match.tag !== domain.tag) return false;
  if (match.classification !== undefined && match.classification !== classification.id) return false;
  if (match.role !== undefined && match.role !== domain.role) return false;
  if (match.sourceKind !== undefined && match.sourceKind !== domain.sourceKind) return false;
  return true;
}

function unsupportedNode(
  domain: XnlProjectionDomainRef,
  classification: XnlProjectionClassification,
  children: readonly XnlProjectionPlanNode[],
  code: string,
  message: string,
  diagnostics: readonly XnlProjectionDiagnostic[] = [],
): XnlProjectionPlanNode {
  return {
    kind: 'xnl-projection-plan-node',
    id: createXnlProjectionPlanNodeId(domain),
    domain,
    classification,
    presenter: { id: 'unsupported' },
    children,
    diagnostics: [
      ...diagnostics,
      {
        severity: 'error',
        code,
        message,
        path: domain.path,
      },
    ],
    provenance: { transformer: 'unsupported' },
  };
}

function unsupportedInteraction(
  planNode: XnlProjectionPlanNode,
  interactionType: string,
  message: string,
): XnlProjectionCommandResult {
  return {
    status: 'unsupported',
    diagnostics: [{
      severity: 'error',
      code: 'UNSUPPORTED_INTERACTION',
      message,
      planNodeId: planNode.id,
      path: planNode.domain.path,
      details: { interactionType },
    }],
  };
}

function rejectedInteraction(
  planNode: XnlProjectionPlanNode,
  interactionType: string,
  message: string,
  code = 'INVALID_INTERACTION_TARGET',
): XnlProjectionCommandResult {
  return {
    status: 'rejected',
    diagnostics: [{
      severity: 'error',
      code,
      message,
      planNodeId: planNode.id,
      path: planNode.domain.path,
      details: { interactionType },
    }],
  };
}

function withCompilerDiagnosticsAndProvenance(
  node: XnlProjectionPlanNode,
  diagnostics: readonly XnlProjectionDiagnostic[],
  dialectId: string,
  transformer: string,
): XnlProjectionPlanNode {
  const mergedDiagnostics = mergeDiagnostics(node.diagnostics, diagnostics);
  return {
    ...node,
    ...(mergedDiagnostics !== undefined ? { diagnostics: mergedDiagnostics } : {}),
    provenance: {
      ...(node.provenance ?? {}),
      dialectId,
      transformer,
    },
  };
}

function mergeDiagnostics(
  existing: readonly XnlProjectionDiagnostic[] | undefined,
  extra: readonly XnlProjectionDiagnostic[],
): readonly XnlProjectionDiagnostic[] | undefined {
  const merged = [...(existing ?? []), ...extra];
  return merged.length > 0 ? merged : undefined;
}

function domainRefFor<TNode>(input: CompileNodeInput<TNode>): XnlProjectionDomainRef {
  return {
    path: input.path,
    ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
    ...(input.tag !== undefined ? { tag: input.tag } : {}),
    ...(input.sourceKind !== undefined ? { sourceKind: input.sourceKind } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

function createUnsupportedDialect<TNode>(): XnlProjectionCompilerDialect<TNode> {
  return {
    id: 'xnl-projection.unsupported',
    children: (_runtime, _input, _config) => [],
    classify: (_runtime, _input, _config) => ({ id: 'unsupported' }),
    transformers: {},
  };
}

function assertValidDialect<TNode>(dialect: XnlProjectionCompilerDialect<TNode>, label: string): void {
  const result = validateXnlProjectionDialect(dialect);
  if (!result.ok) {
    throw new Error(`XNL Projection dialect ${label} validation failed: ${formatIssues(result.issues)}`);
  }
}

function assertXnlProjectionCompilerConfig(value: unknown): asserts value is XnlProjectionCompilerConfig {
  if (!isPlainRecord(value)) {
    throw new Error('XNL Projection compile config must be a plain serializable object.');
  }
  const forbidden = FORBIDDEN_XNL_PROJECTION_COMPILER_CONFIG_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (forbidden.length > 0) {
    throw new Error(`XNL Projection compile config contains forbidden keys: ${forbidden.join(', ')}`);
  }
  const issues: string[] = [];
  collectSerializableIssues(value, '$', issues, new Set());
  if (issues.length > 0) {
    throw new Error(`XNL Projection compile config must be a plain serializable object: ${issues.join('; ')}`);
  }
}

function collectPlanDiagnostics(node: XnlProjectionPlanNode): readonly XnlProjectionDiagnostic[] {
  return [
    ...(node.diagnostics ?? []),
    ...node.children.flatMap((child) => collectPlanDiagnostics(child)),
  ];
}

function isValidClassification(value: unknown): value is XnlProjectionClassification {
  if (!isPlainRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && (value.traits === undefined || (Array.isArray(value.traits) && value.traits.every((trait) => typeof trait === 'string')))
    && (value.facts === undefined || isPlainRecord(value.facts))
    && (value.diagnostics === undefined || Array.isArray(value.diagnostics));
}

function readPlanId(config: XnlProjectionCompilerConfig): string | undefined {
  const planId = config.planId;
  return typeof planId === 'string' && planId.length > 0 ? planId : undefined;
}

function mergeSerializableRecords(
  records: readonly (XnlProjectionSerializableRecord | undefined)[],
): XnlProjectionSerializableRecord | undefined {
  let merged: XnlProjectionSerializableRecord | undefined;
  for (const record of records) {
    if (record === undefined) continue;
    merged = mergeRecord(merged ?? {}, record);
  }
  return merged;
}

function mergeRecord(
  base: XnlProjectionSerializableRecord,
  override: XnlProjectionSerializableRecord,
): XnlProjectionSerializableRecord {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const previous = merged[key];
    merged[key] = isPlainRecord(previous) && isPlainRecord(value)
      ? mergeRecord(previous as XnlProjectionSerializableRecord, value as XnlProjectionSerializableRecord)
      : value;
  }
  return merged as XnlProjectionSerializableRecord;
}

function clonePresenterRef(
  presenter: XnlProjectionPresenterRef,
): XnlProjectionPresenterRef {
  return {
    id: presenter.id,
    ...(presenter.options !== undefined
      ? { options: cloneSerializableRecord(presenter.options) }
      : {}),
  };
}

function freezePresenterRef(
  presenter: XnlProjectionPresenterRef,
): XnlProjectionPresenterRef {
  const cloned = clonePresenterRef(presenter);
  return Object.freeze({
    id: cloned.id,
    ...(cloned.options !== undefined
      ? { options: freezeSerializableRecord(cloned.options) }
      : {}),
  });
}

function cloneSerializableRecord(
  value: XnlProjectionSerializableRecord,
): XnlProjectionSerializableRecord {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      cloneSerializableValue(child),
    ]),
  ) as XnlProjectionSerializableRecord;
}

function cloneSerializableValue(
  value: XnlProjectionSerializableValue | undefined,
): XnlProjectionSerializableValue | undefined {
  if (Array.isArray(value)) {
    return value.map((child) => cloneSerializableValue(child)) as
      readonly XnlProjectionSerializableValue[];
  }
  if (isPlainRecord(value)) {
    return cloneSerializableRecord(value as XnlProjectionSerializableRecord);
  }
  return value;
}

function freezeSerializableRecord(
  value: XnlProjectionSerializableRecord,
): XnlProjectionSerializableRecord {
  for (const child of Object.values(value)) {
    freezeSerializableValue(child);
  }
  return Object.freeze(value);
}

function freezeSerializableValue(
  value: XnlProjectionSerializableValue | undefined,
): void {
  if (Array.isArray(value)) {
    value.forEach((child) => freezeSerializableValue(child));
    Object.freeze(value);
    return;
  }
  if (isPlainRecord(value)) {
    freezeSerializableRecord(value as XnlProjectionSerializableRecord);
  }
}

function samePath(left: readonly XnlProjectionDomainPathSegment[], right: readonly XnlProjectionDomainPathSegment[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function collectSerializableIssues(
  value: unknown,
  path: string,
  issues: string[],
  seen: Set<object>,
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issues.push(`${path} contains a non-finite number`);
    return;
  }
  if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push(`${path} contains a non-serializable ${typeof value}`);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      issues.push(`${path} contains a cycle`);
      return;
    }
    seen.add(value);
    value.forEach((item, index) => collectSerializableIssues(item, `${path}[${index}]`, issues, seen));
    seen.delete(value);
    return;
  }
  if (!isPlainRecord(value)) {
    issues.push(`${path} contains a runtime instance`);
    return;
  }
  if (seen.has(value)) {
    issues.push(`${path} contains a cycle`);
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if ((XNL_PROJECTION_OWNERSHIP_FIELD_NAMES as readonly string[]).includes(key)) {
      issues.push(`${path}.${key} contains a runtime ownership field`);
      continue;
    }
    collectSerializableIssues(child, `${path}.${key}`, issues, seen);
  }
  seen.delete(value);
}

function lastDefined<T>(values: readonly (T | undefined)[]): T | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== undefined) return values[index];
  }
  return undefined;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function formatIssues(issues: Array<{ path: string; code?: string; message: string }>): string {
  return issues.map((issue) => `${issue.path}${issue.code ? ` ${issue.code}` : ''}: ${issue.message}`).join('; ');
}
