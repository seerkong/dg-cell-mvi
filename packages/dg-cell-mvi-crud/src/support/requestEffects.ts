/**
 * dg-cell-mvi-crud · support/requestEffects — the impure boundary.
 *
 * Effect handlers close over the user's request fns + normalized config. Each returns a feedback
 * AppEvent the effect runner re-dispatches. Confirm/notify are delegated to an injected CrudUiPort
 * (implemented by the view layer's Element adapter) so this package stays framework-agnostic.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import { doRefresh, refreshFailed, refreshSucceeded } from '../contract/events';
import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CrudUiPort {
  confirm(opts: { title?: string; message?: string }): Promise<boolean>;
  notify(kind: 'success' | 'error' | 'warning', message: string): void;
}

export interface CreateRequestEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  ui?: CrudUiPort;
}

export function createRequestEffects<R = any>(
  opts: CreateRequestEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config, ui } = opts;

  const pageRequest: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { query } = req.payload as { query: any };
    if (!config.request.pageRequest) {
      return refreshSucceeded({ rows: [], currentPage: 1, pageSize: config.pagination.pageSize, total: 0 });
    }
    try {
      const raw = await config.request.pageRequest(query);
      const pageRes = config.request.transformRes
        ? config.request.transformRes({ res: raw, query })
        : raw;
      const records: any[] = pageRes?.records ?? [];
      return refreshSucceeded({
        rows: records,
        currentPage: pageRes?.currentPage ?? 1,
        pageSize: pageRes?.pageSize ?? records.length,
        total: pageRes?.total ?? records.length,
      });
    } catch (err) {
      return refreshFailed({ error: normalizeError(err) });
    }
  };

  const notify: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { kind, message } = req.payload as { kind: 'success' | 'error' | 'warning'; message: string };
    ui?.notify(kind, message);
  };

  // doRefresh-after-X cross-slice helper: effects that just need to trigger a refresh re-dispatch it.
  const triggerRefresh: EffectHandler<CrudState<R>> = async (_rt, req) => {
    return doRefresh((req.payload as any) || {});
  };

  return {
    [CRUD_EFFECT.pageRequest]: pageRequest,
    [CRUD_EFFECT.notify]: notify,
    'crud.fx.triggerRefresh': triggerRefresh,
  };
}
