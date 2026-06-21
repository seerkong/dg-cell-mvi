import {
  createSchemaEditorCanonicalRegistry,
  type CanonicalComponentRegistry,
  type SchemaEditorCanonicalRegistryDiagnostic,
  type SchemaEditorPresenterRegistryDiagnostic,
} from 'dg-cell-mvi-halfcode-vue';

import { createElementPlusCanonicalRegistry } from '../canonicalRegistry';
import {
  composeElementPlusSchemaEditorPresenterRegistries,
  createElementPlusSchemaEditorPresenterRegistry,
  type ElementPlusSchemaEditorPresenterRegistry,
} from './registry';

export interface CreateElementPlusSchemaEditorCanonicalRegistryRuntime {
  readonly parentRegistry?: CanonicalComponentRegistry;
  readonly presenterRegistries?:
    readonly ElementPlusSchemaEditorPresenterRegistry[];
}

export type CreateElementPlusSchemaEditorCanonicalRegistryInput =
  Readonly<Record<string, never>>;

export interface CreateElementPlusSchemaEditorCanonicalRegistryConfig {
  readonly presenterConflict: 'reject' | 'last-wins';
  readonly componentIdentity: 'Editor';
}

export interface ElementPlusSchemaEditorCanonicalInputDiagnostic {
  readonly code: 'INVALID_ELEMENT_PLUS_SCHEMA_EDITOR_CANONICAL_INPUT';
  readonly message: string;
}

export type ElementPlusSchemaEditorCanonicalDiagnostic =
  | ElementPlusSchemaEditorCanonicalInputDiagnostic
  | SchemaEditorPresenterRegistryDiagnostic
  | SchemaEditorCanonicalRegistryDiagnostic;

export type ElementPlusSchemaEditorCanonicalRegistryResult =
  | Readonly<{
      ok: true;
      registry: CanonicalComponentRegistry;
      presenterRegistry: ElementPlusSchemaEditorPresenterRegistry;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly ElementPlusSchemaEditorCanonicalDiagnostic[];
    }>;

const EMPTY_DIAGNOSTICS = Object.freeze([]) as readonly [];
const EMPTY_PRESENTER_REGISTRIES =
  Object.freeze([]) as readonly ElementPlusSchemaEditorPresenterRegistry[];

export function createElementPlusSchemaEditorCanonicalRegistry(
  runtime: CreateElementPlusSchemaEditorCanonicalRegistryRuntime,
  input: CreateElementPlusSchemaEditorCanonicalRegistryInput,
  config: CreateElementPlusSchemaEditorCanonicalRegistryConfig,
): ElementPlusSchemaEditorCanonicalRegistryResult {
  const runtimeFields = readOwnDataRecord(runtime);
  const inputFields = readOwnDataRecord(input);
  const configFields = readOwnDataRecord(config);
  if (
    !hasOnlyKeys(runtimeFields, ['parentRegistry', 'presenterRegistries'])
    || !hasExactKeys(inputFields, [])
    || !hasExactKeys(configFields, [
      'componentIdentity',
      'presenterConflict',
    ])
  ) {
    return invalidInput(
      'Canonical composition requires own-data runtime/config records and an empty input record.',
    );
  }

  const presenterConflict = configFields.get('presenterConflict');
  const componentIdentity = configFields.get('componentIdentity');
  const presenterRegistriesValue = runtimeFields.get('presenterRegistries');
  if (
    (presenterConflict !== 'reject' && presenterConflict !== 'last-wins')
    || componentIdentity !== 'Editor'
  ) {
    return invalidInput(
      'Canonical composition requires componentIdentity "Editor", an explicit presenter conflict policy, and ordered own-data presenter registries.',
    );
  }

  const defaultPresenters = createElementPlusSchemaEditorPresenterRegistry(
    Object.freeze({}),
    Object.freeze({}),
    Object.freeze({}),
  );
  if (!defaultPresenters.ok) {
    return failure(defaultPresenters.diagnostics);
  }

  const businessRegistries = presenterRegistriesValue === undefined
    ? EMPTY_PRESENTER_REGISTRIES
    : readArrayValues<ElementPlusSchemaEditorPresenterRegistry>(
        presenterRegistriesValue,
      );
  if (!businessRegistries) {
    return invalidInput(
      'Canonical composition presenter registries must contain only own data entries.',
    );
  }
  const presenterRegistries = Object.freeze([
    defaultPresenters.registry,
    ...businessRegistries,
  ]);
  const presenters = composeElementPlusSchemaEditorPresenterRegistries(
    Object.freeze({ registries: presenterRegistries }),
    Object.freeze({}),
    Object.freeze({ conflict: presenterConflict }),
  );
  if (!presenters.ok) {
    return failure(presenters.diagnostics);
  }

  const parentRegistry = runtimeFields.get('parentRegistry')
    ?? createElementPlusCanonicalRegistry();
  const canonical = createSchemaEditorCanonicalRegistry(
    Object.freeze({ presenterRegistry: presenters.registry }),
    Object.freeze({ parentRegistry: parentRegistry as CanonicalComponentRegistry }),
    Object.freeze({ componentIdentity }),
  );
  if (!canonical.ok) {
    return failure(canonical.diagnostics);
  }

  return Object.freeze({
    ok: true,
    registry: canonical.registry,
    presenterRegistry: presenters.registry,
    diagnostics: EMPTY_DIAGNOSTICS,
  });
}

function invalidInput(
  message: string,
): ElementPlusSchemaEditorCanonicalRegistryResult {
  return failure(Object.freeze([Object.freeze({
    code: 'INVALID_ELEMENT_PLUS_SCHEMA_EDITOR_CANONICAL_INPUT',
    message,
  })]));
}

function failure(
  diagnostics: readonly ElementPlusSchemaEditorCanonicalDiagnostic[],
): ElementPlusSchemaEditorCanonicalRegistryResult {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function hasExactKeys(
  fields: ReadonlyMap<string, unknown> | undefined,
  keys: readonly string[],
): fields is ReadonlyMap<string, unknown> {
  return fields !== undefined
    && fields.size === keys.length
    && keys.every((key) => fields.has(key));
}

function hasOnlyKeys(
  fields: ReadonlyMap<string, unknown> | undefined,
  allowedKeys: readonly string[],
): fields is ReadonlyMap<string, unknown> {
  if (!fields) return false;
  const allowed = new Set(allowedKeys);
  for (const key of fields.keys()) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function readOwnDataRecord(
  value: unknown,
): ReadonlyMap<string, unknown> | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return undefined;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const fields = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return undefined;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return undefined;
  }
}

function readArrayValues<T>(value: unknown): readonly T[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor && 'value' in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
    if (
      typeof length !== 'number'
      || !Number.isSafeInteger(length)
      || length < 0
      || Reflect.ownKeys(descriptors).length !== length + 1
    ) {
      return undefined;
    }
    const values: T[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)) return undefined;
      values.push(descriptor.value as T);
    }
    return Object.freeze(values);
  } catch {
    return undefined;
  }
}
