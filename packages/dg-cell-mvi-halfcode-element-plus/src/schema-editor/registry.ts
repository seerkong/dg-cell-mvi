import {
  composeSchemaEditorPresenterRegistries,
  createSchemaEditorPresenterRegistry,
} from 'dg-cell-mvi-halfcode-vue';
import type {
  SchemaEditorPresenterAdapter,
  SchemaEditorPresenterEntry,
  SchemaEditorPresenterRegistry,
  SchemaEditorPresenterRegistryDiagnostic,
  SchemaEditorPresenterRegistryResult,
} from 'dg-cell-mvi-halfcode-vue';
import type { Component } from 'vue';
import { CollectionListPresenter } from './collection/collectionListPresenter';
import { MapEntriesPresenter } from './map/mapEntriesPresenter';
import { ObjectGroupPresenter } from './object/objectGroupPresenter';
import {
  COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS,
  type CommonScalarFormatPresenterId,
} from './scalar/formatPresenters';
import {
  BooleanPresenter,
  ConstPresenter,
  EnumPresenter,
  NullPresenter,
  NumberPresenter,
  ReferencePresenter,
  TextPresenter,
  UnsupportedPresenter,
} from './scalar/scalarPresenters';
import {
  DEFAULT_STRUCTURED_VALUE_ENGINES,
  type StructuredValuePresenterEngines,
} from './structured-value/engines';
import {
  createStructuredValueModalPresenter,
} from './structured-value/structuredValueModalPresenter';
import { UnionSelectPresenter } from './union/unionSelectPresenter';

export type ElementPlusSchemaEditorPresenterAdapter =
  SchemaEditorPresenterAdapter<Component>;
export type ElementPlusSchemaEditorPresenterRegistry =
  SchemaEditorPresenterRegistry<ElementPlusSchemaEditorPresenterAdapter>;
export type ElementPlusSchemaEditorPresenterRegistryResult =
  SchemaEditorPresenterRegistryResult<ElementPlusSchemaEditorPresenterAdapter>;

export interface CreateElementPlusSchemaEditorPresenterRegistryRuntime {
  readonly engines?: StructuredValuePresenterEngines;
}
export type CreateElementPlusSchemaEditorPresenterRegistryInput =
  Readonly<Record<string, never>>;
export type CreateElementPlusSchemaEditorPresenterRegistryConfig =
  Readonly<Record<string, never>>;

export interface ComposeElementPlusSchemaEditorPresenterRegistriesRuntime {
  readonly registries: readonly ElementPlusSchemaEditorPresenterRegistry[];
}

export type ComposeElementPlusSchemaEditorPresenterRegistriesInput =
  Readonly<Record<string, never>>;

export interface ComposeElementPlusSchemaEditorPresenterRegistriesConfig {
  readonly conflict: 'reject' | 'last-wins';
}

const FORMAT_PRESENTER_IDS = Object.freeze([
  'scalar.email',
  'scalar.password',
  'scalar.textarea',
  'scalar.multiline',
  'scalar.url',
  'scalar.uri',
  'scalar.tel',
  'scalar.phone',
  'scalar.date',
  'scalar.time',
  'scalar.datetime',
  'scalar.date-time',
  'scalar.color',
  'scalar.currency',
] satisfies readonly CommonScalarFormatPresenterId[]);

export function createElementPlusSchemaEditorPresenterRegistry(
  runtime: CreateElementPlusSchemaEditorPresenterRegistryRuntime,
  input: CreateElementPlusSchemaEditorPresenterRegistryInput,
  config: CreateElementPlusSchemaEditorPresenterRegistryConfig,
): ElementPlusSchemaEditorPresenterRegistryResult {
  const runtimeFields = readOwnDataRecord(runtime);
  const engines = readStructuredValueEngines(runtimeFields);
  if (
    !runtimeFields
    || (
      !hasExactKeys(runtimeFields, [])
      && !hasExactKeys(runtimeFields, ['engines'])
    )
    || !engines
    || !isOwnDataRecordWithKeys(input, [])
    || !isOwnDataRecordWithKeys(config, [])
  ) {
    return invalidInput(
      'Element Plus presenter registry requires optional frozen runtime.engines Effects and empty own-data input/config records.',
    );
  }

  return createSchemaEditorPresenterRegistry<
    ElementPlusSchemaEditorPresenterAdapter
  >(
    {},
    { entries: createDefaultEntries(engines) },
    { duplicate: 'reject' },
  );
}

