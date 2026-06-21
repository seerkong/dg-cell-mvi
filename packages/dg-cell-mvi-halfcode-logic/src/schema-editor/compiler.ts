import {
  validateEditorPlan,
  validateSchemaEditorDialect,
  type CollectionIdentityHint,
  type EditorCommandBinding,
  type EditorCommonPlanMetadata,
  type EditorPlan,
  type EditorPlanDiagnostic,
  type EditorPlanDisplayMetadata,
  type EditorPlanNode,
  type EditorPresentation,
  type EditorPresentationOverlay,
  type EditorPresenterRef,
  type SchemaEditorContractRecord,
  type SchemaEditorContractValue,
  type SchemaEditorClassification,
  type SchemaEditorCompileRuntime,
  type SchemaEditorDialect,
  type SchemaEditorTransformer,
  type StructureSemanticAnnotations,
  type StructureSchema,
  type ValuePath,
} from 'dg-cell-mvi-halfcode-contract';

export type EditorCompilerFieldContext = SchemaEditorContractRecord & {
  key: string;
  required: boolean;
  label?: string;
  description?: string;
  annotations?: StructureSemanticAnnotations;
};

export interface EditorCompilerInput {
  schema: StructureSchema;
  presentation?: EditorPresentationOverlay;
  path?: ValuePath;
  fieldContext?: EditorCompilerFieldContext;
  identityScope?: string[];
}

const FORBIDDEN_EDITOR_COMPILER_CONFIG_KEYS = [
  'dialect',
  'dialects',
  'classify',
  'classifier',
  'transformers',
  'resolver',
  'registry',
  'precedence',
  'resolutionPrecedence',
  'selectionOrder',
] as const;

type ForbiddenEditorCompilerConfigKey = typeof FORBIDDEN_EDITOR_COMPILER_CONFIG_KEYS[number];

export type EditorCompilerConfig = SchemaEditorContractRecord & {
  [Key in ForbiddenEditorCompilerConfigKey]?: never;
};

export interface EditorCompilerRuntime
  extends SchemaEditorCompileRuntime<EditorCompilerInput, EditorPlanNode> {
  dialect: EditorCompilerDialect;
  compile(input: EditorCompilerInput, config?: EditorCompilerConfig): EditorPlanNode;
}

export type EditorCompilerDialect = SchemaEditorDialect<
  EditorCompilerRuntime,
  EditorCompilerInput,
  EditorCompilerConfig,
  EditorPlanNode
>;

export interface CreateEditorCompilerRuntimeOptions {
  dialects?: EditorCompilerDialect[];
}

type SchemaRecord = Record<string, unknown>;

const literalTarget = (path: ValuePath) => ({ source: 'literal' as const, value: path });
const eventArgument = (path: ValuePath) => ({ source: 'event' as const, path });

export function compileEditorPlan(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig = {},
): EditorPlan {
  assertEditorCompilerConfig(config);

  const root = runtime.compile(normalizeRootPresentation(input), config);
  const diagnostics = collectDiagnostics(root);
  const plan: EditorPlan = {
    kind: 'editor-plan',
    id: readPlanId(config) ?? `${root.id}.editor`,
    root,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    provenance: {
      dialectId: runtime.dialect.id,
      selectionOrder: ['presenter', 'semantic', 'format', 'structural', 'unsupported'],
    },
  };

  const result = validateEditorPlan(plan);
  if (!result.ok) {
    throw new Error(`Schema editor plan validation failed: ${formatIssues(result.issues)}`);
  }
  return plan;
}

export function createSchemaEditorCompilerRuntime(
  options: CreateEditorCompilerRuntimeOptions = {},
): EditorCompilerRuntime {
  const dialects = options.dialects ?? [];
  const dialect = dialects.length > 1
    ? composeSchemaEditorDialects(dialects)
    : dialects[0] ?? createDefaultSchemaEditorDialect();
  const dialectResult = validateSchemaEditorDialect(dialect);
  if (!dialectResult.ok) {
    throw new Error(`Schema editor dialect validation failed: ${formatIssues(dialectResult.issues)}`);
  }

  const runtime: EditorCompilerRuntime = {
    dialect,
    compile(input, config) {
      return compileEditorNode(runtime, input, config ?? {});
    },
  };
  return runtime;
}

