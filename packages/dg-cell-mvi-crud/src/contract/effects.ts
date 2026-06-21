/**
 * dg-cell-mvi-crud · contract/effects — effect-request keys + creators.
 *
 * The reducer emits these; the support layer's handlers (which own the request fns + dict IO) run
 * them and re-dispatch feedback events.
 */
import type { EffectRequest } from 'dg-cell-mvi-core';
import type { FormMode } from './state';

export const CRUD_EFFECT = {
  pageRequest: 'crud.fx.pageRequest',
  addRequest: 'crud.fx.addRequest',
  editRequest: 'crud.fx.editRequest',
  /** the submit hook chain (beforeValidate → async validate → beforeSubmit → doSubmit → afterSubmit → onSuccess). */
  submitChain: 'crud.fx.submitChain',
  /** the remove hook chain (beforeRemove → doRemove|delRequest → afterRemove → onRemoved). */
  removeChain: 'crud.fx.removeChain',
  delRequest: 'crud.fx.delRequest',
  infoRequest: 'crud.fx.infoRequest',
  loadDict: 'crud.fx.loadDict',
  /** re-check the current form's async-compute fields (options-on-watch) and fetch when watch changed. */
  resolveAsyncCompute: 'crud.fx.resolveAsyncCompute',
  /** run a changed field's column-level `valueChange` linkage (may set OTHER fields). */
  valueChange: 'crud.fx.valueChange',
  confirmRemove: 'crud.fx.confirmRemove',
  notify: 'crud.fx.notify',
  /** read persisted column settings from storage on init (re-dispatches columnsFilterLoaded). */
  loadColumnsFilter: 'crud.fx.loadColumnsFilter',
  /** write the current column-settings slice to storage (keyed by table.id). */
  persistColumnsFilter: 'crud.fx.persistColumnsFilter',
  /** read a saved form draft from storage on open (on accept of the restore confirm → setFormData). */
  loadFormDraft: 'crud.fx.loadFormDraft',
  /** write the current form data to storage as a draft (keyed by the form id). */
  persistFormDraft: 'crud.fx.persistFormDraft',
  /** remove a saved form draft from storage (on successful submit). */
  clearFormDraft: 'crud.fx.clearFormDraft',
  editableUpdateRow: 'crud.fx.editableUpdateRow',
  editableUpdateCell: 'crud.fx.editableUpdateCell',
} as const;

export type CrudEffectType = (typeof CRUD_EFFECT)[keyof typeof CRUD_EFFECT];

function fx<P extends object>(type: string, payload: P): EffectRequest<P> {
  return { type, payload } as EffectRequest<P>;
}

export const pageRequestEffect = (query: any) => fx(CRUD_EFFECT.pageRequest, { query });
export const addRequestEffect = (p: { form: Record<string, any> }) => fx(CRUD_EFFECT.addRequest, p);
export const editRequestEffect = (p: { form: Record<string, any>; row: any }) =>
  fx(CRUD_EFFECT.editRequest, p);
export const submitChainEffect = (p: {
  form: Record<string, any>;
  row: any;
  mode: FormMode;
  initialForm: Record<string, any>;
}) => fx(CRUD_EFFECT.submitChain, p);
/**
 * The remove hook chain (the impure boundary, mirroring submitChain). The handler awaits user remove
 * hooks in order — beforeRemove (gate) → doRemove(or delRequest) → afterRemove → onRemoved — and
 * re-dispatches the terminal feedback (removeSucceeded | removeFailed | removeAborted). `rows` is the
 * current page rows the reducer passes through so the chain can hand them to the hooks.
 */
export const removeChainEffect = (p: { row: any; index?: number; rows?: any[] }) =>
  fx(CRUD_EFFECT.removeChain, p);
export const delRequestEffect = (p: { row: any; index?: number }) => fx(CRUD_EFFECT.delRequest, p);
export const infoRequestEffect = (p: { mode: FormMode; row: any; index: number | null }) =>
  fx(CRUD_EFFECT.infoRequest, p);
export const loadDictEffect = (p: { dictId: string; value?: any }) => fx(CRUD_EFFECT.loadDict, p);
/**
 * Re-check async-compute fields for the current form: the handler computes each field's `watch(scope)`
 * from the live form and, when it differs from the stored `watchKey`, runs `asyncFn` and re-dispatches
 * `asyncComputeResolved`. Emitted by formOpened / setFormField (the only form mutations that can move a
 * watched value). All IO stays at this boundary so the reducer is pure.
 */
export const resolveAsyncComputeEffect = (p: {
  form: Record<string, any>;
  mode: FormMode;
  row: any;
  index: number | null;
}) => fx(CRUD_EFFECT.resolveAsyncCompute, p);
/**
 * Run a field's column-level `valueChange` linkage at the effect boundary (the reducer is pure). The
 * handler reads the current `form` and may set OTHER fields — each collected change is re-dispatched
 * as a `setFormField` with `fromValueChange: true`. `fromValueChange` here is the LOOP GUARD: when the
 * triggering write itself came from a valueChange, the handler skips entirely (one-level linkage).
 * `immediate` flags the formOpened path (run a field's `immediate` valueChange against the initial value).
 */
export const valueChangeEffect = (p: {
  /** the changed field key; null on the formOpened `immediate` sweep (scan all `immediate` fields). */
  key: string | null;
  form: Record<string, any>;
  mode: FormMode;
  /** true when this write was produced by a valueChange (skip — no cascade). */
  fromValueChange?: boolean;
  /** true when triggered by formOpened (run only `immediate` valueChange handlers). */
  immediate?: boolean;
}) => fx(CRUD_EFFECT.valueChange, p);
export const confirmRemoveEffect = (p: { row?: any; index?: number }) =>
  fx(CRUD_EFFECT.confirmRemove, p);
/** read storage[`crud:columnsFilter:<table.id>`] and re-dispatch columnsFilterLoaded with the parsed overrides. */
export const loadColumnsFilterEffect = () => fx(CRUD_EFFECT.loadColumnsFilter, {});
/** write the (just-folded) column-settings overrides to storage; all IO stays at this boundary. */
export const persistColumnsFilterEffect = (p: { overrides: Record<string, any> }) =>
  fx(CRUD_EFFECT.persistColumnsFilter, p);
/** read storage[`crud:formDraft:<id>`]; on accept of the restore confirm, re-dispatch setFormData(draft). */
export const loadFormDraftEffect = (p: { id?: string }) => fx(CRUD_EFFECT.loadFormDraft, p);
/** write the current form data to storage as a draft (keyed by the form id); all IO at this boundary. */
export const persistFormDraftEffect = (p: { id?: string; form: Record<string, any> }) =>
  fx(CRUD_EFFECT.persistFormDraft, p);
/** remove a saved form draft from storage (on successful submit). */
export const clearFormDraftEffect = (p: { id?: string }) => fx(CRUD_EFFECT.clearFormDraft, p);
export const notifyEffect = (p: { kind: 'success' | 'error' | 'warning'; message: string }) =>
  fx(CRUD_EFFECT.notify, p);
export const editableUpdateRowEffect = (p: { rowId: any; index: number; row: any; isAdd: boolean }) =>
  fx(CRUD_EFFECT.editableUpdateRow, p);
export const editableUpdateCellEffect = (p: { rowId: any; index: number; key: string; value: any; row: any }) =>
  fx(CRUD_EFFECT.editableUpdateCell, p);
