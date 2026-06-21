/**
 * dg-cell-mvi-crud · logic/reducers/dict — the pure dict slice fold.
 *
 * Composed into reduceCrud by the orchestrator. Owns the three dict events:
 *   loadDict      — mark `dict[dictId].status='loading'` (noop if already loaded & !reload) + emit
 *                   `loadDictEffect` (IO happens in support/dictEffects.ts).
 *   dictLoaded    — store data + a value->node `dataMap` (pure port of Dict.toMap/buildMap, recursing
 *                   children when the dict is a tree).
 *   dictLoadFailed— mark `status='error'`.
 * Never does IO, never mutates inputs (immutable `{ ...state, dict: { ...state.dict, [id]: … } }`).
 */
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import { loadDictEffect } from '../../contract/effects';
import type { CrudState, DictEntry } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';
import type { DictConfig } from '../../support/dictRegistry';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

/** Resolve a dict's authoring config by dictId (same convention as support/dictEffects). */
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

/** Port of Dict.toMap/buildMap: value -> node map, recursing children when isTree. */
function buildMap(data: any[], dictConfig?: DictConfig): Record<string, any> {
  const valueField = dictConfig?.value ?? 'value';
  const childrenField = dictConfig?.children ?? 'children';
  const isTree = dictConfig?.isTree === true;
  const map: Record<string, any> = {};
  const walk = (list: any[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (item == null) continue;
      map[item[valueField]] = item;
      if (isTree && item[childrenField]) {
        walk(item[childrenField]);
      }
    }
  };
  walk(data || []);
  return map;
}

function setDict<R>(state: CrudState<R>, dictId: string, entry: DictEntry): CrudState<R> {
  return { ...state, dict: { ...state.dict, [dictId]: entry } };
}

export function reduceDict<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;

  switch (event.type) {
    case CRUD_EVENT.loadDict: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      // already loaded and not a forced reload — noop (collapses redundant loads).
      if (existing && existing.status === 'loaded' && !p.reload) {
        return ok(state);
      }
      const next = setDict(state, dictId, {
        status: 'loading',
        data: existing?.data ?? [],
        dataMap: existing?.dataMap ?? {},
        error: null,
      });
      return { state: next, effects: [loadDictEffect({ dictId, value: p.value })] };
    }

    case CRUD_EVENT.dictLoaded: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const data: any[] = Array.isArray(p.data) ? p.data : [];
      const dictConfig = resolveDictConfig(config, dictId);
      return ok(
        setDict(state, dictId, {
          status: 'loaded',
          data,
          dataMap: buildMap(data, dictConfig),
          error: null,
        }),
      );
    }

    case CRUD_EVENT.dictLoadFailed: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      return ok(
        setDict(state, dictId, {
          status: 'error',
          data: existing?.data ?? [],
          dataMap: existing?.dataMap ?? {},
          error: String(p.error ?? ''),
        }),
      );
    }

    default:
      return ok(state);
  }
}