export function composeSchemaEditorDialects(
  dialects: readonly EditorCompilerDialect[],
): EditorCompilerDialect {
  if (dialects.length === 0) {
    throw new Error('Schema editor dialect composition requires at least one ordered layer.');
  }
  dialects.forEach((dialect, index) => assertValidDialect(dialect, `layer ${index}`));

  const classifiers = dialects.flatMap((dialect) => dialect.classify ? [dialect.classify] : []);
  const transformers = Object.assign({}, ...dialects.map((dialect) => dialect.transformers ?? {}));
  const config = mergeDialectRecords(dialects, 'config');
  const metadata = mergeDialectRecords(dialects, 'metadata');
  const composed: EditorCompilerDialect = {
    id: `schema-editor.composed:${dialects.map((dialect) => dialect.id).join(':')}`,
    ...(classifiers.length > 0 ? { classify: composeClassifiers(classifiers) } : {}),
    ...(Object.keys(transformers).length > 0 ? { transformers } : {}),
    ...(config !== undefined ? { config } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  assertValidDialect(composed, 'composed result');
  return composed;
}

export function createDefaultSchemaEditorDialect(): EditorCompilerDialect {
  return {
    id: 'schema-editor.default',
    transformers: {
      'structural:scalar': transformScalar,
      'structural:object': transformObject,
      'structural:array': transformArray,
      'structural:map': transformMap,
      'structural:union': transformUnion,
      'structural:ref': transformRef,
      unsupported: transformUnsupported,
    },
  };
}

function compileEditorNode(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  assertEditorCompilerConfig(config);
  const normalizedInput = { ...input, path: input.path };
  const classification = classify(runtime, normalizedInput, config);
  if ('diagnostic' in classification) {
    return unsupportedNode(normalizedInput, runtime.dialect.id, 'unsupported', classification.diagnostic);
  }
  if (classification.value.unsupported === true) {
    return mergeClassificationDiagnostics(
      unsupportedNode(
        normalizedInput,
        runtime.dialect.id,
        'unsupported',
        explicitUnsupportedDiagnostic(normalizedInput),
      ),
      classification.value.diagnostics,
    );
  }

  const candidates = selectionCandidates(normalizedInput, classification.value);
  const selected = candidates.find((candidate) => runtime.dialect.transformers?.[candidate] !== undefined);
  const selector = selected ?? 'unsupported';
  const transformer = selected === undefined
    ? runtime.dialect.transformers?.unsupported ?? transformUnsupported
    : runtime.dialect.transformers?.[selected];

  if (transformer === undefined) {
    return mergeClassificationDiagnostics(
      unsupportedNode(normalizedInput, runtime.dialect.id, selector, unsupportedDiagnostic(normalizedInput)),
      classification.value.diagnostics,
    );
  }

  const transformed = transformer(runtime, normalizedInput, config);
  if (isPromiseLike(transformed)) {
    throw new Error(`Schema editor processor "${selector}" returned a Promise; synchronous compilation is required.`);
  }

  const node = mergeClassificationDiagnostics(
    addCompilerProvenance(
      ensureCompilerMetadata(transformed, normalizedInput),
      normalizedInput,
      runtime.dialect.id,
      selector,
    ),
    classification.value.diagnostics,
  );
  const validation = validateEditorPlan({ kind: 'editor-plan', id: 'node.validation', root: node });
  if (!validation.ok) {
    return mergeClassificationDiagnostics(
      unsupportedNode(normalizedInput, runtime.dialect.id, selector, {
        severity: 'error',
        code: 'UNSUPPORTED_INVALID_TRANSFORMER_OUTPUT',
        message: `Transformer "${selector}" produced an invalid plan node: ${formatIssues(validation.issues)}`,
        path: normalizedInput.path ?? [],
      }),
      classification.value.diagnostics,
    );
  }
  return node;
}

function classify(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): { value: SchemaEditorClassification } | { diagnostic: EditorPlanDiagnostic } {
  const schema = input.schema as unknown as SchemaRecord;
  const fieldContext = input.fieldContext;
  const annotations = {
    ...(isRecord(schema.annotations) ? schema.annotations : {}),
    ...(fieldContext?.annotations ?? {}),
  };
  const baseline: SchemaEditorClassification = {
    ...(typeof annotations.semanticType === 'string' ? { semanticType: annotations.semanticType } : {}),
    ...(typeof annotations.format === 'string' ? { format: annotations.format } : {}),
    ...(typeof schema.kind === 'string' ? { structuralKind: schema.kind } : {}),
  };

  if (runtime.dialect.classify === undefined) return { value: baseline };
  const result = runtime.dialect.classify(runtime, input, config);
  if (isPromiseLike(result)) {
    throw new Error('Schema editor classify processor returned a Promise; synchronous compilation is required.');
  }
  const normalized = normalizeClassification(result);
  if (normalized === undefined) {
    return {
      diagnostic: {
        severity: 'error',
        code: 'UNSUPPORTED_INVALID_CLASSIFICATION',
        message: 'Schema editor classify processor returned invalid classification data.',
        path: input.path ?? [],
      },
    };
  }
  return { value: { ...baseline, ...normalized } };
}

function selectionCandidates(
  input: EditorCompilerInput,
  classification: SchemaEditorClassification,
): string[] {
  const candidates: string[] = [];
  const presenterId = input.presentation?.presenter?.id ?? classification.presenterId;
  if (presenterId) candidates.push(`presenter:${presenterId}`);
  if (classification.semanticType) candidates.push(`semantic:${classification.semanticType}`);
  if (classification.format) candidates.push(`format:${classification.format}`);
  if (classification.structuralKind) candidates.push(`structural:${classification.structuralKind}`);
  candidates.push('unsupported');
  return candidates;
}

function transformScalar(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'scalar' }>;
  const path = input.path ?? [];
  return {
    kind: 'field',
    id: nodeId(input),
    path,
    metadata: scalarMetadata(input, schema),
    presenter: applyPresentation(defaultScalarPresenter(schema), input.presentation),
    value: { source: 'value', path },
    commandBindings: [valueSetBinding(path)],
  };
}

function transformObject(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'object' }>;
  const path = input.path ?? [];
  const identityScope = readIdentityScope(input);
  const orderedFields = orderFields(schema.fields, input.presentation?.order);
  return {
    kind: 'group',
    id: nodeId(input),
    path,
    metadata: groupMetadata(input),
    presenter: applyPresentation({ id: 'object.group' }, input.presentation),
    children: orderedFields.map((field) => compileScoped(runtime, {
      schema: field.schema,
      presentation: childPresentation(input.presentation, field.key),
      path: [...path, field.key],
      fieldContext: {
        key: field.key,
        required: schema.required?.includes(field.key) ?? false,
        ...(field.label !== undefined ? { label: field.label } : {}),
        ...(field.description !== undefined ? { description: field.description } : {}),
        ...(field.annotations !== undefined ? { annotations: field.annotations } : {}),
      },
    }, config, identityScope)),
  };
}

