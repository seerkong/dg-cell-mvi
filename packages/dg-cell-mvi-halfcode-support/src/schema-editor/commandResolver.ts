import {
  snapshotSerializableValue,
  validateSchemaEditorCommand,
  type SchemaEditorCommand,
  type SchemaEditorCommandArgument,
  type SchemaEditorCommandTemplate,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
  type ValuePath,
} from 'dg-cell-mvi-halfcode-contract';

export type SchemaEditorWildcardBinding = string | number;

export interface ResolveSchemaEditorCommandInput {
  template: SchemaEditorCommandTemplate;
  event: SchemaEditorContractValue;
  snapshot: SchemaEditorContractValue;
  wildcardBindings?: readonly SchemaEditorWildcardBinding[];
}

export type ResolveSchemaEditorCommandConfig = Readonly<Record<string, never>>;

export interface SchemaEditorCommandResolutionDiagnostic {
  path: string;
  code: string;
  message: string;
}

export type ResolveSchemaEditorCommandResult =
  | {
      ok: true;
      command: SchemaEditorCommand;
      diagnostics: [];
    }
  | {
      ok: false;
      diagnostics: SchemaEditorCommandResolutionDiagnostic[];
    };

type SnapshotRecord = Record<string, SchemaEditorContractValue | undefined>;

interface ValidatedResolverInput {
  readonly template: SnapshotRecord;
  readonly event: SchemaEditorContractValue;
  readonly snapshot: SchemaEditorContractValue;
  readonly wildcardBindings: readonly SchemaEditorWildcardBinding[];
}

interface ResolutionContext {
  readonly event: SchemaEditorContractValue;
  readonly snapshot: SchemaEditorContractValue;
  readonly wildcardBindings: readonly SchemaEditorWildcardBinding[];
  readonly diagnostics: SchemaEditorCommandResolutionDiagnostic[];
}

type BindingResult =
  | { status: 'resolved'; value: SchemaEditorContractValue }
  | { status: 'missing' }
  | { status: 'invalid' };

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const COMMAND_KINDS = new Set([
  'value.set',
  'collection.insert',
  'collection.remove',
  'collection.move',
  'map.set',
  'map.remove',
  'map.rename-key',
  'union.select',
]);
const REQUIRED_ARGUMENTS: Record<string, readonly string[]> = {
  'value.set': ['value'],
  'collection.insert': [],
  'collection.remove': ['index'],
  'collection.move': ['from', 'to'],
  'map.set': ['key', 'value'],
  'map.remove': ['key'],
  'map.rename-key': ['from', 'to'],
  'union.select': ['alternativeId'],
};
const ARGUMENT_NAMES: Record<string, readonly string[]> = {
  'value.set': ['value'],
  'collection.insert': ['index', 'value'],
  'collection.remove': ['index'],
  'collection.move': ['from', 'to'],
  'map.set': ['key', 'value'],
  'map.remove': ['key'],
  'map.rename-key': ['from', 'to'],
  'union.select': ['alternativeId', 'initialValue'],
};

