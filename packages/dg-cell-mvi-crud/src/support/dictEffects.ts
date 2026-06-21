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
import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';
import type { DictConfig, DictRegistry } from './dictRegistry';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CreateDictEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  dicts: DictRegistry;
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

export function createDictEffects<R = any>(
  opts: CreateDictEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config, dicts } = opts;

  const loadDict: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { dictId, value } = req.payload as { dictId: string; value?: any };
    const dictConfig = resolveDictConfig(config, dictId);
    if (!dictConfig) {
      // nothing to load for this id — report empty so the slice leaves "loading".
      return dictLoaded({ dictId, data: [] });
    }
    try {
      const data = await dicts.load(dictId, dictConfig, { value });
      // onReady: a side-effecting user callback fired once the data
      // is available. It runs HERE (the effect boundary), NOT in a reducer. The reducer collapses a
      // redundant loadDict for an already-loaded dict (so onReady fires once per actual load); a
      // thrown callback is swallowed so it can't break the dictLoaded feedback.
      if (typeof dictConfig.onReady === 'function') {
        try {
          dictConfig.onReady({ dict: dictConfig, data });
        } catch {
          /* user callback threw — ignore (dict data still lands in state). */
        }
      }
      return dictLoaded({ dictId, data });
    } catch (err) {
      return dictLoadFailed({ dictId, error: normalizeError(err) });
    }
  };

  return {
    [CRUD_EFFECT.loadDict]: loadDict,
  };
}
