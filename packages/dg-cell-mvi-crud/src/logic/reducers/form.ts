/**
 * dg-cell-mvi-crud · logic/reducers/form — pure reduceForm(state, event, config) -> {state, effects}.
 *
 * Stage 3: the add/edit/view form dialog lifecycle as pure folds + emitted effects, reproducing
 * the reference crud's CrudExpose `_openDialog` / DgForm `createInitialForm`+`submit` order:
 *   open → (infoRequest effect | self formOpened) → build initialForm (column defaults ⊕ valueBuilder
 *   ⊕ row) → setFormField edits → doSubmit (pure sync validate → valueResolve → submitChain effect) →
 *   submitSucceeded (close + triggerRefresh + notify) | submitFailed | submitAborted (hook/async
 *   validation abort: keep open, status idle, field errors). The submit hook chain + async validation
 *   live in the submitChain effect (they await user hooks), so the reducer stays pure.
 *
 * Never mutates inputs, never does IO; request work + async info fetch are described as effects. Bound
 * `config` supplies the per-mode columns, request-fn presence, and value transforms. `formOpened` is
 * the single state-building branch (open + initialForm); the no-infoRequest path reaches it via a tiny
 * re-dispatch effect so both paths build identically. Composed into reduceCrud by the orchestrator.
 */
import { cloneDeep, set } from 'lodash-es';
import type { AppEvent, EffectRequest, ReduceResult } from 'dg-cell-mvi-core';

import { CRUD_EVENT } from '../../contract/events';
import {
  clearFormDraftEffect,
  infoRequestEffect,
  loadFormDraftEffect,
  notifyEffect,
  persistFormDraftEffect,
  resolveAsyncComputeEffect,
  submitChainEffect,
  valueChangeEffect,
} from '../../contract/effects';
import type { CrudState, FormMode } from '../../contract/state';
import type { FormWrapperOptions } from '../../contract/crudOptions';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';
import { buildInitialForm, doValueResolve } from '../../support/valueTransforms';
import { validateForm } from '../../support/validate';
import { pickFormColumns } from '../projectors/form';

function ok<R>(state: CrudState<R>): ReduceResult<CrudState<R>> {
  return { state, effects: [] };
}

/**
 * Re-dispatch `doRefresh` from a (pure) reducer: the support layer registers a `triggerRefresh`
 * handler keyed on this string that returns `doRefresh(payload)`. Same cross-slice helper the remove
 * slice uses, so the after-submit refresh stays declarative.
 */
function triggerRefreshEffect(p: { goFirstPage?: boolean; scrollTop?: boolean } = {}): EffectRequest {
  return { type: 'crud.fx.triggerRefresh', payload: p };
}

/**
 * Re-dispatch `formOpened` for the no-infoRequest open path: the support layer registers a
 * `triggerFormOpened` handler keyed on this string that returns `formOpened(payload)`. Keeps the
 * open/build logic in the single `formOpened` branch.
 */
function triggerFormOpenedEffect(p: {
  mode: FormMode;
  row: any;
  initialForm: Record<string, any>;
  index: number | null;
}): EffectRequest {
  return { type: 'crud.fx.triggerFormOpened', payload: p as unknown as Record<string, unknown> };
}

/** patch only the form slice immutably. */
function withForm<R>(state: CrudState<R>, patch: Partial<CrudState<R>['form']>): CrudState<R> {
  return { ...state, form: { ...state.form, ...patch } };
}

/** resolve a row for an open command: explicit payload row, else the row at index in the table. */
function resolveRow<R>(state: CrudState<R>, p: Record<string, any>): { row: any; index: number | null } {
  let row = p.row ?? null;
  const index = p.index != null ? Number(p.index) : null;
  if (row == null && index != null) {
    row = (state.list.rows as any[])[index] ?? null;
  }
  return { row, index };
}

/** the per-mode form-column `value` defaults buildInitialForm seeds from. */
function formDefaults(config: NormalizedCrudOptions, mode: FormMode) {
  return pickFormColumns(config, mode).map((fc) => ({ key: fc.key, value: fc.item.value }));
}

/**
 * The form-draft config (saveDraft on/off + the storage id). Drafts are persisted/restored only when
 * `form.wrapper.saveDraft` is set AND an id is resolvable (form.wrapper.id, else table.id). All draft
 * IO lives at the effect boundary; the reducer only decides whether to emit the draft effects.
 */