export function resolveSchemaEditorCommand(
  _runtime: unknown,
  input: ResolveSchemaEditorCommandInput,
  _config: ResolveSchemaEditorCommandConfig,
): ResolveSchemaEditorCommandResult {
  const diagnostics: SchemaEditorCommandResolutionDiagnostic[] = [];
  const ownedInput = snapshotAndValidateResolverInput(input, diagnostics);
  if (!ownedInput) return { ok: false, diagnostics };

  const wildcardBindings = validateWildcardBindings(ownedInput.wildcardBindings, diagnostics);
  const context: ResolutionContext = {
    event: ownedInput.event,
    snapshot: ownedInput.snapshot,
    wildcardBindings,
    diagnostics,
  };
  const template = ownedInput.template;
  const templateKind = template.kind as string;
  const targetBinding = template.target as unknown as SnapshotRecord;
  const targetBindingWildcardCount =
    targetBinding.source === 'literal'
      ? 0
      : countWildcards(targetBinding.path as unknown as readonly unknown[]);
  const rawTarget = resolveBinding(targetBinding, '$.target', true, context, wildcardBindings.length);
  let targetWildcardCount = targetBindingWildcardCount;
  let target: ValuePath | undefined;

  if (rawTarget.status === 'resolved') {
    if (Array.isArray(rawTarget.value)) {
      targetWildcardCount = Math.max(targetWildcardCount, countWildcards(rawTarget.value));
      target = materializePath(
        rawTarget.value,
        '$.target',
        wildcardBindings,
        targetWildcardCount,
        diagnostics,
      );
    } else {
      target = rawTarget.value as unknown as ValuePath;
    }
  }

  const candidate: Record<string, unknown> = { kind: templateKind, target };
  resolveCommandArguments(template, candidate, context, targetWildcardCount);
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const validation = validateSchemaEditorCommand(candidate);
  if (!validation.ok) {
    return {
      ok: false,
      diagnostics: validation.issues.map((issue) => ({
        path: issue.path,
        code: issue.code ?? 'INVALID_SCHEMA_EDITOR_COMMAND',
        message: issue.message,
      })),
    };
  }

  return { ok: true, command: candidate as SchemaEditorCommand, diagnostics: [] };
}

function snapshotAndValidateResolverInput(
  input: ResolveSchemaEditorCommandInput,
  diagnostics: SchemaEditorCommandResolutionDiagnostic[],
): ValidatedResolverInput | undefined {
  const issues: SchemaEditorValidationIssue[] = [];
  const snapshot = snapshotSerializableValue(input, '$', issues);
  if (issues.length > 0 || snapshot === undefined) {
    diagnostics.push(...issues.map(snapshotIssueToDiagnostic));
    return undefined;
  }
  if (!isSnapshotRecord(snapshot)) {
    diagnostics.push({ path: '$', code: 'INVALID_RESOLVER_INPUT', message: 'Resolver input must be a plain own-property object.' });
    return undefined;
  }

  const template = requiredSnapshotValue(snapshot, 'template', '$.template', diagnostics);
  const event = requiredSnapshotValue(snapshot, 'event', '$.event', diagnostics);
  const acceptedSnapshot = requiredSnapshotValue(snapshot, 'snapshot', '$.snapshot', diagnostics);
  const wildcardBindings = optionalSnapshotValue(snapshot, 'wildcardBindings') ?? [];
  if (!isSnapshotRecord(template)) {
    diagnostics.push({ path: '$.template', code: 'INVALID_COMMAND_TEMPLATE', message: 'Command template must be a plain data object.' });
  }
  if (!Array.isArray(wildcardBindings)) {
    diagnostics.push({ path: '$.wildcardBindings', code: 'INVALID_WILDCARD_BINDINGS', message: 'Wildcard bindings must be a plain data array.' });
  }
  if (!isSnapshotRecord(template) || !Array.isArray(wildcardBindings)) return undefined;

  const kind = requiredSnapshotValue(template, 'kind', '$.template.kind', diagnostics);
  const target = requiredSnapshotValue(template, 'target', '$.template.target', diagnostics);
  if (typeof kind !== 'string' || !COMMAND_KINDS.has(kind)) {
    diagnostics.push({ path: '$.template.kind', code: 'UNKNOWN_COMMAND_KIND', message: 'Command template kind is not supported.' });
    return undefined;
  }
  validateSnapshotBinding(target, '$.target', diagnostics);

  const hasArguments = hasOwnSnapshotValue(template, 'arguments');
  const argumentsValue = optionalSnapshotValue(template, 'arguments');
  if (REQUIRED_ARGUMENTS[kind].length > 0 && !hasArguments) {
    diagnostics.push({ path: '$.template.arguments', code: 'MISSING_COMMAND_ARGUMENTS', message: `Command template ${kind} requires own arguments.` });
  }
  if (hasArguments && !isSnapshotRecord(argumentsValue)) {
    diagnostics.push({ path: '$.template.arguments', code: 'INVALID_COMMAND_ARGUMENTS', message: 'Command template arguments must be a plain object.' });
  } else if (isSnapshotRecord(argumentsValue)) {
    for (const name of REQUIRED_ARGUMENTS[kind]) {
      if (!hasOwnSnapshotValue(argumentsValue, name)) {
        diagnostics.push({ path: `$.template.arguments.${name}`, code: 'MISSING_COMMAND_ARGUMENT', message: `Command template ${kind} requires own argument ${name}.` });
      }
    }
    for (const name of ARGUMENT_NAMES[kind]) {
      if (hasOwnSnapshotValue(argumentsValue, name)) {
        validateSnapshotBinding(argumentsValue[name], `$.arguments.${name}`, diagnostics);
      }
    }
  }

  if (diagnostics.length > 0) return undefined;
  return {
    template,
    event: event as SchemaEditorContractValue,
    snapshot: acceptedSnapshot as SchemaEditorContractValue,
    wildcardBindings: wildcardBindings as readonly SchemaEditorWildcardBinding[],
  };
}

