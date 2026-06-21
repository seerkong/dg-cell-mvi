import type {
  SchemaEditorPresenterAdapter,
  SchemaEditorPresenterEntry,
  SchemaEditorPresenterRegistry,
  SchemaEditorPresenterRegistryDiagnostic,
  SchemaEditorPresenterRegistryResult,
  SchemaEditorPresenterResolution,
} from './contracts';

const EMPTY_DIAGNOSTICS = Object.freeze([]) as readonly [];
const PRESENTER_ID = /^[A-Za-z][A-Za-z0-9._-]*$/;

export function createSchemaEditorPresenterRegistry<
  TAdapter = SchemaEditorPresenterAdapter,
>(
  _runtime: unknown,
  input: Readonly<{ entries: readonly SchemaEditorPresenterEntry<TAdapter>[] }>,
  config: Readonly<{ duplicate: 'reject' }>,
): SchemaEditorPresenterRegistryResult<TAdapter> {
  const inputRecord = readRecord(input);
  const configRecord = readRecord(config);
  const entriesValue = inputRecord?.get('entries');
  const duplicate = configRecord?.get('duplicate');
  if (!isArraySafely(entriesValue) || duplicate !== 'reject') {
    return registryFailure(
      diagnostic(
        'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        '',
        'Presenter registry input must contain own data entries and duplicate must be "reject".',
      ),
    );
  }

  const entryCount = readArrayLength(entriesValue);
  if (entryCount === undefined) {
    return registryFailure(
      diagnostic(
        'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        '',
        'Presenter entries must expose a valid own data length.',
      ),
    );
  }
  const entries = new Map<string, TAdapter>();
  for (let index = 0; index < entryCount; index += 1) {
    const parsed = readPresenterEntry<TAdapter>(readArrayData(entriesValue, index));
    if (!parsed.ok) {
      return registryFailure(
        diagnostic(
          parsed.code,
          parsed.id,
          `Presenter entry at index ${index} must contain only own data properties.`,
        ),
      );
    }
    const { id, adapter } = parsed.entry;
    if (entries.has(id)) {
      return registryFailure(
        diagnostic(
          'DUPLICATE_SCHEMA_EDITOR_PRESENTER',
          id,
          `Presenter id "${id}" is registered more than once.`,
        ),
      );
    }
    entries.set(id, adapter);
  }

  return registrySuccess(createOwnedRegistry(entries));
}

export function composeSchemaEditorPresenterRegistries<
  TAdapter = SchemaEditorPresenterAdapter,
>(
  _runtime: unknown,
  input: Readonly<{ registries: readonly SchemaEditorPresenterRegistry<TAdapter>[] }>,
  config: Readonly<{ conflict: 'reject' | 'last-wins' }>,
): SchemaEditorPresenterRegistryResult<TAdapter> {
  const inputRecord = readRecord(input);
  const configRecord = readRecord(config);
  const registriesValue = inputRecord?.get('registries');
  const conflict = configRecord?.get('conflict');
  if (
    !isArraySafely(registriesValue)
    || (conflict !== 'reject' && conflict !== 'last-wins')
  ) {
    return registryFailure(
      diagnostic(
        'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        '',
        'Registry composition requires own data registries and an explicit conflict policy.',
      ),
    );
  }

  const registryCount = readArrayLength(registriesValue);
  if (registryCount === undefined) {
    return registryFailure(
      diagnostic(
        'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT',
        '',
        'Registry composition input must expose a valid own data length.',
      ),
    );
  }
  const composed = new Map<string, TAdapter>();
  for (let index = 0; index < registryCount; index += 1) {
    const registry = readArrayData(registriesValue, index);
    const snapshot = readRegistrySnapshot<TAdapter>(registry);
    if (!snapshot) {
      return registryFailure(
        diagnostic(
          'INVALID_SCHEMA_EDITOR_PRESENTER_REGISTRY',
          '',
          `Registry at index ${index} was not created by this capsule.`,
        ),
      );
    }
    for (const { id, adapter } of snapshot) {
      if (conflict === 'reject' && composed.has(id)) {
        return registryFailure(
          diagnostic(
            'DUPLICATE_SCHEMA_EDITOR_PRESENTER',
            id,
            `Presenter id "${id}" conflicts during registry composition.`,
          ),
        );
      }
      composed.set(id, adapter);
    }
  }

  return registrySuccess(createOwnedRegistry(composed));
}