function draftConfig(config: NormalizedCrudOptions): { enabled: boolean; id?: string } {
  const wrapper = (config.form?.wrapper || {}) as FormWrapperOptions;
  const id = wrapper.id ?? config.table.id;
  return { enabled: wrapper.saveDraft === true && !!id, id };
}

/** open command shared by add/edit/view/copy. `mode` is the resolved form mode. */
function openForm<R>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
  mode: FormMode,
  p: Record<string, any>,
): ReduceResult<CrudState<R>> {
  const { row, index } = resolveRow(state, p);
  // pending state: mode/row/index recorded, dialog stays closed until formOpened arrives.
  const next = withForm(state, {
    mode,
    index,
    row,
    open: false,
    submitStatus: 'idle',
    valid: true,
    errors: {},
    submitError: null,
  });

  // edit/view with an infoRequest: fetch the full row first; the effect re-dispatches formOpened.
  // add never calls infoRequest.
  if (config.request.infoRequest && mode !== 'add') {
    return { state: next, effects: [infoRequestEffect({ mode, row, index })] };
  }

  // otherwise build the initial form now and re-dispatch formOpened via a tiny effect.
  const initialForm = buildInitialForm(formDefaults(config, mode), config.columns, row);
  return { state: next, effects: [triggerFormOpenedEffect({ mode, row, initialForm, index })] };
}

