/**
 * dg-cell-mvi-crud · logic/reducers/dict — the pure dict slice fold.
 *
 * Composed into reduceCrud by the orchestrator. Commands become complete DictLoadIntent effects;
 * correlated success/failure events fold only while their request is still current.
 * Never does IO, never mutates inputs (immutable `{ ...state, dict: { ...state.dict, [id]: … } }`).
 */
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import { invalidateDictEffect, loadDictEffect } from '../../contract/effects';
import type {
  DictCachePolicy,
  DictLoadIntent,
  DictLoadMode,
  DictSerializableRecord,
  DictSerializableValue,
} from '../../contract/dict';
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
      const value =
        Object.prototype.hasOwnProperty.call(item, valueField)
          ? item[valueField]
          : item.value;
      map[String(value)] = item;
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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function makeCacheKey(input: {
  dictId: string;
  providerId: string;
  scope?: string;
  cacheMode: DictCachePolicy['mode'];
  mode: DictLoadMode;
  context: DictSerializableRecord;
  values?: DictSerializableValue[];
  query?: string;
}): string {
  return JSON.stringify(stableValue(input));
}

function cachePolicyFor(
  dictConfig:
    | (Omit<DictConfig, 'cache'> & { cache?: boolean | DictCachePolicy })
    | undefined,
): DictCachePolicy {
  const configured = dictConfig?.cache;
  if (
    configured &&
    typeof configured === 'object' &&
    (configured.mode === 'none' ||
      configured.mode === 'scope' ||
      configured.mode === 'shared')
  ) {
    return configured;
  }
  if (configured === true) return { mode: 'shared' };
  return { mode: 'none' };
}

function commandMode(type: string, payload: Record<string, any>): DictLoadMode {
  if (type === CRUD_EVENT.hydrateDict || payload.value !== undefined) return 'hydrate';
  if (type === CRUD_EVENT.searchDict) return 'search';
  return 'load';
}

function commandValues(payload: Record<string, any>): DictSerializableValue[] {
  if (Array.isArray(payload.values)) return payload.values;
  if (Array.isArray(payload.value)) return payload.value;
  if (payload.value === undefined) return [];
  return [payload.value];
}