function validateSnapshotBinding(
  binding: unknown,
  path: string,
  diagnostics: SchemaEditorCommandResolutionDiagnostic[],
): void {
  if (!isSnapshotRecord(binding)) {
    diagnostics.push({ path, code: 'INVALID_COMMAND_ARGUMENT_BINDING', message: 'Command bindings must be plain own-property objects.' });
    return;
  }
  const source = requiredSnapshotValue(binding, 'source', `${path}.source`, diagnostics);
  if (source !== 'event' && source !== 'value' && source !== 'literal') {
    diagnostics.push({ path: `${path}.source`, code: 'INVALID_COMMAND_ARGUMENT_SOURCE', message: 'Binding source must be event, value, or literal.' });
    return;
  }
  if (source === 'literal') {
    requiredSnapshotValue(binding, 'value', `${path}.value`, diagnostics);
    return;
  }
  const bindingPath = requiredSnapshotValue(binding, 'path', `${path}.path`, diagnostics);
  if (!Array.isArray(bindingPath)) {
    diagnostics.push({ path: `${path}.path`, code: 'INVALID_VALUE_PATH', message: 'Binding path must be an own array value.' });
  }
}

function resolveCommandArguments(
  template: SnapshotRecord,
  candidate: Record<string, unknown>,
  context: ResolutionContext,
  wildcardLimit: number,
): void {
  const argumentsValue = template.arguments as unknown as SnapshotRecord | undefined;
  switch (template.kind) {
    case 'value.set':
      assignArgument(argumentsValue!.value as unknown as SnapshotRecord, 'value', true, candidate, context, wildcardLimit);
      return;
    case 'collection.insert':
      assignOptionalArgument(argumentsValue, 'index', candidate, context, wildcardLimit);
      assignOptionalArgument(argumentsValue, 'value', candidate, context, wildcardLimit);
      return;
    case 'collection.remove':
      assignArgument(argumentsValue!.index as unknown as SnapshotRecord, 'index', true, candidate, context, wildcardLimit);
      return;
    case 'collection.move':
      assignArgument(argumentsValue!.from as unknown as SnapshotRecord, 'from', true, candidate, context, wildcardLimit);
      assignArgument(argumentsValue!.to as unknown as SnapshotRecord, 'to', true, candidate, context, wildcardLimit);
      return;
    case 'map.set':
      assignArgument(argumentsValue!.key as unknown as SnapshotRecord, 'key', true, candidate, context, wildcardLimit);
      assignArgument(argumentsValue!.value as unknown as SnapshotRecord, 'value', true, candidate, context, wildcardLimit);
      return;
    case 'map.remove':
      assignArgument(argumentsValue!.key as unknown as SnapshotRecord, 'key', true, candidate, context, wildcardLimit);
      return;
    case 'map.rename-key':
      assignArgument(argumentsValue!.from as unknown as SnapshotRecord, 'from', true, candidate, context, wildcardLimit);
      assignArgument(argumentsValue!.to as unknown as SnapshotRecord, 'to', true, candidate, context, wildcardLimit);
      return;
    case 'union.select':
      assignArgument(argumentsValue!.alternativeId as unknown as SnapshotRecord, 'alternativeId', true, candidate, context, wildcardLimit);
      assignOptionalArgument(argumentsValue, 'initialValue', candidate, context, wildcardLimit);
  }
}