export function reduceForm<R = any>(
  state: CrudState<R>,
  event: AppEvent,
  config: NormalizedCrudOptions<R>,
): ReduceResult<CrudState<R>> {
  const p = (event.payload || {}) as Record<string, any>;

  switch (event.type) {
    // ---- open ----
    case CRUD_EVENT.openAdd:
      return openForm(state, config, 'add', p);
    case CRUD_EVENT.openEdit:
      return openForm(state, config, 'edit', p);
    case CRUD_EVENT.openView:
      return openForm(state, config, 'view', p);
    case CRUD_EVENT.openCopy:
      // copy opens the add form pre-filled from the source row (the reference crud: _openDialog('add', ...)).
      return openForm(state, config, 'add', p);

    case CRUD_EVENT.formOpened: {
      const mode = (p.mode as FormMode) || state.form.mode;
      const initialForm = (p.initialForm as Record<string, any>) || {};
      const formData = cloneDeep(initialForm);
      const next: CrudState<R> = {
        ...withForm(state, {
          mode,
          open: true,
          row: p.row ?? state.form.row,
          index: p.index ?? state.form.index,
          initialForm,
          // dirty-tracking snapshot: a deep clone of the just-opened form data (P5).
          initial: cloneDeep(formData),
          form: formData,
          submitStatus: 'idle',
          valid: true,
          errors: {},
          submitError: null,
        }),
        // a fresh dialog starts with no resolved async-compute values (re-fetched by the effect below).
        computeAsync: {},
      };
      // re-check any options-on-watch fields against the fresh form, and run any `immediate`
      // valueChange linkage once against the initial form (both at the effect boundary).
      const effects: EffectRequest[] = [
        resolveAsyncComputeEffect({
          form: next.form.form,
          mode: next.form.mode,
          row: next.form.row,
          index: next.form.index,
        }),
        valueChangeEffect({ key: null, form: next.form.form, mode: next.form.mode, immediate: true }),
      ];
      // saveDraft: on open, read storage for a saved draft (the handler pops the restore confirm).
      const draft = draftConfig(config);
      if (draft.enabled) effects.push(loadFormDraftEffect({ id: draft.id }));
      return { state: next, effects };
    }

    case CRUD_EVENT.setFormField: {
      // pure write: only the field value lands in form data — the `fromValueChange` flag is a
      // routing hint for the valueChange effect, never persisted into the form.
      const form = cloneDeep(state.form.form);
      set(form, p.key, p.value);
      const next = withForm(state, { form });
      // a field changed → (a) a watched async-compute key may have moved; (b) this field may carry a
      // column-level valueChange linkage. Both re-check at the effect boundary (reducer stays pure).
      // `fromValueChange` is forwarded so the valueChange effect can skip writes it itself produced.
      const effects: EffectRequest[] = [
        resolveAsyncComputeEffect({
          form: next.form.form,
          mode: next.form.mode,
          row: next.form.row,
          index: next.form.index,
        }),
        valueChangeEffect({
          key: String(p.key),
          form: next.form.form,
          mode: next.form.mode,
          fromValueChange: p.fromValueChange === true,
        }),
      ];
      // saveDraft: persist the live form on every edit (IO at the effect boundary).
      const draft = draftConfig(config);
      if (draft.enabled) effects.push(persistFormDraftEffect({ id: draft.id, form: next.form.form }));
      return { state: next, effects };
    }

    case CRUD_EVENT.setFormData: {
      // replace the whole form (restoring a saved draft): overwrite form data and reset the dirty
      // baseline to the restored data, then re-check async-compute against the new values.
      const restored = cloneDeep((p.form as Record<string, any>) || {});
      const next = withForm(state, { form: restored, initial: cloneDeep(restored) });
      return {
        state: next,
        effects: [
          resolveAsyncComputeEffect({
            form: next.form.form,
            mode: next.form.mode,
            row: next.form.row,
            index: next.form.index,
          }),
        ],
      };
    }

    case CRUD_EVENT.asyncComputeResolved: {
      // store the resolved options under the field key (the projector reads computeAsync[key].value).
      const key = String(p.key);
      const entry = { watchKey: String(p.watchKey ?? ''), value: p.value, loading: false };
      return ok({ ...state, computeAsync: { ...state.computeAsync, [key]: entry } });
    }

    case CRUD_EVENT.doSubmit: {
      if (state.form.mode === 'view') return ok(state); // nothing to submit in view mode
      const formColumns = pickFormColumns(config, state.form.mode).map((fc) => ({
        key: fc.key,
        title: fc.item.title ?? fc.column.title,
        rules: fc.item.rules,
        show: true,
      }));
      const { valid, errors } = validateForm(state.form.form, formColumns);
      if (!valid) {
        return ok(withForm(state, { valid: false, errors, submitStatus: 'error' }));
      }

      // valid (sync rules) → resolve values (component -> backend) on a clone, then hand off to the
      // submit hook chain effect. The chain (beforeValidate → async validate → beforeSubmit →
      // doSubmit|add/editRequest → afterSubmit → onSuccess) lives at the effect boundary because it
      // awaits user-provided async hooks — the reducer stays pure.
      const resolved = cloneDeep(state.form.form);
      doValueResolve(resolved, config.columns);
      const next = withForm(state, {
        valid: true,
        errors: {},
        submitStatus: 'submitting',
        submitError: null,
      });
      return {
        state: next,
        effects: [
          submitChainEffect({
            form: resolved,
            row: state.form.row,
            mode: state.form.mode,
            initialForm: state.form.initialForm,
          }),
        ],
      };
    }

    case CRUD_EVENT.submitSucceeded: {
      const mode = (p.mode as FormMode) || state.form.mode;
      const next = withForm(state, { submitStatus: 'saved', open: false, res: p.res });
      const effects: EffectRequest[] = [
        triggerRefreshEffect({ goFirstPage: mode === 'add', scrollTop: mode === 'add' }),
        notifyEffect({ kind: 'success', message: mode === 'add' ? '添加成功' : '保存成功' }),
      ];
      // saveDraft: a successful submit clears the stored draft (no longer "unsaved").
      const draft = draftConfig(config);
      if (draft.enabled) effects.push(clearFormDraftEffect({ id: draft.id }));
      return { state: next, effects };
    }

    case CRUD_EVENT.submitFailed:
      return ok(withForm(state, { submitStatus: 'error', submitError: String(p.error ?? '') }));

    case CRUD_EVENT.submitAborted: {
      // a hook returned false/threw, or async validation failed: keep the dialog open, drop status
      // back to idle, and surface any field-level errors (async validator failures).
      const errors = (p.errors as Record<string, string>) || {};
      const hasErrors = Object.keys(errors).length > 0;
      return ok(
        withForm(state, {
          open: true,
          submitStatus: 'idle',
          submitError: null,
          valid: !hasErrors,
          errors: hasErrors ? errors : state.form.errors,
        }),
      );
    }

    case CRUD_EVENT.closeForm:
      return ok(withForm(state, { open: false }));

    default:
      return ok(state);
  }
}
