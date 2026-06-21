/**
 * dg-cell-mvi-crud · logic/reducers/columnsFilter — pure reduceColumnsFilter(state, event, config).
 *
 * The column-settings slice. Pure immutable folds:
 *   - setColumnsFilter   → deep-merge the per-column overrides into the slice (successive calls
 *                          accumulate; an `undefined` field keeps the prior value).
 *   - resetColumnsFilter → clear all overrides (back to config defaults).
 *   - columnsFilterLoaded→ REPLACE the slice with what storage held (the init seed).
 *
 * Persistence is IO, so it never happens here: when `config.columnsFilter.storage` (with `table.id`)
 * is on, a *mutating* fold additionally emits `persistColumnsFilterEffect(nextSlice)` and the support
 * handler writes it to storage at the effect boundary. The reducer only describes the write. The load
 * seed (columnsFilterLoaded) does NOT re-persist (it came from storage). Composed into reduceCrud.
 */
import { merge } from 'lodash-es';
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import { persistColumnsFilterEffect } from '../../contract/effects';
import type { ColumnsFilterOverrides } from '../../contract/crudOptions';
import type { CrudState } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

/** with-persist: return the next state, plus a persist effect iff storage is enabled. */
function withPersist<R>(
  next: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  if (config.columnsFilter.storage && config.table.id) {
    return { state: next, effects: [persistColumnsFilterEffect({ overrides: next.columnsFilter })] };
  }
  return ok(next);
}

export function reduceColumnsFilter<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;

  switch (event.type) {
    case CRUD_EVENT.setColumnsFilter: {
      const overrides = (p.overrides as ColumnsFilterOverrides) || {};
      // deep-merge per-column overrides over the existing slice (immutable: merge into a fresh object).
      const columnsFilter = merge({}, state.columnsFilter, overrides);
      return withPersist({ ...state, columnsFilter }, config);
    }

    case CRUD_EVENT.resetColumnsFilter:
      return withPersist({ ...state, columnsFilter: {} }, config);

    case CRUD_EVENT.columnsFilterLoaded: {
      // the init seed from storage — replace the slice; do NOT re-persist (it came from storage).
      const overrides = (p.overrides as ColumnsFilterOverrides) || {};
      return ok({ ...state, columnsFilter: { ...overrides } });
    }

    default:
      return ok(state);
  }
}
