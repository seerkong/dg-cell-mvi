/**
 * Serializable dictionary declarations and the narrow provider effect contract.
 *
 * Definitions, bindings, and load intents are reducer-safe data. Provider implementations are
 * deliberately separate runtime dependencies: a definition carries only a stable provider id.
 */

export type DictSerializablePrimitive = string | number | boolean | null;
export type DictSerializableValue =
  | DictSerializablePrimitive
  | DictSerializableValue[]
  | { [key: string]: DictSerializableValue };
export type DictSerializableRecord = { [key: string]: DictSerializableValue };

export interface DictNode<TValue extends DictSerializableValue = DictSerializableValue> {
  value: TValue;
  label: string;
  children?: DictNode<TValue>[];
  disabled?: boolean;
  color?: string;
  /** Original serializable node retained by legacy-data normalization. */
  raw?: DictSerializableRecord;
}

export interface DictNodeFields {
  value: string;
  label: string;
  children: string;
  disabled?: string;
  color?: string;
}

export type DictCachePolicy =
  | { mode: 'none' }
  | { mode: 'scope'; ttlMs?: number }
  | { mode: 'shared'; ttlMs?: number };

export type DictProviderId = string;

export interface DictInlineSource {
  kind: 'inline';
  nodes: DictNode[];
}

export interface DictProviderSource {
  kind: 'provider';
  providerId: DictProviderId;
  /** Serializable provider-owned data; URL/auth/response logic remains in the provider runtime. */
  config?: DictSerializableRecord;
  capabilities?: {
    hydrate?: boolean;
    search?: boolean;
  };
}

export type DictSource = DictInlineSource | DictProviderSource;

export type DictBindingTrigger =
  | 'eager'
  | 'open'
  | 'context-change'
  | 'value-missing'
  | 'search';

export type DictContextSource = 'form' | 'search' | 'row' | 'list' | 'tenant' | 'context';

export interface DictContextRef {
  from: DictContextSource;
  path: string;
  default?: DictSerializableValue;
}

export type DictBindingParam = DictSerializableValue | DictContextRef;

export interface DictBinding {
  /** Stable state partition used for caching and request correlation. */
  scope: string;
  dependencies?: string[];
  /** Declarative state-to-context projection. No callback is accepted here. */
  params?: Record<string, DictBindingParam>;
  triggers?: DictBindingTrigger[];
  /** UI command-bridge debounce for remote search. Defaults to 300ms. */
  searchDebounceMs?: number;
}

export interface DictDefinition {
  id: string;
  source: DictSource;
  fields?: DictNodeFields;
  cache?: DictCachePolicy;
  binding?: DictBinding;
}

export type DictLoadMode = 'load' | 'hydrate' | 'search';

export interface DictLoadIntent extends Record<string, unknown> {
  dictId: string;
  providerId: DictProviderId;
  scope: string;
  mode: DictLoadMode;
  context: DictSerializableRecord;
  values?: DictSerializableValue[];
  query?: string;
  /** Reducer-normalized cache behavior consumed only at the effect/runtime boundary. */
  cache: DictCachePolicy;
  refresh: boolean;
  requestId: string;
  generation: number;
  cacheKey: string;
}

/** Fields copied unchanged from an intent onto its success/failure feedback event. */
export type DictRequestCorrelation = Pick<
  DictLoadIntent,
  'dictId' | 'scope' | 'mode' | 'requestId' | 'generation' | 'cacheKey'
>;

/**
 * Effect-side provider dependency. These methods are never embedded in DictDefinition or
 * DictLoadIntent and therefore never enter reducer input.
 */
export interface DictProvider {
  load(intent: DictLoadIntent): Promise<readonly DictNode[]>;
  loadByValues?(intent: DictLoadIntent): Promise<readonly DictNode[]>;
}

export const LEGACY_URL_DICT_PROVIDER: DictProviderId = 'crud.legacy-url';

export interface LegacySerializableDictConfig {
  data?: DictSerializableRecord[];
  url?: string;
  value?: string;
  label?: string;
  children?: string;
  disabled?: string;
  color?: string;
  cache?: boolean;
}

function legacyFields(config: LegacySerializableDictConfig): DictNodeFields {
  return {
    value: config.value ?? 'value',
    label: config.label ?? 'label',
    children: config.children ?? 'children',
    ...(config.disabled ? { disabled: config.disabled } : {}),
    ...(config.color ? { color: config.color } : {}),
  };
}

function mapLegacyNode(node: DictSerializableRecord, fields: DictNodeFields): DictNode {
  const rawChildren = node[fields.children];
  const rawDisabled = fields.disabled ? node[fields.disabled] : undefined;
  const rawColor = fields.color ? node[fields.color] : undefined;
  const mapped: DictNode = {
    value: node[fields.value] ?? null,
    label: String(node[fields.label] ?? ''),
    raw: node,
  };

  if (Array.isArray(rawChildren)) {
    const childRecords = rawChildren.filter(
      (child): child is DictSerializableRecord =>
        child !== null && typeof child === 'object' && !Array.isArray(child),
    );
    mapped.children = childRecords.map((child) => mapLegacyNode(child, fields));
  }
  if (typeof rawDisabled === 'boolean') mapped.disabled = rawDisabled;
  if (typeof rawColor === 'string') mapped.color = rawColor;
  return mapped;
}

/**
 * Maps the two reducer-safe legacy entry points. Static data becomes normalized inline nodes; a
 * fixed URL becomes provider configuration for the registered compatibility provider. Dynamic URL
 * functions and loader callbacks intentionally have no place in this input type.
 */
export function mapLegacyDictConfig(
  dictId: string,
  config: LegacySerializableDictConfig,
): DictDefinition {
  const fields = legacyFields(config);
  const cache: DictCachePolicy =
    config.cache === false ? { mode: 'none' } : { mode: 'shared' };

  if (config.data !== undefined) {
    return {
      id: dictId,
      source: {
        kind: 'inline',
        nodes: config.data.map((node) => mapLegacyNode(node, fields)),
      },
      fields,
      cache,
    };
  }

  if (typeof config.url === 'string') {
    return {
      id: dictId,
      source: {
        kind: 'provider',
        providerId: LEGACY_URL_DICT_PROVIDER,
        config: { url: config.url },
      },
      fields,
      cache,
    };
  }

  throw new TypeError(`Legacy dictionary "${dictId}" requires serializable data or a fixed URL.`);
}