function transformArray(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'array' }>;
  const path = input.path ?? [];
  return {
    kind: 'collection',
    id: nodeId(input),
    path,
    metadata: collectionMetadata(input, schema),
    presenter: applyPresentation({ id: 'collection.list' }, input.presentation),
    itemTemplate: compileScoped(runtime, {
      schema: schema.item,
      presentation: wildcardPresentation(input.presentation?.item, input.presentation),
      path: [...path, '*'],
    }, config, readIdentityScope(input)),
    commandBindings: collectionBindings(path),
  };
}

function transformMap(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'map' }>;
  const path = input.path ?? [];
  return {
    kind: 'map',
    id: nodeId(input),
    path,
    metadata: mapMetadata(input, schema),
    presenter: applyPresentation({ id: 'map.entries' }, input.presentation),
    valueTemplate: compileScoped(runtime, {
      schema: schema.value,
      presentation: wildcardPresentation(input.presentation?.value, input.presentation),
      path: [...path, '*'],
    }, config, readIdentityScope(input)),
    commandBindings: mapBindings(path),
  };
}

function transformUnion(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'union' }>;
  const path = input.path ?? [];
  const identityScope = readIdentityScope(input);
  const alternatives = Object.fromEntries(schema.alternatives.map((alternative) => [
    alternative.id,
    compileScoped(runtime, {
      schema: alternative.schema,
      presentation: alternativePresentation(input.presentation, alternative.id),
      path,
    }, config, [...identityScope, 'alternative', alternative.id]),
  ]));
  return {
    kind: 'union',
    id: nodeId(input),
    path,
    metadata: unionMetadata(input, schema),
    presenter: applyPresentation({ id: 'union.select' }, input.presentation),
    alternatives,
    commandBindings: [unionSelectBinding(path)],
  };
}

function transformRef(
  _runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): EditorPlanNode {
  const schema = input.schema as Extract<StructureSchema, { kind: 'ref' }>;
  const path = input.path ?? [];
  return {
    kind: 'field',
    id: nodeId(input),
    path,
    metadata: {
      ...commonMetadata(input),
      ref: schema.ref,
    },
    presenter: applyPresentation({ id: 'schema.ref', options: { ref: schema.ref } }, input.presentation),
    value: { source: 'value', path },
    commandBindings: [valueSetBinding(path)],
  };
}

function transformUnsupported(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  _config: EditorCompilerConfig,
): EditorPlanNode {
  return unsupportedNode(input, runtime.dialect.id, 'unsupported', unsupportedDiagnostic(input));
}

function unsupportedNode(
  input: EditorCompilerInput,
  dialectId: string,
  selector: string,
  diagnostic: EditorPlanDiagnostic,
): EditorPlanNode {
  const schema = input.schema as unknown as SchemaRecord;
  return {
    kind: 'custom',
    id: nodeId(input),
    path: input.path ?? [],
    metadata: {
      ...commonMetadata(input),
      config: {
        schemaKind: typeof schema.kind === 'string' ? schema.kind : 'unknown',
      },
    },
    presenter: { id: 'unsupported' },
    diagnostics: [diagnostic],
    provenance: compilerProvenance(input, dialectId, selector),
    config: {
      schemaKind: typeof schema.kind === 'string' ? schema.kind : 'unknown',
    },
  };
}

function addCompilerProvenance(
  node: EditorPlanNode,
  input: EditorCompilerInput,
  dialectId: string,
  selector: string,
): EditorPlanNode {
  return {
    ...node,
    provenance: {
      ...compilerProvenance(input, dialectId, selector),
      ...(node.provenance ?? {}),
      selector,
    },
  };
}

function mergeClassificationDiagnostics(
  node: EditorPlanNode,
  diagnostics: EditorPlanDiagnostic[] | undefined,
): EditorPlanNode {
  if (diagnostics === undefined || diagnostics.length === 0) return node;
  return {
    ...node,
    diagnostics: [...diagnostics, ...(node.diagnostics ?? [])],
  };
}

