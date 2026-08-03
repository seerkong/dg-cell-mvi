import type {
  XnlProjectionDiagnostic,
  XnlProjectionPresenterAdapter,
  XnlProjectionPresenterOutput,
  XnlProjectionPresenterRuntimeFacet as XnlProjectionPresenterContractRuntimeFacet,
  XnlProjectionPresenterRuntimeFacetConstructionConfig,
  XnlProjectionPresenterRuntimeFacetConstructionInput,
  XnlProjectionPresenterRuntimeFacetConstructionRuntime,
  XnlProjectionSerializableRecord,
  XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  captureXnlProjectionPresenterProtocolGrants,
  registerOwnedXnlProjectionPresenterFacade,
  registerOwnedXnlProjectionPresenterFacet,
  resolveOwnedXnlProjectionPresenterFacet,
  resolveOwnedXnlProjectionPresenterProtocol,
  wrapOwnedXnlProjectionPresenterMethod,
} from './presenterCapabilityOwnership';
import {
  isStableXnlProjectionId,
  snapshotXnlProjectionSerializableRecord,
} from './presenterData';

const EMPTY_DIAGNOSTICS = Object.freeze([]) as readonly [];
const REGISTRY_SNAPSHOTS = new WeakMap<
  object,
  readonly Readonly<{ id: string; adapter: unknown }>[]
>();

export type XnlProjectionPresenterRegistryRuntime =
  Readonly<Record<string, never>>;

/**
 * Opaque evidence that assembly explicitly selected a Presenter runtime view.
 * It is a capability boundary, not a claim that JavaScript proves effect purity.
 */
export type XnlProjectionPresenterRuntimeFacet<
  TRuntime extends object = Record<string, never>,
> = XnlProjectionPresenterContractRuntimeFacet<TRuntime>;

export type XnlProjectionPresenterRuntime<
  TRuntime extends object = Record<string, never>,
> = XnlProjectionPresenterContractRuntimeFacet<TRuntime>['view'];

export type XnlProjectionRegisteredPresenterRuntime<
  TRuntime extends object = Record<string, never>,
> = XnlProjectionPresenterRuntime<TRuntime>;

export type XnlProjectionRegisteredPresenterOutput =
  XnlProjectionPresenterOutput<XnlProjectionSerializableValue>;

export type XnlProjectionRegisteredPresenterAdapter<
  TRuntime extends object = Record<string, never>,
> =
  XnlProjectionPresenterAdapter<
    XnlProjectionSerializableValue,
    XnlProjectionRegisteredPresenterRuntime<TRuntime>,
    XnlProjectionRegisteredPresenterOutput,
    XnlProjectionSerializableRecord
  >;

export interface XnlProjectionPresenterRegistryEntry<
  TRuntime extends object = Record<string, never>,
> {
  readonly id: string;
  readonly adapter: XnlProjectionRegisteredPresenterAdapter<TRuntime>;
}

export type XnlProjectionPresenterResolution<
  TRuntime extends object = Record<string, never>,
> =
  | Readonly<{
      ok: true;
      id: string;
      adapter: XnlProjectionRegisteredPresenterAdapter<TRuntime>;
    }>
  | Readonly<{
      ok: false;
      id: string;
      diagnostic: XnlProjectionDiagnostic;
    }>;

export interface XnlProjectionPresenterRegistry<
  TRuntime extends object = Record<string, never>,
> {
  readonly entries: readonly XnlProjectionPresenterRegistryEntry<TRuntime>[];
  resolve(id: string): XnlProjectionPresenterResolution<TRuntime>;
}

export type XnlProjectionPresenterRegistryResult<
  TRuntime extends object = Record<string, never>,
> =
  | Readonly<{
      ok: true;
      registry: XnlProjectionPresenterRegistry<TRuntime>;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly XnlProjectionDiagnostic[];
    }>;

export interface CreateXnlProjectionPresenterRegistryInput<
  TRuntime extends object = Record<string, never>,
> {
  readonly adapters: readonly XnlProjectionRegisteredPresenterAdapter<TRuntime>[];
}

