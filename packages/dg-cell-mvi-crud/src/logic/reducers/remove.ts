/**
 * dg-cell-mvi-crud · logic/reducers/remove — pure reduceRemove(state, event, config) -> {state, effects}.
 *
 * Stage 4: delete. Mirrors the reference crud use-expose `doRemove` as a pure reducer + the remove hook chain
 * effect (P5): confirm + the actual delRequest + the user hooks are all IO (described as effects), so
 * the `doRemove(noConfirm)` fold only emits `removeChainEffect` (the analog of `submitChainEffect` —
 * the reducer never calls a request). The local-mode splice waits for `removeSucceeded` so a
 * `beforeRemove` abort leaves the row in place. Never mutates inputs, never does IO. Composed into the
 * root reduceCrud switch by the orchestrator.
 */
import type { AppEvent, EffectRequest, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import {
  confirmRemoveEffect,
  notifyEffect,
  removeChainEffect,
} from '../../contract/effects';
import type { CrudState } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

/**
 * Re-dispatch `doRefresh` from a (pure) reducer: the support layer registers a `triggerRefresh`
 * handler keyed on this string that returns `doRefresh(payload)`. Mirrors the list-slice's
 * doRefresh-after-X helper (support/requestEffects.ts) so cross-slice refreshes stay declarative.
 */
function triggerRefreshEffect(p: { scrollTop?: boolean } = {}): EffectRequest {
  return { type: 'crud.fx.triggerRefresh', payload: p };
}

/** splice one row out of the local list (immutably). */
function spliceRow<R>(state: CrudState<R>, index: number): CrudState<R> {
  const rows = state.list.rows.slice();
  if (index >= 0 && index < rows.length) rows.splice(index, 1);
  return { ...state, list: { ...state.list, rows } };
}

export function reduceRemove<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;
  const isLocal = config.mode?.name === 'local';

  switch (event.type) {
    case CRUD_EVENT.doRemove: {
      if (p.noConfirm) {
        // confirmed (or confirm-skipped): hand off to the remove hook chain effect. The reducer does
        // NOT call delRequest (mirrors doSubmit → submitChainEffect) and does NOT splice yet — the
        // chain may abort in beforeRemove, and the splice only happens on removeSucceeded.
        return {
          state,
          effects: [removeChainEffect({ row: p.row, index: p.index, rows: state.list.rows as any[] })],
        };
      }
      // ask first; the confirm handler re-dispatches doRemove({ noConfirm: true }) on accept.
      return { state, effects: [confirmRemoveEffect({ row: p.row, index: p.index })] };
    }

    case CRUD_EVENT.removeSucceeded: {
      if (isLocal) {
        // local delete: splice the row out now (after the chain succeeded) then announce success.
        const index = Number(p.index);
        const next = Number.isFinite(index) ? spliceRow(state, index) : state;
        return { state: next, effects: [notifyEffect({ kind: 'success', message: '删除成功' })] };
      }
      // remote: refresh the page (keep scroll) then announce success.
      return {
        state,
        effects: [
          triggerRefreshEffect({ scrollTop: false }),
          notifyEffect({ kind: 'success', message: '删除成功' }),
        ],
      };
    }

    case CRUD_EVENT.removeFailed:
      return { state, effects: [notifyEffect({ kind: 'error', message: String(p.error ?? '删除失败') })] };

    case CRUD_EVENT.removeAborted:
      // beforeRemove returned false/threw: nothing was deleted (no splice, no request) — no-op fold.
      return ok(state);

    default:
      return ok(state);
  }
}