function assignOptionalArgument(
  argumentsValue: SnapshotRecord | undefined,
  name: string,
  candidate: Record<string, unknown>,
  context: ResolutionContext,
  wildcardLimit: number,
): void {
  if (argumentsValue && hasOwnSnapshotValue(argumentsValue, name)) {
    assignArgument(argumentsValue[name] as unknown as SnapshotRecord, name, false, candidate, context, wildcardLimit);
  }
}

function assignArgument(
  binding: SnapshotRecord,
  name: string,
  required: boolean,
  candidate: Record<string, unknown>,
  context: ResolutionContext,
  wildcardLimit: number,
): void {
  const result = resolveBinding(binding, `$.arguments.${name}`, required, context, wildcardLimit);
  if (result.status === 'resolved') candidate[name] = result.value;
}

function resolveBinding(
  binding: SnapshotRecord,
  path: string,
  required: boolean,
  context: ResolutionContext,
  wildcardLimit: number,
): BindingResult {
  if (binding.source === 'literal') {
    return { status: 'resolved', value: binding.value as SchemaEditorContractValue };
  }

  const materializedPath = materializePath(
    binding.path as unknown as readonly unknown[],
    `${path}.path`,
    context.wildcardBindings,
    wildcardLimit,
    context.diagnostics,
  );
  if (!materializedPath) return { status: 'invalid' };

  const source = binding.source === 'event' ? context.event : context.snapshot;
  const lookup = readSafePath(source, materializedPath, path);
  if ('diagnostic' in lookup) {
    context.diagnostics.push(lookup.diagnostic);
    return { status: 'invalid' };
  }
  if (!lookup.found || lookup.value === undefined) {
    if (required) {
      context.diagnostics.push({
        path,
        code: 'MISSING_REQUIRED_SOURCE',
        message: `Required ${String(binding.source)} source did not resolve a value.`,
      });
    }
    return { status: 'missing' };
  }
  return { status: 'resolved', value: lookup.value };
}

function validateWildcardBindings(
  bindings: readonly SchemaEditorWildcardBinding[],
  diagnostics: SchemaEditorCommandResolutionDiagnostic[],
): readonly SchemaEditorWildcardBinding[] {
  const valid: SchemaEditorWildcardBinding[] = [];
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    if (
      (typeof binding === 'string' && binding.length > 0) ||
      (typeof binding === 'number' && Number.isInteger(binding) && binding >= 0)
    ) {
      valid.push(binding);
    } else {
      diagnostics.push({
        path: `$.wildcardBindings[${index}]`,
        code: 'INVALID_WILDCARD_BINDING',
        message: 'Wildcard bindings must be non-empty strings or non-negative integers.',
      });
    }
  }
  return valid;
}