export interface CreateXnlProjectionPresenterRegistryConfig {
  readonly duplicate: 'reject';
}

export interface ComposeXnlProjectionPresenterRegistriesInput<
  TRuntime extends object = Record<string, never>,
> {
  readonly registries: readonly XnlProjectionPresenterRegistry<TRuntime>[];
}

export interface ComposeXnlProjectionPresenterRegistriesConfig {
  readonly conflict: 'reject' | 'last-wins';
}

export function createXnlProjectionPresenterRuntimeFacet<
  THost extends object,
  TView extends object,
>(
  runtime: XnlProjectionPresenterRuntimeFacetConstructionRuntime<THost, TView>,
  input: XnlProjectionPresenterRuntimeFacetConstructionInput,
  config: XnlProjectionPresenterRuntimeFacetConstructionConfig,
): XnlProjectionPresenterRuntimeFacet<TView> {
  assertEmptyFacetConstructionRecord(input, 'Presenter runtime facet input');
  assertEmptyFacetConstructionRecord(config, 'Presenter runtime facet config');
  const construction = readFacetConstructionRuntime<THost, TView>(runtime);
  const protocol = resolveOwnedXnlProjectionPresenterProtocol(construction.protocol);
  if (!protocol.ok) {
    throw new TypeError(`${protocol.diagnostic.code}: ${protocol.diagnostic.message}`);
  }
  const capture = captureXnlProjectionPresenterProtocolGrants(
    construction.source,
    construction.protocol,
  );
  if (!capture.ok) {
    throw new TypeError(`${capture.diagnostic.code}: ${capture.diagnostic.message}`);
  }

  const facade = Object.create(null) as Record<PropertyKey, unknown>;
  for (const grant of capture.captures) {
    Object.defineProperty(facade, grant.facadeKey, {
      value: grant.kind === 'method'
        ? wrapOwnedXnlProjectionPresenterMethod(
          grant.value,
          construction.source,
          construction.protocol,
        )
        : grant.value,
      enumerable: true,
    });
  }
  Object.freeze(facade);
  registerOwnedXnlProjectionPresenterFacade(facade, construction.protocol);

  const facet = Object.freeze({
    protocolId: protocol.record.id,
    view: facade,
  });
  registerOwnedXnlProjectionPresenterFacet(
    facet,
    construction.protocol,
    facade,
  );
  return facet as XnlProjectionPresenterRuntimeFacet<TView>;
}

function readFacetConstructionRuntime<THost extends object, TView extends object>(
  value: unknown,
): XnlProjectionPresenterRuntimeFacetConstructionRuntime<THost, TView> {
  const fields = readExactFacetConstructionRecord(
    value,
    ['source', 'protocol'],
    'Presenter runtime facet runtime',
  );
  if (fields.source === null || typeof fields.source !== 'object') {
    throw new TypeError('Presenter runtime facet source must be an object.');
  }
  return fields as unknown as XnlProjectionPresenterRuntimeFacetConstructionRuntime<THost, TView>;
}

function assertEmptyFacetConstructionRecord(value: unknown, label: string): void {
  readExactFacetConstructionRecord(value, [], label);
}

function readExactFacetConstructionRecord<const TKeys extends readonly string[]>(
  value: unknown,
  expectedKeys: TKeys,
  label: string,
): Record<TKeys[number], unknown> {
  try {
    if (value === null || typeof value !== 'object') {
      throw new TypeError(`${label} must be an object.`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      throw new TypeError(`${label} must contain only ${expectedKeys.join(', ')}.`);
    }
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError(`${label}.${key} must be an own data property.`);
      }
      result[key] = descriptor.value;
    }
    return result as Record<TKeys[number], unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TypeError(`${label} could not be inspected: ${message}`);
  }
}

export function isXnlProjectionPresenterRuntimeFacet<
  TRuntime extends object = Record<string, never>,
>(
  value: unknown,
): value is XnlProjectionPresenterRuntimeFacet<TRuntime> {
  return resolveOwnedXnlProjectionPresenterFacet(value) !== undefined;
}

export function createXnlProjectionPresenterRegistry<
  TRuntime extends object = Record<string, never>,