function compilerProvenance(
  input: EditorCompilerInput,
  dialectId: string,
  selector: string,
): SchemaEditorContractRecord {
  const schema = input.schema as unknown as SchemaRecord;
  return {
    dialectId,
    selector,
    schemaKind: typeof schema.kind === 'string' ? schema.kind : 'unknown',
    path: input.path ?? [],
    ...(typeof schema.id === 'string' ? { schemaId: schema.id } : {}),
    ...(input.presentation?.presenter?.id
      ? { presentationPresenterId: input.presentation.presenter.id }
      : {}),
  };
}

function ensureCompilerMetadata(
  node: EditorPlanNode,
  input: EditorCompilerInput,
): EditorPlanNode {
  if ((node as { metadata?: unknown }).metadata !== undefined) return node;

  const schema = input.schema;
  switch (node.kind) {
    case 'group':
      return { ...node, metadata: groupMetadata(input) };
    case 'field':
      if (schema.kind === 'scalar') return { ...node, metadata: scalarMetadata(input, schema) };
      if (schema.kind === 'ref') {
        return { ...node, metadata: { ...commonMetadata(input), ref: schema.ref } };
      }
      return node;
    case 'collection':
      return schema.kind === 'array'
        ? { ...node, metadata: collectionMetadata(input, schema) }
        : node;
    case 'map':
      return schema.kind === 'map'
        ? { ...node, metadata: mapMetadata(input, schema) }
        : node;
    case 'union':
      return schema.kind === 'union'
        ? { ...node, metadata: unionMetadata(input, schema) }
        : node;
    case 'custom':
      return {
        ...node,
        metadata: {
          ...commonMetadata(input),
          ...(node.config !== undefined ? { config: cloneContractRecord(node.config) } : {}),
        },
      };
  }
}

function groupMetadata(input: EditorCompilerInput): Extract<EditorPlanNode, { kind: 'group' }>['metadata'] {
  return commonMetadata(input);
}

function commonMetadata(input: EditorCompilerInput): EditorCommonPlanMetadata {
  const schema = input.schema;
  const fieldContext = input.fieldContext;
  return {
    display: displayMetadata(input),
    ...(fieldContext !== undefined
      ? { field: { key: fieldContext.key, required: fieldContext.required } }
      : {}),
    ...(schema.constraints !== undefined
      ? { constraints: cloneContractRecord(schema.constraints) }
      : {}),
  };
}

function displayMetadata(input: EditorCompilerInput): EditorPlanDisplayMetadata {
  const schema = input.schema;
  const fieldContext = input.fieldContext;
  const presentation = input.presentation;
  const label = firstNonEmptyString(
    fieldContext?.label,
    schema.label,
    fieldContext?.key,
    schema.id,
    schema.kind,
  ) ?? 'Field';
  const description = fieldContext?.description ?? schema.description;

  return {
    label,
    ...(description !== undefined ? { description } : {}),
    visible: typeof presentation?.visible === 'boolean' ? presentation.visible : true,
    readOnly: typeof presentation?.readOnly === 'boolean' ? presentation.readOnly : false,
    ...(presentation?.group !== undefined ? { group: presentation.group } : {}),
  };
}

function scalarMetadata(
  input: EditorCompilerInput,
  schema: Extract<StructureSchema, { kind: 'scalar' }>,
): Extract<EditorPlanNode, { kind: 'field' }>['metadata'] {
  return {
    ...commonMetadata(input),
    scalar: {
      kind: schema.scalar,
      ...(schema.enum !== undefined
        ? { enum: schema.enum.map(cloneContractValue) }
        : {}),
      ...(schema.const !== undefined ? { const: cloneContractValue(schema.const) } : {}),
      ...(schema.default !== undefined ? { default: cloneContractValue(schema.default) } : {}),
    },
  };
}

function collectionMetadata(
  input: EditorCompilerInput,
  schema: Extract<StructureSchema, { kind: 'array' }>,
): Extract<EditorPlanNode, { kind: 'collection' }>['metadata'] {
  return {
    ...commonMetadata(input),
    ...(schema.itemDefault !== undefined
      ? { itemDefault: cloneContractValue(schema.itemDefault) }
      : {}),
    identity: schema.identity === undefined
      ? { strategy: 'ephemeral' }
      : cloneCollectionIdentity(schema.identity),
  };
}

function mapMetadata(
  input: EditorCompilerInput,
  schema: Extract<StructureSchema, { kind: 'map' }>,
): Extract<EditorPlanNode, { kind: 'map' }>['metadata'] {
  return {
    ...commonMetadata(input),
    key: {
      scalar: 'string',
      ...(schema.key.constraints !== undefined
        ? { constraints: cloneContractRecord(schema.key.constraints) }
        : {}),
    },
    ...(schema.valueDefault !== undefined
      ? { valueDefault: cloneContractValue(schema.valueDefault) }
      : {}),
  };
}

function unionMetadata(
  input: EditorCompilerInput,
  schema: Extract<StructureSchema, { kind: 'union' }>,
): Extract<EditorPlanNode, { kind: 'union' }>['metadata'] {
  return {
    ...commonMetadata(input),
    ...(schema.discriminator !== undefined ? { discriminator: schema.discriminator } : {}),
    alternativeDescriptors: schema.alternatives.map((alternative) => ({
      id: alternative.id,
      ...(alternative.label !== undefined ? { label: alternative.label } : {}),
      ...(alternative.description !== undefined ? { description: alternative.description } : {}),
      ...(alternative.initialValue !== undefined
        ? { initialValue: cloneContractValue(alternative.initialValue) }
        : {}),
    })),
  };
}

