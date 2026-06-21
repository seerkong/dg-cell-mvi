/**
 * dg-cell-mvi-crud · support/removeEffects — the impure boundary for delete (P5: the remove chain).
 *
 * Closes over the user's delRequest + remove hooks + the injected CrudUiPort (confirm). Three handlers:
 *   - removeChain  → the remove hook chain (the analog of formEffects' submitChain): await
 *                    beforeRemove (gate; `false`/throw → removeAborted, no request) → doRemove(or
 *                    delRequest) → afterRemove → onRemoved, returning the terminal feedback event
 *                    (removeSucceeded | removeFailed | removeAborted). All user-hook IO/await lives
 *                    here so the reducer stays pure.
 *   - delRequest   → the default backend deleter the chain calls when no `doRemove` override is set
 *                    (kept as a standalone handler too; still re-dispatches removeSucceeded/removeFailed).
 *   - confirmRemove→ pops the UI confirm (title/message from the remove config) and, on accept,
 *                    re-dispatches doRemove({ noConfirm: true }); on cancel it returns void (no-op).
 *
 * Mirrors the reference crud use-expose `doRemove`, split into describe-as-effect + run-as-handler.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import { doRemove, removeAborted, removeFailed, removeSucceeded } from '../contract/events';
import type { RemoveOptions, RemoveScopeContext } from '../contract/crudOptions';
import type { CrudState } from '../contract/state';
import type { CrudUiPort } from './requestEffects';
import type { NormalizedCrudOptions } from './optionsBuild';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A hook either throwing or resolving to `false` is an abort signal (same sentinel as submitChain). */
const HOOK_ABORT = Symbol('hook-abort');

/**
 * Run one optional remove hook with the remove scope. Returns the hook's resolved value, or the
 * `HOOK_ABORT` sentinel when it threw or resolved to `false`. Mirrors formEffects' runHook.
 */
async function runHook<R>(
  hook: ((ctx: RemoveScopeContext<R>) => any) | undefined,
  ctx: RemoveScopeContext<R>,
): Promise<any | typeof HOOK_ABORT> {
  if (typeof hook !== 'function') return undefined;
  try {
    const ret = await hook(ctx);
    return ret === false ? HOOK_ABORT : ret;
  } catch {
    return HOOK_ABORT;
  }
}

/** The normalized remove config (rowHandle.remove), or an empty object. */
function removeConfig<R>(config: NormalizedCrudOptions<R>): RemoveOptions<R> {
  return ((config.rowHandle as { remove?: RemoveOptions<R> })?.remove || {}) as RemoveOptions<R>;
}

export interface CreateRemoveEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  ui?: CrudUiPort;
}

export function createRemoveEffects<R = any>(
  opts: CreateRemoveEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config, ui } = opts;

  // crud.fx.removeChain — the remove hook chain (the impure boundary). Payload carries the row + index
  // + current page rows; runs hooks in order and returns the terminal feedback event.
  const removeChain: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { row, index, rows } = req.payload as { row: any; index?: number; rows?: any[] };
    const hooks = removeConfig(config);
    const ctx: RemoveScopeContext<R> = { row, index, rows: rows as R[] | undefined };

    // 1) beforeRemove — gate before the delete. false/throw aborts (no delRequest, no refresh).
    if ((await runHook(hooks.beforeRemove, ctx)) === HOOK_ABORT) {
      return removeAborted({ reason: 'beforeRemove' });
    }

    // 2) doRemove override (if provided) else the default delRequest. A doRemove hook that throws/
    //    returns false aborts; a delRequest that rejects is a removeFailed.
    let res: any;
    if (typeof hooks.doRemove === 'function') {
      const ret = await runHook(hooks.doRemove, ctx);
      if (ret === HOOK_ABORT) return removeAborted({ reason: 'doRemove' });
      res = ret;
    } else if (config.request.delRequest) {
      try {
        res = await config.request.delRequest({ row, index });
      } catch (err) {
        return removeFailed({ error: normalizeError(err) });
      }
    }

    // 3) afterRemove — runs after a successful delete; throwing/false is treated as a failure.
    if ((await runHook(hooks.afterRemove, { ...ctx, res })) === HOOK_ABORT) {
      return removeFailed({ error: 'afterRemove failed' });
    }

    // 4) onRemoved — final side-effect hook; also gates success on its completion.
    if ((await runHook(hooks.onRemoved, { ...ctx, res })) === HOOK_ABORT) {
      return removeFailed({ error: 'onRemoved failed' });
    }

    return removeSucceeded({ index, row, res });
  };

  const delRequest: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { row, index } = req.payload as { row: any; index?: number };
    if (!config.request.delRequest) {
      // no backend deleter wired: treat as succeeded so the list still refreshes.
      return removeSucceeded({ index, row });
    }
    try {
      const res = await config.request.delRequest({ row, index });
      return removeSucceeded({ index, row, res });
    } catch (err) {
      return removeFailed({ error: normalizeError(err) });
    }
  };

  const confirmRemove: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { row, index } = req.payload as { row?: any; index?: number };
    const rc = removeConfig(config);
    // showConfirm defaults to true; only skip the confirm when explicitly false.
    const confirmed =
      rc.showConfirm === false || !ui
        ? true
        : await ui.confirm({
            title: rc.confirmTitle ?? '提示',
            message: rc.confirmMessage ?? '确定要删除此记录吗?',
          });
    if (confirmed) return doRemove({ row, index, noConfirm: true });
    // cancelled: no feedback event.
  };

  return {
    [CRUD_EFFECT.removeChain]: removeChain,
    [CRUD_EFFECT.delRequest]: delRequest,
    [CRUD_EFFECT.confirmRemove]: confirmRemove,
  };
}