function resultNodes(payload: Record<string, any>): any[] {
  if (Array.isArray(payload.nodes)) return payload.nodes;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function requestMatches(entry: DictEntry | undefined, payload: Record<string, any>): boolean {
  const active = entry?.activeRequest;
  return Boolean(
    active &&
      payload.requestId === active.requestId &&
      payload.generation === active.generation &&
      payload.scope === active.scope &&
      payload.mode === active.mode &&
      payload.cacheKey === active.cacheKey,
  );
}

function entryWithAliases(base: Omit<DictEntry, 'data' | 'dataMap'>): DictEntry {
  return {
    ...base,
    data: base.visibleNodes,
    dataMap: base.knownByValue,
  };
}

export function reduceDict<R = any>(
  state: CrudState<R>,
  event: AppEvent<any>,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;

  switch (event.type) {
    case CRUD_EVENT.loadDict:
    case CRUD_EVENT.refreshDict:
    case CRUD_EVENT.hydrateDict:
    case CRUD_EVENT.searchDict: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      const dictConfig = resolveDictConfig(config, dictId) as
        | (Omit<DictConfig, 'cache'> & {
            cache?: boolean | DictCachePolicy;
            providerId?: string;
            source?: { providerId?: string };
          })
        | undefined;
      const providerId =
        p.providerId ??
        dictConfig?.providerId ??
        dictConfig?.source?.providerId ??
        `legacy:${dictId}`;
      const scope = typeof p.scope === 'string' && p.scope ? p.scope : 'default';
      const mode = commandMode(event.type, p);
      const context =
        p.context && typeof p.context === 'object' && !Array.isArray(p.context)
          ? (stableValue(p.context) as DictSerializableRecord)
          : {};
      const values: DictSerializableValue[] | undefined =
        mode === 'hydrate' ? commandValues(p) : undefined;
      const query = mode === 'search' ? String(p.query ?? '') : undefined;
      const refresh = event.type === CRUD_EVENT.refreshDict || p.reload === true;
      const cache = cachePolicyFor(dictConfig);
      const cacheKey = makeCacheKey({
        dictId,
        providerId,
        ...(cache.mode === 'shared' ? {} : { scope }),
        cacheMode: cache.mode,
        mode,
        context,
        values,
        query,
      });

      // Preserve the legacy redundant-load collapse without hiding context changes.
      if (
        existing?.status === 'loaded' &&
        mode === 'load' &&
        !refresh &&
        existing.scope === scope &&
        existing.visibleCacheKey === cacheKey
      ) {
        return ok(state);
      }

      const generation = (existing?.generation ?? 0) + 1;
      const requestId = `${dictId}:${encodeURIComponent(scope)}:${generation}`;
      const activeRequest = { requestId, generation, scope, mode, cacheKey };
      const sameScope = existing?.scope === scope;
      const visibleNodes = sameScope ? (existing?.visibleNodes ?? []) : [];
      const knownByValue = sameScope ? (existing?.knownByValue ?? {}) : {};
      const next = setDict(
        state,
        dictId,
        entryWithAliases({
          status: 'loading',
          visibleNodes,
          knownByValue,
          error: null,
          scope,
          generation,
          activeRequest,
          visibleCacheKey: sameScope ? existing?.visibleCacheKey : undefined,
        }),
      );
      const intent: DictLoadIntent = {
        dictId,
        providerId,
        scope,
        mode,
        context,
        ...(values ? { values } : {}),
        ...(query !== undefined ? { query } : {}),
        cache,
        refresh,
        requestId,
        generation,
        cacheKey,
      };
      return { state: next, effects: [loadDictEffect(intent)] };
    }

    case CRUD_EVENT.invalidateDict: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      const scope =
        typeof p.scope === 'string' && p.scope
          ? p.scope
          : existing?.scope ?? 'default';
      const generation =
        existing && existing.scope === scope
          ? existing.generation + 1
          : existing?.generation ?? 0;
      const effect = invalidateDictEffect({
        dictId,
        scope,
        ...(typeof p.cacheKey === 'string' ? { cacheKey: p.cacheKey } : {}),
        generation,
      });
      if (!existing || existing.scope !== scope) {
        return { state, effects: [effect] };
      }
      return {
        state: setDict(
          state,
          dictId,
          entryWithAliases({
            ...existing,
            status: 'idle',
            error: null,
            generation,
            activeRequest: null,
          }),
        ),
        effects: [effect],
      };
    }

    case CRUD_EVENT.dictLoaded: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      if (!requestMatches(existing, p)) return ok(state);
      const nodes = resultNodes(p);
      const dictConfig = resolveDictConfig(config, dictId);
      const resultMap = buildMap(nodes, dictConfig);
      const visibleNodes =
        p.mode === 'hydrate' ? existing.visibleNodes : nodes;
      const knownByValue = {
        ...existing.knownByValue,
        ...resultMap,
      };
      return ok(
        setDict(
          state,
          dictId,
          entryWithAliases({
            status: 'loaded',
            visibleNodes,
            knownByValue,
            error: null,
            scope: existing.scope,
            generation: existing.generation,
            activeRequest: null,
            visibleCacheKey:
              p.mode === 'hydrate' ? existing.visibleCacheKey : p.cacheKey,
          }),
        ),
      );
    }

    case CRUD_EVENT.dictLoadFailed: {
      const dictId: string = p.dictId;
      if (!dictId) return ok(state);
      const existing = state.dict[dictId];
      if (!requestMatches(existing, p)) return ok(state);
      return ok(
        setDict(
          state,
          dictId,
          entryWithAliases({
            status: 'error',
            visibleNodes: existing.visibleNodes,
            knownByValue: existing.knownByValue,
            error: String(p.error ?? ''),
            scope: existing.scope,
            generation: existing.generation,
            activeRequest: null,
            visibleCacheKey: existing.visibleCacheKey,
          }),
        ),
      );
    }

    default:
      return ok(state);
  }
}
