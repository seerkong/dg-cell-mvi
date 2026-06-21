/**
 * dg-cell-mvi-crud · support/columnsFilterEffects — the impure boundary for column-settings storage.
 *
 * The reducer's columnsFilter slice stays pure; reading/writing localStorage is IO so it funnels
 * here, exactly like dict IO in support/dictEffects.ts. Two handlers:
 *   - loadColumnsFilter   → read storage[`crud:columnsFilter:<table.id>`], parse, and re-dispatch
 *                           `columnsFilterLoaded` to seed the slice on init.
 *   - persistColumnsFilter→ write the (just-folded) overrides back under the same key.
 *
 * The storage backend is an injected port (the Vue layer supplies `localStorage`; tests pass a fake).
 * Both handlers no-op when no `table.id` is configured. Storage absence/parse errors are swallowed —
 * persistence is best-effort and must never break the loop.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import { columnsFilterLoaded } from '../contract/events';
import type { ColumnsFilterOverrides } from '../contract/crudOptions';
import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';

/** A minimal storage backend — the `getItem`/`setItem` subset of the Web Storage API. */
export interface ColumnsFilterStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** the localStorage key for a table's persisted column settings. */
export function columnsFilterStorageKey(tableId: string): string {
  return `crud:columnsFilter:${tableId}`;
}

export interface CreateColumnsFilterEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  storage?: ColumnsFilterStoragePort;
}

export function createColumnsFilterEffects<R = any>(
  opts: CreateColumnsFilterEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config, storage } = opts;
  const tableId = config.table.id;

  const loadColumnsFilter: EffectHandler<CrudState<R>> = async (_rt) => {
    if (!storage || !tableId) return columnsFilterLoaded({});
    try {
      const raw = storage.getItem(columnsFilterStorageKey(tableId));
      if (!raw) return columnsFilterLoaded({});
      const parsed = JSON.parse(raw) as ColumnsFilterOverrides;
      return columnsFilterLoaded(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      return columnsFilterLoaded({});
    }
  };

  const persistColumnsFilter: EffectHandler<CrudState<R>> = async (_rt, req) => {
    if (!storage || !tableId) return;
    const { overrides } = req.payload as { overrides: Record<string, any> };
    try {
      storage.setItem(columnsFilterStorageKey(tableId), JSON.stringify(overrides ?? {}));
    } catch {
      // best-effort: a quota/serialization failure must not break the loop.
    }
  };

  return {
    [CRUD_EFFECT.loadColumnsFilter]: loadColumnsFilter,
    [CRUD_EFFECT.persistColumnsFilter]: persistColumnsFilter,
  };
}