>(
  _runtime: XnlProjectionPresenterRegistryRuntime,
  input: CreateXnlProjectionPresenterRegistryInput<TRuntime>,
  config: CreateXnlProjectionPresenterRegistryConfig,
): XnlProjectionPresenterRegistryResult<TRuntime> {
  if (!Array.isArray(input?.adapters) || config?.duplicate !== 'reject') {
    return registryFailure(registryDiagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_INPUT',
      '',
      'Presenter registry construction requires an adapters array and duplicate policy "reject".',
    ));
  }

  const entries = new Map<string, XnlProjectionRegisteredPresenterAdapter<TRuntime>>();
  for (let index = 0; index < input.adapters.length; index += 1) {
    const adapter = snapshotAdapter(input.adapters[index], index);
    if (!adapter.ok) return registryFailure(adapter.diagnostic);
    if (entries.has(adapter.value.id)) {
      return registryFailure(registryDiagnostic(
        'DUPLICATE_XNL_PROJECTION_PRESENTER',
        adapter.value.id,
        `Presenter id "${adapter.value.id}" is registered more than once.`,
      ));
    }
    entries.set(adapter.value.id, adapter.value);
  }

  return registrySuccess(createOwnedRegistry(entries));
}

export function composeXnlProjectionPresenterRegistries<
  TRuntime extends object = Record<string, never>,
>(
  _runtime: XnlProjectionPresenterRegistryRuntime,
  input: ComposeXnlProjectionPresenterRegistriesInput<TRuntime>,
  config: ComposeXnlProjectionPresenterRegistriesConfig,
): XnlProjectionPresenterRegistryResult<TRuntime> {
  if (
    !Array.isArray(input?.registries)
    || (config?.conflict !== 'reject' && config?.conflict !== 'last-wins')
  ) {
    return registryFailure(registryDiagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_INPUT',
      '',
      'Presenter registry composition requires registries and an explicit conflict policy.',
    ));
  }

  const composed = new Map<string, XnlProjectionRegisteredPresenterAdapter<TRuntime>>();
  for (let index = 0; index < input.registries.length; index += 1) {
    const entries = REGISTRY_SNAPSHOTS.get(input.registries[index] as object) as
      | readonly XnlProjectionPresenterRegistryEntry<TRuntime>[]
      | undefined;
    if (entries === undefined) {
      return registryFailure(registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_REGISTRY',
        '',
        `Presenter registry at layer ${index} was not created by this support capsule.`,
      ));
    }
    for (const entry of entries) {
      if (config.conflict === 'reject' && composed.has(entry.id)) {
        return registryFailure(registryDiagnostic(
          'DUPLICATE_XNL_PROJECTION_PRESENTER',
          entry.id,
          `Presenter id "${entry.id}" conflicts during registry composition.`,
        ));
      }
      composed.set(entry.id, entry.adapter);
    }
  }

  return registrySuccess(createOwnedRegistry(composed));
}

export function isXnlProjectionPresenterRegistry<
  TRuntime extends object = Record<string, never>,
>(
  value: unknown,
): value is XnlProjectionPresenterRegistry<TRuntime> {
  return value !== null
    && typeof value === 'object'
    && REGISTRY_SNAPSHOTS.has(value);
}

function createOwnedRegistry<TRuntime extends object>(
  source: ReadonlyMap<string, XnlProjectionRegisteredPresenterAdapter<TRuntime>>,
): XnlProjectionPresenterRegistry<TRuntime> {
  const entries = Object.freeze(
    Array.from(source, ([id, adapter]) => Object.freeze({ id, adapter })),
  );
  const adapters = new Map(entries.map((entry) => [entry.id, entry.adapter]));
  const registry: XnlProjectionPresenterRegistry<TRuntime> = Object.freeze({
    entries,
    resolve(id: string): XnlProjectionPresenterResolution<TRuntime> {
      if (!isStableXnlProjectionId(id)) {
        return Object.freeze({
          ok: false,
          id: typeof id === 'string' ? id : '',
          diagnostic: registryDiagnostic(
            'INVALID_XNL_PROJECTION_PRESENTER_ID',
            typeof id === 'string' ? id : '',
            'Presenter id must be a stable non-empty string.',
          ),
        });
      }
      const adapter = adapters.get(id);
      if (adapter === undefined) {
        return Object.freeze({
          ok: false,
          id,
          diagnostic: registryDiagnostic(
            'UNKNOWN_XNL_PROJECTION_PRESENTER',
            id,
            `Presenter id "${id}" is not registered.`,
          ),
        });
      }
      return Object.freeze({ ok: true, id, adapter });
    },
  });
  REGISTRY_SNAPSHOTS.set(registry, entries);
  return registry;
}

