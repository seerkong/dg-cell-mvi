/**
 * dg-cell-mvi-crud · support/dictRegistry — the dict IO boundary (effect-side, never in state).
 *
 * Port of the loading half of the reference crud's `Dict` (use-dict-define.ts): the three load strategies
 * (static `data` / remote `url`+`getData`+global `dictRequest` / value-driven `getNodesByValues`)
 * collapse into `load(dictId, dictConfig, context)`. IO dedup that the reference crud spread across `loading`
 * flags + `LRUCache` lives here instead: an in-flight `Map<key, Promise>` collapses concurrent loads
 * and a plain `Map` caches resolved arrays keyed by dictId/url. `dataMap` (value->node) is NOT built
 * here — that is a pure fold in the reducer (port of `Dict.toMap`). Keep state out of this module.
 */

/** The global fallback fetcher (the reference crud's `app.use(the reference crud,{ dictRequest })`). */
export type DictRequest = (ctx: { url: string; dict: DictConfig }) => Promise<any[]>;

/** Context handed to a dict `onReady` callback. */
export interface DictOnReadyContext {
  /** the dict config the data was loaded for. */
  dict: DictConfig;
  /** the resolved dict data array. */
  data: any[];
  [k: string]: any;
}

/** Authoring shape of a dict (subset of the reference crud DictOptions the demo needs). */
export interface DictConfig<T = any> {
  url?: string | ((ctx?: any) => string);
  getData?: (ctx?: any) => Promise<T[]>;
  getNodesByValues?: (values: any[], ctx?: any) => Promise<T[]>;
  data?: T[];
  value?: string;
  label?: string;
  children?: string;
  color?: string;
  isTree?: boolean;
  /** whether resolved data is cached across loads (default true) — port of Dict.cache */
  cache?: boolean;
  /**
   * Custom display-label builder. When set, a
   * dict item resolves to `labelBuilder(item)` instead of `item[label]` — both in cells and form
   * selects. Additive: no labelBuilder → the plain `item[label]` (identical to before).
   */
  labelBuilder?: (item: T) => string;
  /**
   * Fired once after the dict's data is loaded/ready. Invoked at
   * the dict-loading EFFECT boundary (a side-effecting user callback — never in a reducer) with
   * `{ dict, data }`. Fires once per load (static + getData/url dicts alike).
   */
  onReady?: (ctx: DictOnReadyContext) => void;
  [k: string]: any;
}

/** Per-load context (scope + value for value-driven dicts + reload flag). */
export interface DictLoadContext {
  value?: any;
  reload?: boolean;
  [k: string]: any;
}

export interface DictRegistry {
  load(dictId: string, dictConfig: DictConfig, context?: DictLoadContext): Promise<any[]>;
  /** drop a cached entry (e.g. on explicit reload of a singleton dict) */
  invalidate(dictId: string): void;
  clear(): void;
}

export interface CreateDictRegistryOptions {
  /** global fallback used when a dict has a `url` but no `getData` */
  dictRequest?: DictRequest;
}

function resolveUrl(dictConfig: DictConfig, context: DictLoadContext): string | undefined {
  const { url } = dictConfig;
  if (typeof url === 'function') {
    return url({ ...context, dict: dictConfig });
  }
  return url;
}

/** Cache key: prefer the resolved url (shared across dict instances) else the dictId. */
function cacheKeyFor(dictId: string, dictConfig: DictConfig, context: DictLoadContext): string {
  const url = resolveUrl(dictConfig, context);
  return url ? `url:${url}` : `id:${dictId}`;
}

export function createDictRegistry(options: CreateDictRegistryOptions = {}): DictRegistry {
  const { dictRequest } = options;
  const inFlight = new Map<string, Promise<any[]>>();
  const cache = new Map<string, any[]>();

  function ensureArray(data: any): any[] {
    return Array.isArray(data) ? data : [];
  }

  /** the actual one-time fetch for url/getData/global dictRequest strategies (no value-driven). */
  async function fetchRemote(dictConfig: DictConfig, context: DictLoadContext): Promise<any[]> {
    const url = resolveUrl(dictConfig, context);
    if (typeof dictConfig.getData === 'function') {
      const data = await dictConfig.getData({ url, dict: dictConfig, ...context });
      return ensureArray(data);
    }
    if (url) {
      if (!dictRequest) {
        // faithful to the reference crud's warning: a url dict needs a global dictRequest configured.
        return [];
      }
      const data = await dictRequest({ url, dict: dictConfig });
      return ensureArray(data);
    }
    return [];
  }

  async function load(
    dictId: string,
    dictConfig: DictConfig,
    context: DictLoadContext = {},
  ): Promise<any[]> {
    if (!dictConfig) {
      return [];
    }

    // 1) value-driven: resolve nodes for the given value(s); cache per dictId+value.
    if (typeof dictConfig.getNodesByValues === 'function') {
      const raw = context.value;
      if (raw == null) {
        return [];
      }
      const values = Array.isArray(raw) ? raw : [raw];
      const vKey = `${cacheKeyFor(dictId, dictConfig, context)}::${JSON.stringify(values)}`;
      const useCache = dictConfig.cache !== false;
      if (useCache && !context.reload && cache.has(vKey)) {
        return cache.get(vKey)!;
      }
      let pending = inFlight.get(vKey);
      if (!pending) {
        pending = (async () => {
          const data = ensureArray(await dictConfig.getNodesByValues!(values, context));
          if (useCache) cache.set(vKey, data);
          return data;
        })().finally(() => inFlight.delete(vKey));
        inFlight.set(vKey, pending);
      }
      return pending;
    }

    // 2) static data: immediate, no IO.
    if (dictConfig.data != null) {
      return ensureArray(dictConfig.data);
    }

    // 3) remote (url / getData / global dictRequest) — single-flight + cache by url/dictId.
    const key = cacheKeyFor(dictId, dictConfig, context);
    const useCache = dictConfig.cache !== false;
    if (useCache && !context.reload && cache.has(key)) {
      return cache.get(key)!;
    }
    let pending = inFlight.get(key);
    if (!pending) {
      pending = fetchRemote(dictConfig, context)
        .then((data) => {
          if (useCache) cache.set(key, data);
          return data;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return pending;
  }

  function invalidate(dictId: string): void {
    for (const k of Array.from(cache.keys())) {
      if (k === `id:${dictId}` || k.startsWith(`id:${dictId}::`)) {
        cache.delete(k);
      }
    }
  }

  function clear(): void {
    cache.clear();
    inFlight.clear();
  }

  return { load, invalidate, clear };
}

/**
 * A process-wide shared dict registry. Using one registry across every crud store is what makes a
 * `shared` dict (a `url`/`getData` dict referenced from many pages) load once and be reused on later
 * navigations — the registry's single-flight + cache spans store lifetimes. Static-`data` dicts are
 * unaffected (they never hit the cache). `dictRequest` is bound on first creation.
 */
let sharedRegistry: DictRegistry | null = null;
export function getSharedDictRegistry(options: CreateDictRegistryOptions = {}): DictRegistry {
  if (!sharedRegistry) {
    sharedRegistry = createDictRegistry(options);
  }
  return sharedRegistry;
}
/** Drop the process-wide registry (test isolation / hot reload). */
export function resetSharedDictRegistry(): void {
  sharedRegistry = null;
}