export function composeElementPlusSchemaEditorPresenterRegistries(
  runtime: ComposeElementPlusSchemaEditorPresenterRegistriesRuntime,
  input: ComposeElementPlusSchemaEditorPresenterRegistriesInput,
  config: ComposeElementPlusSchemaEditorPresenterRegistriesConfig,
): ElementPlusSchemaEditorPresenterRegistryResult {
  const runtimeFields = readOwnDataRecord(runtime);
  const inputFields = readOwnDataRecord(input);
  const configFields = readOwnDataRecord(config);
  if (
    !hasExactKeys(runtimeFields, ['registries'])
    || !hasExactKeys(inputFields, [])
    || !hasExactKeys(configFields, ['conflict'])
  ) {
    return invalidInput(
      'Registry composition requires runtime.registries, an empty input record, and an explicit conflict config.',
    );
  }

  const registries = runtimeFields.get('registries');
  const conflict = configFields.get('conflict');
  if (
    !isOwnDataArray(registries)
    || (conflict !== 'reject' && conflict !== 'last-wins')
  ) {
    return invalidInput(
      'Registry composition requires own-data registries and conflict "reject" or "last-wins".',
    );
  }

  return composeSchemaEditorPresenterRegistries<
    ElementPlusSchemaEditorPresenterAdapter
  >(
    {},
    { registries: registries as readonly ElementPlusSchemaEditorPresenterRegistry[] },
    { conflict },
  );
}

function createDefaultEntries(
  engines: StructuredValuePresenterEngines,
): readonly SchemaEditorPresenterEntry<
  ElementPlusSchemaEditorPresenterAdapter
>[] {
  const entries: SchemaEditorPresenterEntry<
    ElementPlusSchemaEditorPresenterAdapter
  >[] = [
    createEntry('object.group', ObjectGroupPresenter),
    createEntry('scalar.text', TextPresenter),
    createEntry('scalar.number', NumberPresenter),
    createEntry('scalar.boolean', BooleanPresenter),
    createEntry('scalar.null', NullPresenter),
    createEntry('scalar.enum', EnumPresenter),
    createEntry('scalar.const', ConstPresenter),
    createEntry('collection.list', CollectionListPresenter),
    createEntry('map.entries', MapEntriesPresenter),
    createEntry(
      'structured-value.modal',
      createStructuredValueModalPresenter(engines),
    ),
    createEntry('union.select', UnionSelectPresenter),
    createEntry('schema.ref', ReferencePresenter),
    createEntry('unsupported', UnsupportedPresenter),
  ];

  for (const id of FORMAT_PRESENTER_IDS) {
    entries.push(createEntry(id, COMMON_SCALAR_FORMAT_PRESENTER_COMPONENTS[id]));
  }
  return Object.freeze(entries);
}

function readStructuredValueEngines(
  runtimeFields: ReadonlyMap<string, unknown> | undefined,
): StructuredValuePresenterEngines | undefined {
  if (!runtimeFields) return undefined;
  if (runtimeFields.size === 0) return DEFAULT_STRUCTURED_VALUE_ENGINES;

  const value = runtimeFields.get('engines');
  const fields = readOwnDataRecord(value);
  if (
    !fields
    || !hasExactKeys(fields, ['loadVisual', 'loadJson'])
    || !Object.isFrozen(value)
    || typeof fields.get('loadVisual') !== 'function'
    || typeof fields.get('loadJson') !== 'function'
  ) {
    return undefined;
  }
  return value as StructuredValuePresenterEngines;
}

function createEntry(
  id: string,
  component: Component,
): SchemaEditorPresenterEntry<ElementPlusSchemaEditorPresenterAdapter> {
  const adapter = Object.freeze({ component });
  return Object.freeze({ id, adapter });
}

function invalidInput(
  message: string,
): ElementPlusSchemaEditorPresenterRegistryResult {
  const diagnostic: SchemaEditorPresenterRegistryDiagnostic = Object.freeze({
    code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
    id: '',
    message,
  });
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([diagnostic]),
  });
}

function isOwnDataRecordWithKeys(
  value: unknown,
  keys: readonly string[],
): boolean {
  return hasExactKeys(readOwnDataRecord(value), keys);
}

function hasExactKeys(
  fields: ReadonlyMap<string, unknown> | undefined,
  keys: readonly string[],
): fields is ReadonlyMap<string, unknown> {
  if (!fields || fields.size !== keys.length) return false;
  return keys.every((key) => fields.has(key));
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
    const keys = Reflect.ownKeys(descriptors);
    const fields = new Map<string, unknown>();
    for (const key of keys) {
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

function isOwnDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length = lengthDescriptor && 'value' in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
    if (
      typeof length !== 'number'
      || !Number.isSafeInteger(length)
      || length < 0
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== length + 1) return false;
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