function createOwnedRegistry<TAdapter>(
  source: ReadonlyMap<string, TAdapter>,
): SchemaEditorPresenterRegistry<TAdapter> {
  const entries = new Map(source);
  const snapshot = Object.freeze(
    Array.from(entries, ([id, adapter]) => Object.freeze({ id, adapter })),
  );
  return Object.freeze({
    entries: snapshot,
    resolve(id: string): SchemaEditorPresenterResolution<TAdapter> {
      if (typeof id !== 'string' || !entries.has(id)) {
        return Object.freeze({
          ok: false,
          id: typeof id === 'string' ? id : '',
          diagnostic: diagnostic(
            'UNKNOWN_SCHEMA_EDITOR_PRESENTER',
            typeof id === 'string' ? id : '',
            `Presenter id "${typeof id === 'string' ? id : ''}" is not registered.`,
          ),
        });
      }
      return Object.freeze({ ok: true, id, adapter: entries.get(id) as TAdapter });
    },
  });
}

function registrySuccess<TAdapter>(
  registry: SchemaEditorPresenterRegistry<TAdapter>,
): SchemaEditorPresenterRegistryResult<TAdapter> {
  return Object.freeze({ ok: true, registry, diagnostics: EMPTY_DIAGNOSTICS });
}

function registryFailure(
  ...diagnostics: SchemaEditorPresenterRegistryDiagnostic[]
): SchemaEditorPresenterRegistryResult<never> {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze(diagnostics),
  });
}

function diagnostic(
  code: SchemaEditorPresenterRegistryDiagnostic['code'],
  id: string,
  message: string,
): SchemaEditorPresenterRegistryDiagnostic {
  return Object.freeze({ code, id, message });
}

function isOpaqueAdapter(value: unknown): boolean {
  const fields = readRecord(value);
  if (!fields?.has('component')) return false;
  const component = fields.get('component');
  return isObject(component);
}

function readPresenterEntry<TAdapter>(
  value: unknown,
): Readonly<
  | {
      ok: true;
      entry: SchemaEditorPresenterEntry<TAdapter>;
    }
  | {
      ok: false;
      code: SchemaEditorPresenterRegistryDiagnostic['code'];
      id: string;
    }
> {
  const entryRecord = readRecord(value);
  if (!entryRecord) {
    return { ok: false, code: 'INVALID_SCHEMA_EDITOR_PRESENTER_INPUT', id: '' };
  }
  const id = entryRecord.get('id');
  if (typeof id !== 'string' || !PRESENTER_ID.test(id)) {
    return {
      ok: false,
      code: 'INVALID_SCHEMA_EDITOR_PRESENTER_ID',
      id: typeof id === 'string' ? id : '',
    };
  }
  const adapter = entryRecord.get('adapter') as TAdapter;
  if (!isOpaqueAdapter(adapter)) {
    return { ok: false, code: 'INVALID_SCHEMA_EDITOR_PRESENTER_ADAPTER', id };
  }
  return { ok: true, entry: Object.freeze({ id, adapter }) };
}

function readRegistrySnapshot<TAdapter>(
  value: unknown,
): readonly SchemaEditorPresenterEntry<TAdapter>[] | undefined {
  const registryRecord = readRecord(value);
  if (!registryRecord || typeof registryRecord.get('resolve') !== 'function') {
    return undefined;
  }
  const snapshot = registryRecord.get('entries');
  if (!isArraySafely(snapshot) || !isFrozenSafely(snapshot)) {
    return undefined;
  }
  const entryCount = readArrayLength(snapshot);
  if (entryCount === undefined) return undefined;

  const entries: SchemaEditorPresenterEntry<TAdapter>[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const entry = readArrayData(snapshot, index);
    if (!isObject(entry) || !isFrozenSafely(entry)) return undefined;
    const parsed = readPresenterEntry<TAdapter>(entry);
    if (!parsed.ok) return undefined;
    entries.push(parsed.entry);
  }
  return entries;
}

function readArrayData(value: readonly unknown[], index: number): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isArraySafely(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function isFrozenSafely(value: unknown): boolean {
  try {
    return isObject(value) && Object.isFrozen(value);
  } catch {
    return false;
  }
}

function readArrayLength(value: readonly unknown[]): number | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    return descriptor
      && 'value' in descriptor
      && Number.isSafeInteger(descriptor.value)
      && descriptor.value >= 0
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): ReadonlyMap<string, unknown> | undefined {
  if (!isObject(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const fields = new Map<string, unknown>();
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) return undefined;
      fields.set(key, descriptor.value);
    }
    return fields;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
