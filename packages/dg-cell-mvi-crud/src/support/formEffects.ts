/**
 * dg-cell-mvi-crud · support/formEffects — the impure boundary for the form slice.
 *
 * Handlers for the submit hook chain, the add/edit/info request effects, and the formOpened
 * re-dispatch. They close over the user's `crudOptions.request` fns + normalized config and return
 * the feedback AppEvent the effect runner re-dispatches — same shape as support/requestEffects.ts.
 * Per A.7's lifecycle order, value transforms are pure and already applied (valueResolve in the
 * doSubmit reducer before the submitChain effect; valueBuilder here for the infoRequest-fetched row,
 * mirroring _openDialog).
 *
 * The submit hook chain (beforeValidate → async validate → beforeSubmit → doSubmit|add/editRequest →
 * afterSubmit → onSuccess) runs here, in the `submitChain` handler, because it awaits user-provided
 * async hooks — IO/await that must never enter the pure reducer. A hook that throws or returns
 * `false`, or an async-validation failure, aborts (no add/editRequest; `submitAborted` keeps the
 * dialog open with status idle). afterSubmit/onSuccess failing after a successful request is a
 * `submitFailed` (status error, dialog stays open). Success ends in the existing `submitSucceeded`.
 */
import type { AppEvent, EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import {
  asyncComputeResolved,
  formOpened,
  setFormField,
  submitAborted,
  submitFailed,
  submitSucceeded,
} from '../contract/events';
import type {
  FormItemProps,
  FormScopeContext,
  ValueChange,
  ValueChangeHandler,
  ValueChangeScope,
} from '../contract/crudOptions';
import { get as lodashGet } from 'lodash-es';
import type { CrudState, FormMode } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';
import { pickFormColumns } from '../logic/projectors/form';
import { buildInitialForm } from './valueTransforms';
import { validateFormAsync, type ValidatableColumn } from './validate';
import { AsyncComputeValue, isAsyncCompute, type ComputeScope } from './compute';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A JSON-stable key for a watched value, so re-fetch fires iff the watched value actually changed. */
function stableKey(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** A hook either throwing or resolving to `false` is an abort signal. */
const HOOK_ABORT = Symbol('hook-abort');

/**
 * Normalize a column's `valueChange` config (bare handler or `{ immediate?, handle }`) into a
 * uniform `{ immediate, handle }`. Returns null when there is no usable handler.
 */
function normalizeValueChange(vc: ValueChange | undefined): { immediate: boolean; handle: ValueChangeHandler } | null {
  if (!vc) return null;
  if (typeof vc === 'function') return { immediate: false, handle: vc };
  if (typeof vc.handle === 'function') return { immediate: vc.immediate === true, handle: vc.handle };
  return null;
}

/**
 * Resolve the active form options for a mode, merging the per-mode override (addForm/editForm/
 * viewForm) over the base `form` — same precedence DgForm uses. Hooks live on these objects.
 */
function resolveFormOptions<R>(config: NormalizedCrudOptions<R>, mode: FormMode) {
  const base = (config.form || {}) as Record<string, any>;
  const perMode = (mode === 'add' ? config.addForm : mode === 'edit' ? config.editForm : config.viewForm) || {};
  return { ...base, ...(perMode as Record<string, any>) };
}

/**
 * Run one optional hook with the submit scope. Returns the hook's resolved value, or the
 * `HOOK_ABORT` sentinel when the hook is absent-safe-false: it threw or resolved to `false`.
 */
async function runHook(
  hook: ((ctx: FormScopeContext) => any) | undefined,
  ctx: FormScopeContext,
): Promise<any | typeof HOOK_ABORT> {
  if (typeof hook !== 'function') return undefined;
  try {
    const ret = await hook(ctx);
    return ret === false ? HOOK_ABORT : ret;
  } catch {
    return HOOK_ABORT;
  }
}

/** The per-mode form columns + rules the async validator reads (mirrors the doSubmit reducer). */
function validatableColumns<R>(config: NormalizedCrudOptions<R>, mode: FormMode): ValidatableColumn[] {
  return pickFormColumns(config, mode).map((fc) => ({
    key: fc.key,
    title: (fc.item as FormItemProps).title ?? fc.column.title,
    rules: (fc.item as FormItemProps).rules,
    show: true,
  }));
}

export interface CreateFormEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
}

export function createFormEffects<R = any>(
  opts: CreateFormEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config } = opts;

  /** Default request: add/editRequest by mode. Returns the backend res (or null when no fn wired). */
  async function defaultRequest(mode: FormMode, form: Record<string, any>, row: any): Promise<any> {
    if (mode === 'add') {
      return config.request.addRequest ? config.request.addRequest({ form }) : null;
    }
    return config.request.editRequest ? config.request.editRequest({ form, row }) : null;
  }

  // crud.fx.submitChain — the submit hook chain (the impure boundary). Payload carries the already
  // value-resolved form + row + mode + initialForm; runs hooks in order and returns the terminal
  // feedback event (submitSucceeded | submitFailed | submitAborted).
  const submitChain: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { form, row, mode, initialForm } = req.payload as {
      form: Record<string, any>;
      row: any;
      mode: FormMode;
      initialForm: Record<string, any>;
    };
    const hooks = resolveFormOptions(config, mode);
    const ctx: FormScopeContext = { form, mode, row, initialForm };

    // 1) beforeValidate — gate before any validation.
    if ((await runHook(hooks.beforeValidate, ctx)) === HOOK_ABORT) {
      return submitAborted({ reason: 'beforeValidate' });
    }

    // 2) async validation (sync rules already passed in the reducer). Field failures abort.
    const { valid, errors } = await validateFormAsync(form, validatableColumns(config, mode));
    if (!valid) {
      return submitAborted({ errors, reason: 'validate' });
    }

    // 3) beforeSubmit — last gate before the write.
    if ((await runHook(hooks.beforeSubmit, ctx)) === HOOK_ABORT) {
      return submitAborted({ reason: 'beforeSubmit' });
    }

    // 4) doSubmit override (if provided) else the default add/editRequest. A doSubmit hook that
    //    throws/returns false aborts; a request that rejects is a submitFailed.
    let res: any;
    if (typeof hooks.doSubmit === 'function') {
      const ret = await runHook(hooks.doSubmit, ctx);
      if (ret === HOOK_ABORT) return submitAborted({ reason: 'doSubmit' });
      res = ret;
    } else {
      try {
        res = await defaultRequest(mode, form, row);
      } catch (err) {
        return submitFailed({ error: normalizeError(err) });
      }
    }

    // 5) afterSubmit — runs after a successful write; throwing/false is treated as a failure so the
    //    dialog stays open (delta: after-submit-runs-on-success).
    if ((await runHook(hooks.afterSubmit, { ...ctx, res })) === HOOK_ABORT) {
      return submitFailed({ error: 'afterSubmit failed' });
    }

    // 6) onSuccess — final side-effect hook; also gates closing on its success.
    if ((await runHook(hooks.onSuccess, { ...ctx, res })) === HOOK_ABORT) {
      return submitFailed({ error: 'onSuccess failed' });
    }

    return submitSucceeded({ res, mode });
  };

  // crud.fx.addRequest — { form } (already valueResolve'd by the reducer)
  const addRequest: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { form } = req.payload as { form: Record<string, any> };
    if (!config.request.addRequest) {
      return submitSucceeded({ res: null, mode: 'add' });
    }
    try {
      const res = await config.request.addRequest({ form });
      return submitSucceeded({ res, mode: 'add' });
    } catch (err) {
      return submitFailed({ error: normalizeError(err) });
    }
  };

  // crud.fx.editRequest — { form, row } (already valueResolve'd by the reducer)
  const editRequest: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { form, row } = req.payload as { form: Record<string, any>; row: R };
    if (!config.request.editRequest) {
      return submitSucceeded({ res: null, mode: 'edit' });
    }
    try {
      const res = await config.request.editRequest({ form, row });
      return submitSucceeded({ res, mode: 'edit' });
    } catch (err) {
      return submitFailed({ error: normalizeError(err) });
    }
  };

  // crud.fx.infoRequest — { mode, row, index } -> fetch the full row, build the initial form,
  // then re-dispatch formOpened (port of _openDialog's `row = await infoRequest(...)`).
  const infoRequest: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { mode, row, index } = req.payload as { mode: FormMode; row: any; index: number | null };
    let fetched = row;
    if (config.request.infoRequest) {
      fetched = await config.request.infoRequest({ mode, row });
    }
    const defaults = pickFormColumns(config, mode).map((fc) => ({ key: fc.key, value: fc.item.value }));
    const initialForm = buildInitialForm(defaults, config.columns, fetched);
    return formOpened({ mode, row: fetched, initialForm, index });
  };

  // crud.fx.triggerFormOpened — re-dispatch formOpened for the no-infoRequest open path. The reducer
  // already built initialForm purely; this just bounces it through the feedback bus.
  const triggerFormOpened: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { mode, row, initialForm, index } = req.payload as {
      mode: FormMode;
      row: any;
      initialForm: Record<string, any>;
      index: number | null;
    };
    return formOpened({ mode, row, initialForm, index });
  };

  // crud.fx.resolveAsyncCompute — the options-on-watch boundary. For each per-mode form column whose
  // `component.options` is an AsyncComputeValue, compute `watch(scope)` from the live form; if it
  // differs from the value the field was last resolved against (state.computeAsync[key].watchKey),
  // run `asyncFn` and emit `asyncComputeResolved`. Comparing against the stored watchKey is the loop
  // guard: a setFormField on an UNwatched field leaves every watchKey unchanged → no re-fetch, no
  // feedback storm. Returns the batch of resolved events (auto re-dispatched by the runner).
  const resolveAsyncCompute: EffectHandler<CrudState<R>> = async (runtime, req) => {
    const { form, mode, row, index } = req.payload as {
      form: Record<string, any>;
      mode: FormMode;
      row: any;
      index: number | null;
    };
    const scope: ComputeScope = { form, mode, row, index: index ?? undefined };
    const prev = (runtime?.state as CrudState<R> | undefined)?.computeAsync ?? {};
    const events: AppEvent[] = [];
    for (const fc of pickFormColumns(config, mode)) {
      const marker = (fc.item.component as Record<string, any> | undefined)?.options;
      if (!isAsyncCompute(marker)) continue;
      const m = marker as AsyncComputeValue;
      const watchValue = typeof m.watch === 'function' ? m.watch({ ...scope, key: fc.key }) : undefined;
      const watchKey = stableKey(watchValue);
      // skip when this field already resolved against the same watched value (the loop guard).
      if (prev[fc.key] && prev[fc.key].watchKey === watchKey) continue;
      try {
        const value = await m.asyncFn(watchValue, { ...scope, key: fc.key });
        events.push(asyncComputeResolved({ key: fc.key, watchKey, value }));
      } catch {
        // a failed fetch falls back to the marker's defaultValue (no error slice for compute options).
        events.push(asyncComputeResolved({ key: fc.key, watchKey, value: m.defaultValue }));
      }
    }
    return events;
  };

  // crud.fx.valueChange — the column-level `valueChange` linkage boundary. A field changed (or the
  // form opened, for `immediate` handlers): build the valueChange scope over the CURRENT form, run
  // the handler(s), collect every `setValue(k,v)` (plus any plain object the handler returns) into a
  // changes map, and re-dispatch each as `setFormField(k, v, fromValueChange:true)`. The reducer is
  // pure — all linkage IO/side-effects (calling user handlers) stay here.
  //
  // LOOP GUARD: when the triggering write itself came from a valueChange (`fromValueChange === true`),
  // skip entirely — fields set by a valueChange do NOT re-trigger valueChange (one-level linkage), so
  // there is no cascade / infinite loop. Mirrors resolveAsyncCompute's watchKey guard in spirit.
  const valueChange: EffectHandler<CrudState<R>> = async (runtime, req) => {
    const { key, form, mode, fromValueChange, immediate } = req.payload as {
      key: string | null;
      form: Record<string, any>;
      mode: FormMode;
      fromValueChange?: boolean;
      immediate?: boolean;
    };
    if (fromValueChange === true) return []; // loop guard: a valueChange write does not cascade.

    // the live form to read/seed the scope from (prefer the post-reduce state, fall back to payload).
    const liveForm = (runtime?.state as CrudState<R> | undefined)?.form?.form ?? form;

    // which columns' valueChange should run: on a field change, just that field's; on the formOpened
    // `immediate` sweep, every column whose valueChange is `{ immediate: true, handle }`.
    const targets: Array<{ key: string; handle: ValueChangeHandler }> = [];
    for (const col of config.columns) {
      const vc = normalizeValueChange((col.raw as { valueChange?: ValueChange }).valueChange);
      if (!vc) continue;
      if (immediate) {
        if (vc.immediate) targets.push({ key: col.key, handle: vc.handle });
      } else if (col.key === key) {
        targets.push({ key: col.key, handle: vc.handle });
      }
    }
    if (!targets.length) return [];

    // collect changes from all targeted handlers into one map, then dispatch them (fromValueChange).
    const changes: Record<string, any> = {};
    for (const t of targets) {
      const scope: ValueChangeScope = {
        key: t.key,
        value: lodashGet(liveForm, t.key),
        form: liveForm,
        mode,
        setValue: (k: string, v: any) => {
          changes[k] = v;
        },
        getValue: (k: string) => lodashGet(liveForm, k),
      };
      try {
        const ret = t.handle(scope);
        // a handler may return a plain object of field→value to merge (alternative to setValue).
        if (ret && typeof ret === 'object' && !Array.isArray(ret)) {
          for (const k of Object.keys(ret)) changes[k] = (ret as Record<string, any>)[k];
        }
      } catch {
        // a throwing valueChange handler is swallowed (linkage is best-effort, never aborts the form).
      }
    }

    // each collected change becomes a setFormField carrying fromValueChange:true (so it won't cascade).
    return Object.keys(changes).map((k) => setFormField(k, changes[k], true));
  };

  return {
    [CRUD_EFFECT.submitChain]: submitChain,
    [CRUD_EFFECT.addRequest]: addRequest,
    [CRUD_EFFECT.editRequest]: editRequest,
    [CRUD_EFFECT.infoRequest]: infoRequest,
    [CRUD_EFFECT.resolveAsyncCompute]: resolveAsyncCompute,
    [CRUD_EFFECT.valueChange]: valueChange,
    'crud.fx.triggerFormOpened': triggerFormOpened,
  };
}