function materializePath(
  path: readonly unknown[],
  diagnosticPath: string,
  bindings: readonly SchemaEditorWildcardBinding[],
  wildcardLimit: number,
  diagnostics: SchemaEditorCommandResolutionDiagnostic[],
): ValuePath | undefined {
  const result: Array<string | number> = [];
  let wildcardIndex = 0;
  for (let index = 0; index < path.length; index += 1) {
    let segment = path[index];
    if (segment === '*') {
      if (wildcardIndex >= wildcardLimit || wildcardIndex >= bindings.length) {
        diagnostics.push({
          path: `${diagnosticPath}[${index}]`,
          code: 'UNBOUND_WILDCARD',
          message: 'Every wildcard must be materialized by an explicit target binding.',
        });
        return undefined;
      }
      segment = bindings[wildcardIndex];
      wildcardIndex += 1;
    }
    if (!isPrimitivePathSegment(segment)) {
      diagnostics.push({
        path: `${diagnosticPath}[${index}]`,
        code: 'INVALID_VALUE_PATH_SEGMENT',
        message: 'Path segments must be primitive non-empty strings or non-negative integers.',
      });
      return undefined;
    }
    if (typeof segment === 'string' && UNSAFE_PATH_SEGMENTS.has(segment)) {
      diagnostics.push({
        path: `${diagnosticPath}[${index}]`,
        code: 'UNSAFE_PATH_SEGMENT',
        message: `Path segment "${segment}" is not safe for source traversal.`,
      });
      return undefined;
    }
    result.push(segment);
  }
  return result;
}

function countWildcards(path: readonly unknown[]): number {
  let count = 0;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === '*') count += 1;
  }
  return count;
}

function readSafePath(
  source: SchemaEditorContractValue,
  path: ValuePath,
  diagnosticPath: string,
):
  | { found: true; value: SchemaEditorContractValue }
  | { found: false }
  | { diagnostic: SchemaEditorCommandResolutionDiagnostic } {
  let current: SchemaEditorContractValue = source;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (Array.isArray(current)) {
      if (typeof segment !== 'number') {
        return {
          diagnostic: {
            path: `${diagnosticPath}.path[${index}]`,
            code: 'INVALID_SOURCE_TYPE',
            message: 'Array source traversal requires a non-negative integer segment.',
          },
        };
      }
    } else if (!isSnapshotRecord(current)) {
      return {
        diagnostic: {
          path: `${diagnosticPath}.path[${index}]`,
          code: 'INVALID_SOURCE_TYPE',
          message: 'Source traversal reached a non-container value before the path ended.',
        },
      };
    }
    if (!hasOwnSnapshotValue(current, String(segment))) return { found: false };
    current = (current as SnapshotRecord)[String(segment)] as SchemaEditorContractValue;
  }
  return { found: true, value: current };
}

function requiredSnapshotValue(
  value: SnapshotRecord,
  property: string,
  path: string,
  diagnostics: SchemaEditorCommandResolutionDiagnostic[],
): unknown {
  if (!hasOwnSnapshotValue(value, property)) {
    diagnostics.push({ path, code: 'MISSING_OWN_PROPERTY', message: `Required field ${property} must be an own data property.` });
    return undefined;
  }
  return value[property];
}

function optionalSnapshotValue(value: SnapshotRecord, property: string): unknown {
  return hasOwnSnapshotValue(value, property) ? value[property] : undefined;
}

function hasOwnSnapshotValue(value: object, property: string): boolean {
  try {
    return Object.hasOwn(value, property);
  } catch {
    return false;
  }
}

function isSnapshotRecord(value: unknown): value is SnapshotRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitivePathSegment(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  );
}

function snapshotIssueToDiagnostic(issue: SchemaEditorValidationIssue): SchemaEditorCommandResolutionDiagnostic {
  let code = issue.code ?? 'INVALID_RESOLVER_INPUT';
  if (code === 'UNSAFE_CONTRACT_DESCRIPTOR' || code === 'RUNTIME_INSTANCE') code = 'UNSAFE_SOURCE_OBJECT';
  if (code === 'ACCESSOR_CONTRACT_FIELD') code = 'UNSAFE_SOURCE_ACCESSOR';
  if (code === 'SPARSE_CONTRACT_ARRAY') code = 'SPARSE_ARRAY_INPUT';
  if (
    issue.path.includes('.path[') &&
    (code === 'EXECUTABLE_VALUE' || code === 'NON_SERIALIZABLE_VALUE')
  ) {
    code = 'INVALID_VALUE_PATH_SEGMENT';
  }
  return { path: issue.path, code, message: issue.message };
}