function snapshotAdapter<TRuntime extends object>(
  value: unknown,
  index: number,
):
  | Readonly<{ ok: true; value: XnlProjectionRegisteredPresenterAdapter<TRuntime> }>
  | Readonly<{ ok: false; diagnostic: XnlProjectionDiagnostic }> {
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_ADAPTER',
        '',
        `Presenter adapter at index ${index} must be a plain code-owned object.`,
      ),
    };
  }
  const allowed = new Set(['id', 'surfaceId', 'present', 'config', 'metadata']);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      return {
        ok: false,
        diagnostic: registryDiagnostic(
          'INVALID_XNL_PROJECTION_PRESENTER_ADAPTER',
          '',
          `Presenter adapter at index ${index} contains unsupported fields.`,
        ),
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      return {
        ok: false,
        diagnostic: registryDiagnostic(
          'INVALID_XNL_PROJECTION_PRESENTER_ADAPTER',
          '',
          `Presenter adapter field "${key}" must be an own data property.`,
        ),
      };
    }
  }

  const id = value.id;
  if (!isStableXnlProjectionId(id)) {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_ID',
        typeof id === 'string' ? id : '',
        `Presenter adapter at index ${index} must have a stable string id.`,
      ),
    };
  }
  const surfaceId = value.surfaceId;
  if (!isStableXnlProjectionId(surfaceId)) {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_SURFACE_ID',
        id,
        `Presenter adapter "${id}" must have a stable surface id.`,
      ),
    };
  }
  if (typeof value.present !== 'function') {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_ADAPTER',
        id,
        `Presenter adapter "${id}" must provide a code-owned present processor.`,
      ),
    };
  }

  const config = value.config === undefined
    ? undefined
    : snapshotXnlProjectionSerializableRecord(
      value.config,
      `presenter adapter "${id}" config`,
    );
  if (config !== undefined && !config.ok) {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_CONFIG',
        id,
        config.message,
      ),
    };
  }
  const metadata = value.metadata === undefined
    ? undefined
    : snapshotXnlProjectionSerializableRecord(
      value.metadata,
      `presenter adapter "${id}" metadata`,
    );
  if (metadata !== undefined && !metadata.ok) {
    return {
      ok: false,
      diagnostic: registryDiagnostic(
        'INVALID_XNL_PROJECTION_PRESENTER_METADATA',
        id,
        metadata.message,
      ),
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      id,
      surfaceId,
      present: value.present as XnlProjectionRegisteredPresenterAdapter<TRuntime>['present'],
      ...(config?.ok ? { config: config.value } : {}),
      ...(metadata?.ok ? { metadata: metadata.value } : {}),
    }),
  };
}

function registrySuccess<TRuntime extends object>(
  registry: XnlProjectionPresenterRegistry<TRuntime>,
): XnlProjectionPresenterRegistryResult<TRuntime> {
  return Object.freeze({
    ok: true,
    registry,
    diagnostics: EMPTY_DIAGNOSTICS,
  });
}

function registryFailure<TRuntime extends object = Record<string, never>>(
  ...diagnostics: readonly XnlProjectionDiagnostic[]
): XnlProjectionPresenterRegistryResult<TRuntime> {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function registryDiagnostic(
  code: string,
  presenterId: string,
  message: string,
): XnlProjectionDiagnostic {
  return Object.freeze({
    severity: 'error',
    code,
    message,
    details: Object.freeze({ presenterId }),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
