/**
 * dg-cell-mvi-crud · support/dictEffects — the loadDict effect handler (impure boundary).
 *
 * The reducer's `loadDict` branch emits `loadDictEffect({dictId,value})`; this handler resolves the
 * dict's authoring config from the normalized columns, delegates the actual IO (with single-flight +
 * cache) to the injected `DictRegistry`, and re-dispatches `dictLoaded` / `dictLoadFailed`. Parallel
 * in spirit to `support/requestEffects.ts` (which owns the page/CRUD request fns): all dict IO funnels
 * here so the state slice stays pure data.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import { dictLoaded, dictLoadFailed } from '../contract/events';
import {
  LEGACY_URL_DICT_PROVIDER,
  type DictCachePolicy,
  type DictDefinition,
  type DictLoadIntent,
  type DictRequestCorrelation,
} from '../contract/dict';
import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';
import type { DictConfig, DictRegistry } from './dictRegistry';
import {
  createDictProviderRuntime,
  type DictProviderRuntime,
} from './dictProviderRuntime';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CreateDictEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  dicts: DictRegistry;
  /** Composition-root provider runtime. Omitted registrations preserve legacy-only behavior. */
  providers?: DictProviderRuntime;
}

/**
 * Resolve a dict's authoring config by its dictId. Keys follow the fan-out convention from the design
 * (cell dict = `<col>`, form-item dict = `<col>:form`, async-compute = `<col>:async`): strip any
 * known suffix and look the column up in `columnsMap`. A directly-registered config (config.raw.dicts)
 * is honored first so app-level shared/singleton dicts can be keyed independently of any column.
 */
function resolveDictConfig<R>(
  config: NormalizedCrudOptions<R>,
  dictId: string,
): DictConfig | undefined {
  const registry = (config.raw as any)?.dicts as Record<string, DictConfig> | undefined;
  if (registry && registry[dictId]) {
    return registry[dictId];
  }
  const base = dictId.replace(/:(form|search|async)$/, '');
  const col = config.columnsMap[base];
  return (col?.dict as DictConfig) || undefined;
}

type CompatibleDictConfig = Omit<DictConfig, 'cache'> & {
  source?: DictDefinition['source'];
  fields?: DictDefinition['fields'];
  cache?: boolean | DictCachePolicy;
};

/**
 * Translate reducer-safe legacy definitions back into the existing DictRegistry authoring shape.
 * This adapter deliberately reuses DictRegistry's established request/getData/getNodesByValues
 * implementation instead of introducing a second transport path.
 */
function toLegacyRegistryConfig(
  config: CompatibleDictConfig | undefined,
): DictConfig | undefined {
  if (!config?.source) return config as DictConfig | undefined;
  const { source, fields } = config;
  if (source.kind === 'inline') {
    return {
      data: source.nodes,
      value: 'value',
      label: 'label',
      children: 'children',
      cache:
        typeof config.cache === 'object'
          ? config.cache.mode !== 'none'
          : config.cache,
    };
  }
  if (
    source.providerId === LEGACY_URL_DICT_PROVIDER &&
    typeof source.config?.url === 'string'
  ) {
    return {
      url: source.config.url,
      value: fields?.value,
      label: fields?.label,
      children: fields?.children,
      color: fields?.color,
      cache:
        typeof config.cache === 'object'
          ? config.cache.mode !== 'none'
          : config.cache,
    };
  }
  return undefined;
}

function isLegacyProvider(
  intent: DictLoadIntent,
  config: CompatibleDictConfig | undefined,
): boolean {
  if (intent.providerId === `legacy:${intent.dictId}`) return true;
  return (
    intent.providerId === LEGACY_URL_DICT_PROVIDER &&
    config?.source?.kind === 'provider' &&
    config.source.providerId === LEGACY_URL_DICT_PROVIDER
  );
}

export function createDictEffects<R = any>(
  opts: CreateDictEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config, dicts } = opts;
  const providers = opts.providers ?? createDictProviderRuntime();

  const loadDict: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const intent = req.payload as DictLoadIntent;
    const { dictId } = intent;
    const correlation: DictRequestCorrelation = {
      dictId,
      scope: intent.scope,
      mode: intent.mode,
      requestId: intent.requestId,
      generation: intent.generation,
      cacheKey: intent.cacheKey,
    };
    const dictConfig = resolveDictConfig(config, dictId) as
      | CompatibleDictConfig
      | undefined;
    try {
      let data: readonly unknown[];
      // An exact composition-root registration always wins, including over the compatibility id.
      if (providers.has(intent.providerId)) {
        data =
          intent.mode === 'hydrate'
            ? await providers.loadByValues(intent)
            : await providers.load(intent);
      } else if (isLegacyProvider(intent, dictConfig)) {
        const legacyConfig = toLegacyRegistryConfig(dictConfig);
        if (!legacyConfig) {
          // Delegate to the runtime to produce one consistent, safely-normalized missing-provider
          // failure instead of leaving the dictionary stuck in loading.
          data = await providers.load(intent);
        } else {
          data = await dicts.load(dictId, legacyConfig, {
            ...intent.context,
            scope: intent.scope,
            mode: intent.mode,
            query: intent.query,
            value: intent.mode === 'hydrate' ? intent.values : undefined,
            reload: intent.refresh,
            requestId: intent.requestId,
            generation: intent.generation,
            cacheKey: intent.cacheKey,
          });
        }
      } else {
        data =
          intent.mode === 'hydrate'
            ? await providers.loadByValues(intent)
            : await providers.load(intent);
      }
      // onReady: a side-effecting user callback fired once the data
      // is available. It runs HERE (the effect boundary), NOT in a reducer. The reducer collapses a
      // redundant loadDict for an already-loaded dict (so onReady fires once per actual load); a
      // thrown callback is swallowed so it can't break the dictLoaded feedback.
      if (typeof dictConfig?.onReady === 'function') {
        try {
          dictConfig.onReady({
            dict: dictConfig as DictConfig,
            data: data as any[],
          });
        } catch {
          /* user callback threw — ignore (dict data still lands in state). */
        }
      }
      return dictLoaded({ ...correlation, nodes: data as any[] });
    } catch (err) {
      return dictLoadFailed({ ...correlation, error: normalizeError(err) });
    }
  };

  const invalidateDict: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { dictId, scope, cacheKey } = req.payload as {
      dictId: string;
      scope: string;
      cacheKey?: string;
    };
    dicts.invalidate(dictId);
    providers.invalidate({ dictId, scope, cacheKey });
  };

  return {
    [CRUD_EFFECT.loadDict]: loadDict,
    [CRUD_EFFECT.invalidateDict]: invalidateDict,
  };
}
