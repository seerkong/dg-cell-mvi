/**
 * Effect-side dictionary provider registry and dispatcher.
 *
 * The runtime owns provider instances at the composition root. Reducers and adapters carry only the
 * serializable provider id in DictLoadIntent; URL construction, authentication, transport choice,
 * and response conversion remain private to each registered provider.
 */
import type {
  DictCachePolicy,
  DictLoadIntent,
  DictNode,
  DictProvider,
  DictProviderId,
} from '../contract/dict';

export type DictProviderRegistrations = Readonly<
  Record<DictProviderId, DictProvider>
>;

export interface DictProviderRuntimeOptions {
  /** Test seam for deterministic TTL checks. */
  now?: () => number;
}

export interface DictCacheInvalidation {
  dictId: string;
  scope: string;
  cacheKey?: string;
}

export interface DictProviderRuntime {
  has(providerId: DictProviderId): boolean;
  load(intent: DictLoadIntent): Promise<readonly DictNode[]>;
  loadByValues(intent: DictLoadIntent): Promise<readonly DictNode[]>;
  invalidate(request: DictCacheInvalidation): void;
  clear(): void;
}

export class DictProviderNotFoundError extends Error {
  constructor(providerId: DictProviderId) {
    super(`Dictionary provider "${providerId}" is not registered.`);
    this.name = 'DictProviderNotFoundError';
  }
}

export class DictProviderOperationNotSupportedError extends Error {
  constructor(providerId: DictProviderId, operation: 'load' | 'loadByValues') {
    super(
      `Dictionary provider "${providerId}" does not implement ${operation}.`,
    );
    this.name = 'DictProviderOperationNotSupportedError';
  }
}

/**
 * Build one immutable registry-backed runtime. Registration is explicit and local to the caller;
 * provider instances never enter reducer state or serializable declarations.
 */
export function createDictProviderRuntime(
  registrations: DictProviderRegistrations = {},
  options: DictProviderRuntimeOptions = {},
): DictProviderRuntime {
  const providers = new Map<DictProviderId, DictProvider>(
    Object.entries(registrations),
  );
  const now = options.now ?? Date.now;

  interface CacheEntry {
    nodes: readonly DictNode[];
    expiresAt: number | null;
    dictId: string;
    scope: string;
    policyMode: DictCachePolicy['mode'];
  }

  interface InFlightEntry {
    promise: Promise<readonly DictNode[]>;
    cacheKey: string;
    dictId: string;
    scope: string;
    policyMode: DictCachePolicy['mode'];
  }

  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, InFlightEntry>();
  const epochs = new Map<string, number>();

  function requireProvider(providerId: DictProviderId): DictProvider {
    const provider = providers.get(providerId);
    if (!provider) throw new DictProviderNotFoundError(providerId);
    return provider;
  }

  function cachePolicy(intent: DictLoadIntent): DictCachePolicy {
    return intent.cache ?? { mode: 'none' };
  }

  function currentEpoch(cacheKey: string): number {
    return epochs.get(cacheKey) ?? 0;
  }

  function advanceEpoch(cacheKey: string): number {
    const next = currentEpoch(cacheKey) + 1;
    epochs.set(cacheKey, next);
    return next;
  }

  function cachedNodes(
    cacheKey: string,
    policy: DictCachePolicy,
  ): readonly DictNode[] | undefined {
    if (policy.mode === 'none') return undefined;
    const entry = cache.get(cacheKey);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && now() >= entry.expiresAt) {
      cache.delete(cacheKey);
      return undefined;
    }
    return entry.nodes;
  }

  function expiry(policy: DictCachePolicy): number | null {
    if (policy.mode === 'none' || policy.ttlMs === undefined) return null;
    return now() + Math.max(0, policy.ttlMs);
  }

  function execute(
    intent: DictLoadIntent,
    operation: 'load' | 'loadByValues',
  ): Promise<readonly DictNode[]> {
    const policy = cachePolicy(intent);
    const cacheKey = intent.cacheKey;
    if (!intent.refresh) {
      const hit = cachedNodes(cacheKey, policy);
      if (hit !== undefined) return Promise.resolve(hit);
      const pending = inFlight.get(cacheKey);
      if (pending) return pending.promise;
    } else {
      // A refresh is a new request lane. Detach an older ordinary request so neither its result nor
      // its failure can be reused by an ordinary request that starts after this refresh.
      inFlight.delete(cacheKey);
    }

    const lane = intent.refresh
      ? `${cacheKey}\u0000refresh:${intent.requestId}`
      : cacheKey;
    const requestEpoch = advanceEpoch(cacheKey);
    const provider = requireProvider(intent.providerId);
    let providerPromise: Promise<readonly DictNode[]>;
    try {
      if (operation === 'load') {
        providerPromise = provider.load(intent);
      } else if (provider.loadByValues) {
        providerPromise = provider.loadByValues(intent);
      } else {
        throw new DictProviderOperationNotSupportedError(
          intent.providerId,
          'loadByValues',
        );
      }
    } catch (error) {
      providerPromise = Promise.reject(error);
    }

    let record!: InFlightEntry;
    const promise = Promise.resolve(providerPromise)
      .then((nodes) => {
        if (
          policy.mode !== 'none' &&
          currentEpoch(cacheKey) === requestEpoch
        ) {
          cache.set(cacheKey, {
            nodes,
            expiresAt: expiry(policy),
            dictId: intent.dictId,
            scope: intent.scope,
            policyMode: policy.mode,
          });
        }
        return nodes;
      })
      .finally(() => {
        if (inFlight.get(lane) === record) inFlight.delete(lane);
      });
    record = {
      promise,
      cacheKey,
      dictId: intent.dictId,
      scope: intent.scope,
      policyMode: policy.mode,
    };
    inFlight.set(lane, record);
    return promise;
  }

  function matchesInvalidation(
    request: DictCacheInvalidation,
    entry: Pick<CacheEntry, 'dictId' | 'scope' | 'policyMode'>,
  ): boolean {
    return (
      entry.dictId === request.dictId &&
      (entry.policyMode === 'shared' || entry.scope === request.scope)
    );
  }

  function invalidate(request: DictCacheInvalidation): void {
    const affectedKeys = new Set<string>();
    if (request.cacheKey) affectedKeys.add(request.cacheKey);

    for (const [key, entry] of cache) {
      if (
        request.cacheKey
          ? key === request.cacheKey
          : matchesInvalidation(request, entry)
      ) {
        affectedKeys.add(key);
      }
    }
    for (const entry of inFlight.values()) {
      if (
        request.cacheKey
          ? entry.cacheKey === request.cacheKey
          : matchesInvalidation(request, entry)
      ) {
        affectedKeys.add(entry.cacheKey);
      }
    }

    for (const key of affectedKeys) {
      advanceEpoch(key);
      cache.delete(key);
    }
    for (const [lane, entry] of inFlight) {
      if (affectedKeys.has(entry.cacheKey)) inFlight.delete(lane);
    }
  }

  function clear(): void {
    const affectedKeys = new Set<string>(cache.keys());
    for (const entry of inFlight.values()) affectedKeys.add(entry.cacheKey);
    for (const key of affectedKeys) advanceEpoch(key);
    cache.clear();
    inFlight.clear();
  }

  return {
    has: (providerId) => providers.has(providerId),
    load: (intent) => execute(intent, 'load'),
    loadByValues: (intent) => execute(intent, 'loadByValues'),
    invalidate,
    clear,
  };
}