function cloneCollectionIdentity(
  identity: CollectionIdentityHint,
): Extract<EditorPlanNode, { kind: 'collection' }>['metadata']['identity'] {
  return identity.strategy === 'ephemeral'
    ? { strategy: 'ephemeral' }
    : { strategy: 'property', path: [...identity.path], fallback: 'ephemeral' };
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function defaultScalarPresenter(
  schema: Extract<StructureSchema, { kind: 'scalar' }>,
): EditorPresenterRef {
  if (schema.const !== undefined) return { id: 'scalar.const' };
  if (schema.enum !== undefined) return { id: 'scalar.enum' };
  const format = schema.annotations?.format;
  if (format) return { id: `scalar.${format}` };
  switch (schema.scalar) {
    case 'number':
    case 'integer':
      return { id: 'scalar.number' };
    case 'boolean':
      return { id: 'scalar.boolean' };
    case 'null':
      return { id: 'scalar.null' };
    default:
      return { id: 'scalar.text' };
  }
}

function applyPresentation(
  fallback: EditorPresenterRef,
  presentation: EditorPresentationOverlay | undefined,
): EditorPresenterRef {
  const selected = presentation?.presenter;
  if (selected !== undefined) {
    const options = selected.options ?? presentation?.options;
    return {
      ...selected,
      ...(options !== undefined ? { options } : {}),
    };
  }
  const options = presentation?.options ?? fallback.options;
  return {
    ...fallback,
    ...(options !== undefined ? { options } : {}),
  };
}

function normalizeRootPresentation(input: EditorCompilerInput): EditorCompilerInput {
  const presentation = input.presentation as EditorPresentation | undefined;
  if (presentation === undefined || !Object.prototype.hasOwnProperty.call(presentation, 'overlays')) {
    return input;
  }

  return {
    ...input,
    presentation: normalizePresentationAtPath(
      input.schema,
      presentation,
      input.path ?? [],
      presentation.overlays ?? [],
    ),
  };
}

function normalizePresentationAtPath(
  schema: StructureSchema,
  recursive: EditorPresentationOverlay | undefined,
  path: ValuePath,
  pathOverlays: NonNullable<EditorPresentation['overlays']>,
): EditorPresentationOverlay | undefined {
  let normalized = clonePresentationOverlay(recursive) ?? {};

  for (const entry of pathOverlays) {
    if (pathMatches(entry.path, path)) {
      normalized = mergePresentationOverlays(normalized, entry.overlay);
    }
  }

  switch (schema.kind) {
    case 'object': {
      const children = { ...(normalized.children ?? {}) };
      for (const field of schema.fields) {
        const child = normalizePresentationAtPath(
          field.schema,
          childPresentation(normalized, field.key),
          [...path, field.key],
          pathOverlays,
        );
        if (child !== undefined) children[field.key] = child;
      }
      if (Object.keys(children).length > 0) normalized.children = children;
      break;
    }
    case 'array': {
      const item = normalizePresentationAtPath(
        schema.item,
        wildcardPresentation(normalized.item, normalized),
        [...path, '*'],
        pathOverlays,
      );
      if (item !== undefined) normalized.item = item;
      break;
    }
    case 'map': {
      const value = normalizePresentationAtPath(
        schema.value,
        wildcardPresentation(normalized.value, normalized),
        [...path, '*'],
        pathOverlays,
      );
      if (value !== undefined) normalized.value = value;
      break;
    }
    case 'union': {
      const alternatives = { ...(normalized.alternatives ?? {}) };
      for (const alternative of schema.alternatives) {
        const child = normalizePresentationAtPath(
          alternative.schema,
          alternativePresentation(normalized, alternative.id),
          path,
          pathOverlays,
        );
        if (child !== undefined) alternatives[alternative.id] = child;
      }
      if (Object.keys(alternatives).length > 0) normalized.alternatives = alternatives;
      break;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function pathMatches(pattern: Array<string | number>, path: ValuePath): boolean {
  return pattern.length === path.length && pattern.every((segment, index) => (
    segment === '*' || segment === path[index]
  ));
}

function mergePresentationOverlays(
  base: EditorPresentationOverlay,
  override: EditorPresentationOverlay,
): EditorPresentationOverlay {
  const merged = clonePresentationOverlay(base) ?? {};

  if (override.presenter !== undefined) merged.presenter = clonePresenterRef(override.presenter);
  if (override.order !== undefined) merged.order = [...override.order];
  if (override.group !== undefined) merged.group = override.group;
  if (override.visible !== undefined) merged.visible = mergePresentationValue(merged.visible, override.visible);
  if (override.readOnly !== undefined) merged.readOnly = mergePresentationValue(merged.readOnly, override.readOnly);
  if (override.options !== undefined) {
    merged.options = mergeContractRecords(merged.options, override.options);
  }
  if (override.children !== undefined) {
    merged.children = mergePresentationRecords(merged.children, override.children);
  }
  if (override.item !== undefined) {
    merged.item = mergePresentationOverlays(merged.item ?? {}, override.item);
  }
  if (override.value !== undefined) {
    merged.value = mergePresentationOverlays(merged.value ?? {}, override.value);
  }
  if (override.alternatives !== undefined) {
    merged.alternatives = mergePresentationRecords(merged.alternatives, override.alternatives);
  }

  return merged;
}

function clonePresentationOverlay(
  value: EditorPresentationOverlay | undefined,
): EditorPresentationOverlay | undefined {
  if (value === undefined) return undefined;

  return {
    ...(value.presenter !== undefined ? { presenter: clonePresenterRef(value.presenter) } : {}),
    ...(value.order !== undefined ? { order: [...value.order] } : {}),
    ...(value.group !== undefined ? { group: value.group } : {}),
    ...(value.visible !== undefined ? { visible: clonePresentationValue(value.visible) } : {}),
    ...(value.readOnly !== undefined ? { readOnly: clonePresentationValue(value.readOnly) } : {}),
    ...(value.options !== undefined ? { options: cloneContractRecord(value.options) } : {}),
    ...(value.children !== undefined ? { children: clonePresentationRecord(value.children) } : {}),
    ...(value.item !== undefined ? { item: clonePresentationOverlay(value.item) } : {}),
    ...(value.value !== undefined ? { value: clonePresentationOverlay(value.value) } : {}),
    ...(value.alternatives !== undefined
      ? { alternatives: clonePresentationRecord(value.alternatives) }
      : {}),
  };
}

function clonePresenterRef(value: EditorPresenterRef): EditorPresenterRef {
  return {
    id: value.id,
    ...(value.options !== undefined ? { options: cloneContractRecord(value.options) } : {}),
    ...(value.explicit !== undefined ? { explicit: value.explicit } : {}),
    ...(value.reason !== undefined ? { reason: value.reason } : {}),
  };
}

function clonePresentationRecord(
  value: Record<string, EditorPresentationOverlay>,
): Record<string, EditorPresentationOverlay> {
  return Object.fromEntries(Object.entries(value).map(([key, overlay]) => [
    key,
    clonePresentationOverlay(overlay) ?? {},
  ]));
}

function mergePresentationRecords(
  base: Record<string, EditorPresentationOverlay> | undefined,
  override: Record<string, EditorPresentationOverlay>,
): Record<string, EditorPresentationOverlay> {
  const merged = base === undefined ? {} : clonePresentationRecord(base);
  for (const [key, overlay] of Object.entries(override)) {
    merged[key] = mergePresentationOverlays(merged[key] ?? {}, overlay);
  }
  return merged;
}

function mergeContractRecords(
  base: SchemaEditorContractRecord | undefined,
  override: SchemaEditorContractRecord,
): SchemaEditorContractRecord {
  const merged = base === undefined ? {} : cloneContractRecord(base);
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const previous = merged[key];
    merged[key] = isRecord(previous) && isRecord(value)
      ? mergeContractRecords(previous, value)
      : cloneContractValue(value);
  }
  return merged;
}

function mergePresentationValue(
  base: boolean | SchemaEditorContractRecord | undefined,
  override: boolean | SchemaEditorContractRecord,
): boolean | SchemaEditorContractRecord {
  return isRecord(base) && isRecord(override)
    ? mergeContractRecords(base, override)
    : clonePresentationValue(override);
}

function clonePresentationValue(
  value: boolean | SchemaEditorContractRecord,
): boolean | SchemaEditorContractRecord {
  return typeof value === 'boolean' ? value : cloneContractRecord(value);
}

function childPresentation(
  presentation: EditorPresentationOverlay | undefined,
  key: string,
): EditorPresentationOverlay | undefined {
  return presentation?.children?.[key] ?? presentation?.children?.['*'];
}

function wildcardPresentation(
  direct: EditorPresentationOverlay | undefined,
  parent: EditorPresentationOverlay | undefined,
): EditorPresentationOverlay | undefined {
  return direct ?? parent?.children?.['*'];
}

function alternativePresentation(
  presentation: EditorPresentationOverlay | undefined,
  id: string,
): EditorPresentationOverlay | undefined {
  return presentation?.alternatives?.[id] ?? presentation?.alternatives?.['*'];
}

function orderFields<T extends { key: string }>(fields: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return fields;
  const positions = new Map(order.map((key, index) => [key, index]));
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftPosition = positions.get(left.field.key);
      const rightPosition = positions.get(right.field.key);
      if (leftPosition === undefined && rightPosition === undefined) return left.index - right.index;
      if (leftPosition === undefined) return 1;
      if (rightPosition === undefined) return -1;
      return leftPosition - rightPosition;
    })
    .map(({ field }) => field);
}

function valueSetBinding(path: ValuePath): EditorCommandBinding {
  return {
    event: 'value.change',
    commandTemplate: {
      kind: 'value.set',
      target: literalTarget(path),
      arguments: { value: eventArgument(['value']) },
    },
  };
}

function collectionBindings(path: ValuePath): EditorCommandBinding[] {
  return [
    {
      event: 'item.insert',
      commandTemplate: {
        kind: 'collection.insert',
        target: literalTarget(path),
        arguments: { index: eventArgument(['index']), value: eventArgument(['value']) },
      },
    },
    {
      event: 'item.remove',
      commandTemplate: {
        kind: 'collection.remove',
        target: literalTarget(path),
        arguments: { index: eventArgument(['index']) },
      },
    },
    {
      event: 'item.move',
      commandTemplate: {
        kind: 'collection.move',
        target: literalTarget(path),
        arguments: { from: eventArgument(['fromIndex']), to: eventArgument(['toIndex']) },
      },
    },
  ];
}

function mapBindings(path: ValuePath): EditorCommandBinding[] {
  return [
    {
      event: 'entry.set',
      commandTemplate: {
        kind: 'map.set',
        target: literalTarget(path),
        arguments: { key: eventArgument(['key']), value: eventArgument(['value']) },
      },
    },
    {
      event: 'entry.remove',
      commandTemplate: {
        kind: 'map.remove',
        target: literalTarget(path),
        arguments: { key: eventArgument(['key']) },
      },
    },
    {
      event: 'entry.rename',
      commandTemplate: {
        kind: 'map.rename-key',
        target: literalTarget(path),
        arguments: { from: eventArgument(['fromKey']), to: eventArgument(['toKey']) },
      },
    },
  ];
}

function unionSelectBinding(path: ValuePath): EditorCommandBinding {
  return {
    event: 'alternative.select',
    commandTemplate: {
      kind: 'union.select',
      target: literalTarget(path),
      arguments: {
        alternativeId: eventArgument(['alternativeId']),
        initialValue: eventArgument(['initialValue']),
      },
    },
  };
}

function unsupportedDiagnostic(input: EditorCompilerInput): EditorPlanDiagnostic {
  const schema = input.schema as unknown as SchemaRecord;
  const kind = typeof schema.kind === 'string' ? schema.kind : 'unknown';
  return {
    severity: 'error',
    code: 'UNSUPPORTED_SCHEMA_EDITOR',
    message: `No schema editor transformer supports schema kind "${kind}".`,
    path: input.path ?? [],
  };
}

function explicitUnsupportedDiagnostic(input: EditorCompilerInput): EditorPlanDiagnostic {
  return {
    severity: 'error',
    code: 'UNSUPPORTED_CLASSIFICATION',
    message: 'Schema editor classification explicitly marked this schema as unsupported.',
    path: input.path ?? [],
  };
}

function nodeId(input: EditorCompilerInput): string {
  const schema = input.schema as unknown as SchemaRecord;
  if (typeof schema.id === 'string' && schema.id.length > 0) return schema.id;
  const path = input.path ?? [];
  const identitySegments = [...readIdentityScope(input), ...path];
  if (identitySegments.length === 0) return 'schema.root';
  return `schema.${identitySegments.map(sanitizeIdSegment).join('.')}`;
}

function compileScoped(
  runtime: EditorCompilerRuntime,
  input: EditorCompilerInput,
  config: EditorCompilerConfig,
  identityScope: string[],
): EditorPlanNode {
  const scopedInput: EditorCompilerInput = {
    ...input,
    ...(identityScope.length > 0 ? { identityScope } : {}),
  };
  return runtime.compile(scopedInput, config);
}

function readIdentityScope(input: EditorCompilerInput): string[] {
  return input.identityScope ?? [];
}

function sanitizeIdSegment(segment: string | number): string {
  return String(segment).replace(/[^A-Za-z0-9_$:/#-]/g, '_');
}

function readPlanId(config: EditorCompilerConfig): string | undefined {
  return typeof config.planId === 'string' && config.planId.length > 0 ? config.planId : undefined;
}

function collectDiagnostics(node: EditorPlanNode): EditorPlanDiagnostic[] {
  const own = node.diagnostics ?? [];
  switch (node.kind) {
    case 'group':
      return [...own, ...node.children.flatMap(collectDiagnostics)];
    case 'collection':
      return [...own, ...collectDiagnostics(node.itemTemplate), ...(node.children ?? []).flatMap(collectDiagnostics)];
    case 'map':
      return [...own, ...collectDiagnostics(node.valueTemplate), ...(node.entries ?? []).flatMap(collectDiagnostics)];
    case 'union':
      return [...own, ...Object.values(node.alternatives).flatMap(collectDiagnostics)];
    default:
      return own;
  }
}

function normalizeClassification(value: unknown): SchemaEditorClassification | undefined {
  if (!isRecord(value)) return undefined;
  const stringKeys = ['presenterId', 'semanticType', 'format', 'structuralKind'] as const;
  if (stringKeys.some((key) => value[key] !== undefined && typeof value[key] !== 'string')) return undefined;
  if (value.unsupported !== undefined && typeof value.unsupported !== 'boolean') return undefined;
  let diagnostics: EditorPlanDiagnostic[] | undefined;
  if (value.diagnostics !== undefined) {
    if (!Array.isArray(value.diagnostics)) return undefined;
    diagnostics = [];
    for (const diagnostic of value.diagnostics) {
      const normalized = normalizeDiagnostic(diagnostic);
      if (normalized === undefined) return undefined;
      diagnostics.push(normalized);
    }
  }
  return {
    ...Object.fromEntries(stringKeys.flatMap((key) =>
      typeof value[key] === 'string' ? [[key, value[key]]] : []
    )),
    ...(typeof value.unsupported === 'boolean' ? { unsupported: value.unsupported } : {}),
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}

function normalizeDiagnostic(value: unknown): EditorPlanDiagnostic | undefined {
  if (!isRecord(value)) return undefined;
  if (value.severity !== 'info' && value.severity !== 'warning' && value.severity !== 'error') {
    return undefined;
  }
  if (typeof value.code !== 'string' || value.code.length === 0) return undefined;
  if (typeof value.message !== 'string' || value.message.length === 0) return undefined;
  if (value.path !== undefined && !isValuePath(value.path)) return undefined;
  if (value.details !== undefined && (!isRecord(value.details) || !isSerializable(value.details))) {
    return undefined;
  }
  return {
    severity: value.severity,
    code: value.code,
    message: value.message,
    ...(value.path !== undefined ? { path: [...value.path] } : {}),
    ...(value.details !== undefined ? { details: cloneContractRecord(value.details) } : {}),
  };
}

function isValuePath(value: unknown): value is ValuePath {
  return Array.isArray(value) && value.every((segment) =>
    segment === '*' ||
    (typeof segment === 'string' && segment.length > 0) ||
    (Number.isInteger(segment) && (segment as number) >= 0)
  );
}

function composeClassifiers(
  classifiers: NonNullable<EditorCompilerDialect['classify']>[],
): NonNullable<EditorCompilerDialect['classify']> {
  return function composedClassify(runtime, input, config) {
    const merged: SchemaEditorClassification = {};
    const diagnostics: EditorPlanDiagnostic[] = [];
    let diagnosticsDefined = false;

    for (const classifier of classifiers) {
      const result = classifier(runtime, input, config);
      if (isPromiseLike(result)) return result;

      const normalized = normalizeClassification(result);
      if (normalized === undefined) return result as SchemaEditorClassification;
      mergeDefinedClassification(merged, normalized);
      if (normalized.diagnostics !== undefined) {
        diagnosticsDefined = true;
        diagnostics.push(...normalized.diagnostics);
      }
    }

    if (diagnosticsDefined) merged.diagnostics = diagnostics;
    return merged;
  };
}

function mergeDefinedClassification(
  target: SchemaEditorClassification,
  source: SchemaEditorClassification,
): void {
  const keys = ['presenterId', 'semanticType', 'format', 'structuralKind', 'unsupported'] as const;
  for (const key of keys) {
    if (source[key] !== undefined) {
      Object.assign(target, { [key]: source[key] });
    }
  }
}

function mergeDialectRecords(
  dialects: readonly EditorCompilerDialect[],
  key: 'config' | 'metadata',
): SchemaEditorContractRecord | undefined {
  let merged: SchemaEditorContractRecord | undefined;
  for (const dialect of dialects) {
    const value = dialect[key];
    if (value !== undefined) merged = { ...(merged ?? {}), ...cloneContractRecord(value) };
  }
  return merged;
}

function cloneContractRecord(value: SchemaEditorContractRecord): SchemaEditorContractRecord {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => (
      child === undefined ? [] : [[key, cloneContractValue(child)]]
    )),
  ) as SchemaEditorContractRecord;
}

function cloneContractValue(value: SchemaEditorContractValue): SchemaEditorContractValue {
  if (Array.isArray(value)) return value.map(cloneContractValue);
  if (value !== null && typeof value === 'object') return cloneContractRecord(value);
  return value;
}

function assertValidDialect(dialect: EditorCompilerDialect, label: string): void {
  const result = validateSchemaEditorDialect(dialect);
  if (!result.ok) {
    throw new Error(`Schema editor dialect ${label} validation failed: ${formatIssues(result.issues)}`);
  }
}

function assertEditorCompilerConfig(value: unknown): asserts value is EditorCompilerConfig {
  if (!isRecord(value)) {
    throw new Error('Schema editor compile config must be a plain serializable object.');
  }

  const forbiddenKeys = FORBIDDEN_EDITOR_COMPILER_CONFIG_KEYS.filter((key) => (
    Object.prototype.hasOwnProperty.call(value, key)
  ));
  if (forbiddenKeys.length > 0) {
    throw new Error(`Schema editor compile config contains forbidden keys: ${forbiddenKeys.join(', ')}.`);
  }

  if (!isSerializable(value)) {
    throw new Error('Schema editor compile config must be a plain serializable object.');
  }
}

function isSerializable(value: unknown): value is SchemaEditorContractValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isSerializable);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isSerializable);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

function formatIssues(issues: Array<{ path: string; code?: string; message: string }>): string {
  return issues.map((issue) => `${issue.path} ${issue.code ?? 'INVALID'}: ${issue.message}`).join('; ');
}

type CheckedTransformer = SchemaEditorTransformer<
  EditorCompilerRuntime,
  EditorCompilerInput,
  EditorCompilerConfig,
  EditorPlanNode
>;

const processorChecks: CheckedTransformer[] = [
  transformScalar,
  transformObject,
  transformArray,
  transformMap,
  transformUnion,
  transformRef,
  transformUnsupported,
];

void processorChecks;
