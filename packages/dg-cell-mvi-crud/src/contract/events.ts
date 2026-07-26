/**
 * dg-cell-mvi-crud · contract/events — the CRUD AppEvent vocabulary.
 *
 * `'<slice>.<verb>'`. `expose.*` methods become commands; request results become feedback events
 * (re-dispatched by effect handlers). Wrap data in payload; never flatten.
 */
import type { AppEvent } from 'dg-cell-mvi-core';
import type { ColumnsFilterOverrides } from './crudOptions';
import type {
  DictRequestCorrelation,
  DictSerializableRecord,
  DictSerializableValue,
} from './dict';
import type { FormMode, SortState } from './state';

export const CRUD_EVENT = {
  // list commands
  doRefresh: 'crud.doRefresh',
  doSearch: 'crud.doSearch',
  setSearchField: 'crud.setSearchField',
  setSearchForm: 'crud.setSearchForm',
  resetSearch: 'crud.resetSearch',
  toggleSearch: 'crud.toggleSearch',
  setPage: 'crud.setPage',
  setPageSize: 'crud.setPageSize',
  setSort: 'crud.setSort',
  select: 'crud.select',
  setTableData: 'crud.setTableData',
  /** tabs quick-filter: pick the active tab (filters the list by config.tabs.name). */
  setActiveTab: 'crud.setActiveTab',

  // form commands
  openAdd: 'crud.openAdd',
  openEdit: 'crud.openEdit',
  openView: 'crud.openView',
  openCopy: 'crud.openCopy',
  setFormField: 'crud.setFormField',
  /** replace the whole form data (used to restore a saved draft). */
  setFormData: 'crud.setFormData',
  doSubmit: 'crud.doSubmit',
  closeForm: 'crud.closeForm',

  // remove command
  doRemove: 'crud.doRemove',

  // dict commands
  loadDict: 'crud.loadDict',
  refreshDict: 'crud.refreshDict',
  invalidateDict: 'crud.invalidateDict',
  hydrateDict: 'crud.hydrateDict',
  searchDict: 'crud.searchDict',

  // async-compute feedback (options-on-watch resolved at the effect boundary)
  asyncComputeResolved: 'crud.asyncComputeResolved',

  // toolbar
  setCompact: 'crud.setCompact',

  // columns-filter (column settings: show/fixed/order)
  setColumnsFilter: 'crud.setColumnsFilter',
  resetColumnsFilter: 'crud.resetColumnsFilter',
  loadColumnsFilter: 'crud.loadColumnsFilter',
  /** the persisted column settings were read from storage on init (seed). */
  columnsFilterLoaded: 'crud.columnsFilterLoaded',

  // editable commands
  editableEnable: 'crud.editableEnable',
  editableDisable: 'crud.editableDisable',
  editableStartRowEdit: 'crud.editableStartRowEdit',
  editableStartCellEdit: 'crud.editableStartCellEdit',
  editableSetCellValue: 'crud.editableSetCellValue',
  /** programmatic update-cell.setValue) — by rowId OR index. */
  editableUpdateCell: 'crud.editableUpdateCell',
  editableSaveRow: 'crud.editableSaveRow',
  editableSaveCell: 'crud.editableSaveCell',
  editableSaveAll: 'crud.editableSaveAll',
  editableCancelRow: 'crud.editableCancelRow',
  editableCancelCell: 'crud.editableCancelCell',
  editableAddRow: 'crud.editableAddRow',
  editableRemoveRow: 'crud.editableRemoveRow',

  // editable feedback
  editableSaveRowSucceeded: 'crud.editableSaveRowSucceeded',
  editableSaveRowFailed: 'crud.editableSaveRowFailed',
  editableSaveCellSucceeded: 'crud.editableSaveCellSucceeded',
  editableSaveCellFailed: 'crud.editableSaveCellFailed',

  // feedback events
  refreshSucceeded: 'crud.refreshSucceeded',
  refreshFailed: 'crud.refreshFailed',
  formOpened: 'crud.formOpened',
  submitSucceeded: 'crud.submitSucceeded',
  submitFailed: 'crud.submitFailed',
  submitAborted: 'crud.submitAborted',
  removeSucceeded: 'crud.removeSucceeded',
  removeFailed: 'crud.removeFailed',
  removeAborted: 'crud.removeAborted',
  dictLoaded: 'crud.dictLoaded',
  dictLoadFailed: 'crud.dictLoadFailed',
} as const;

export type CrudEventType = (typeof CRUD_EVENT)[keyof typeof CRUD_EVENT];

function ev<P extends object>(type: string, payload: P): AppEvent<P> {
  return { type, payload } as AppEvent<P>;
}

// ---- list commands ----
export const doRefresh = (p: { goFirstPage?: boolean; silence?: boolean; scrollTop?: boolean } = {}) =>
  ev(CRUD_EVENT.doRefresh, p);
export const doSearch = (p: { form?: Record<string, any>; goFirstPage?: boolean; mergeForm?: boolean } = {}) =>
  ev(CRUD_EVENT.doSearch, p);
export const setSearchField = (key: string, value: any) => ev(CRUD_EVENT.setSearchField, { key, value });
export const setSearchForm = (p: { form: Record<string, any>; mergeForm?: boolean; triggerSearch?: boolean }) =>
  ev(CRUD_EVENT.setSearchForm, p);
export const resetSearch = () => ev(CRUD_EVENT.resetSearch, {});
export const toggleSearch = () => ev(CRUD_EVENT.toggleSearch, {});
export const setPage = (currentPage: number) => ev(CRUD_EVENT.setPage, { currentPage });
export const setPageSize = (pageSize: number) => ev(CRUD_EVENT.setPageSize, { pageSize });
export const setSort = (p: SortState & { isServerSort?: boolean }) => ev(CRUD_EVENT.setSort, p);
export const select = (rowKeys: any[]) => ev(CRUD_EVENT.select, { rowKeys });
export const setTableData = (rows: any[]) => ev(CRUD_EVENT.setTableData, { rows });
/** pick the active tab (tabs quick-filter): sets tabs.active, resets to page 1, refetches. */
export const setActiveTab = (value: any) => ev(CRUD_EVENT.setActiveTab, { value });

// ---- form commands ----
export const openAdd = (p: { row?: any } = {}) => ev(CRUD_EVENT.openAdd, p);
export const openEdit = (p: { row?: any; index?: number }) => ev(CRUD_EVENT.openEdit, p);
export const openView = (p: { row?: any; index?: number }) => ev(CRUD_EVENT.openView, p);
export const openCopy = (p: { row?: any; index?: number }) => ev(CRUD_EVENT.openCopy, p);
/**
 * Set a form field. `fromValueChange: true` marks a write produced BY a `valueChange` linkage — the
 * valueChange effect skips such writes (the loop guard: linkage is one level, set fields do not
 * cascade back into valueChange). The reducer ignores the flag (it just writes the field value).
 */
export const setFormField = (key: string, value: any, fromValueChange?: boolean) =>
  ev(CRUD_EVENT.setFormField, fromValueChange ? { key, value, fromValueChange } : { key, value });
/**
 * Replace the entire form data (port of restoring a saved draft). The reducer overwrites `form.form`
 * and resets `initial` to the supplied data so the restored draft is the new dirty baseline.
 */
export const setFormData = (form: Record<string, any>) => ev(CRUD_EVENT.setFormData, { form });
export const doSubmit = () => ev(CRUD_EVENT.doSubmit, {});
export const closeForm = () => ev(CRUD_EVENT.closeForm, {});

// ---- remove command ----
export const doRemove = (p: { row?: any; index?: number; noConfirm?: boolean }) =>
  ev(CRUD_EVENT.doRemove, p);

// ---- dict commands ----
export interface DictCommandContext {
  dictId: string;
  providerId?: string;
  scope?: string;
  context?: DictSerializableRecord;
}

export const loadDict = (
  p: DictCommandContext & {
    /** Legacy selected value; normalized to a hydrate value list only by explicit hydrateDict. */
    value?: any;
    /** Legacy refresh spelling retained as an alias for force-refresh load semantics. */
    reload?: boolean;
  },
) =>
  ev(CRUD_EVENT.loadDict, p);
export const refreshDict = (p: DictCommandContext) => ev(CRUD_EVENT.refreshDict, p);
export const invalidateDict = (p: {
  dictId: string;
  scope?: string;
  cacheKey?: string;
}) =>
  ev(CRUD_EVENT.invalidateDict, p);
export const hydrateDict = (
  p: DictCommandContext & { values: DictSerializableValue[] },
) => ev(CRUD_EVENT.hydrateDict, p);
export const searchDict = (p: DictCommandContext & { query: string }) =>
  ev(CRUD_EVENT.searchDict, p);

// ---- toolbar ----
export const setCompact = (value: boolean) => ev(CRUD_EVENT.setCompact, { value });

// ---- columns-filter (column settings) ----
/** merge column-settings overrides (show/fixed/order) into the slice (per column key). */
export const setColumnsFilter = (overrides: ColumnsFilterOverrides) =>
  ev(CRUD_EVENT.setColumnsFilter, { overrides });
/** clear all column-settings overrides (back to config defaults). */
export const resetColumnsFilter = () => ev(CRUD_EVENT.resetColumnsFilter, {});
/** command fired on mount (when storage is enabled) → the effect reads storage + re-dispatches columnsFilterLoaded. */
export const loadColumnsFilter = () => ev(CRUD_EVENT.loadColumnsFilter, {});
/** feedback: the persisted overrides read from storage seed the slice (replace, not merge). */
export const columnsFilterLoaded = (overrides: ColumnsFilterOverrides) =>
  ev(CRUD_EVENT.columnsFilterLoaded, { overrides });

// ---- editable commands ----
export const editableEnable = (
  p: { mode?: 'free' | 'row' | 'cell'; exclusive?: boolean; exclusiveEffect?: 'cancel' | 'save'; activeDefault?: boolean } = {},
) => ev(CRUD_EVENT.editableEnable, p);
export const editableDisable = () => ev(CRUD_EVENT.editableDisable, {});
export const editableStartRowEdit = (p: { rowId: any; index: number }) =>
  ev(CRUD_EVENT.editableStartRowEdit, p);
export const editableStartCellEdit = (p: { rowId: any; index: number; key: string }) =>
  ev(CRUD_EVENT.editableStartCellEdit, p);
export const editableSetCellValue = (p: { rowId: any; key: string; value: any }) =>
  ev(CRUD_EVENT.editableSetCellValue, p);
/**
 * Programmatically update an editable cell's value (the MVI counterpart of the reference crud's ref API
 * `crudExpose.getEditableCell(...).setValue(...)`). Identify the cell by `rowId` OR by `index`
 * (`index` resolves to a rowId via the table rowKey); set its draft `value` for `colKey`. The
 * reducer ALSO marks the cell editing (so free/row save validates it) — purely into the buffer.
 */
export const editableUpdateCell = (p: { rowId?: any; index?: number; colKey: string; value: any }) =>
  ev(CRUD_EVENT.editableUpdateCell, p);
export const editableSaveRow = (p: { rowId: any; index: number }) =>
  ev(CRUD_EVENT.editableSaveRow, p);
export const editableSaveCell = (p: { rowId: any; index: number; key: string }) =>
  ev(CRUD_EVENT.editableSaveCell, p);
export const editableSaveAll = () => ev(CRUD_EVENT.editableSaveAll, {});
export const editableCancelRow = (p: { rowId: any; index: number }) =>
  ev(CRUD_EVENT.editableCancelRow, p);
export const editableCancelCell = (p: { rowId: any; key: string }) =>
  ev(CRUD_EVENT.editableCancelCell, p);
export const editableAddRow = (p: { row?: Record<string, any> } = {}) =>
  ev(CRUD_EVENT.editableAddRow, p);
export const editableRemoveRow = (p: { rowId: any; index: number }) =>
  ev(CRUD_EVENT.editableRemoveRow, p);

// ---- editable feedback ----
export const editableSaveRowSucceeded = (p: { rowId: any; index: number; row?: any }) =>
  ev(CRUD_EVENT.editableSaveRowSucceeded, p);
export const editableSaveRowFailed = (p: { rowId: any; error: string }) =>
  ev(CRUD_EVENT.editableSaveRowFailed, p);
export const editableSaveCellSucceeded = (p: { rowId: any; index: number; key: string; value: any; row?: any }) =>
  ev(CRUD_EVENT.editableSaveCellSucceeded, p);
export const editableSaveCellFailed = (p: { rowId: any; key: string; error: string }) =>
  ev(CRUD_EVENT.editableSaveCellFailed, p);

// ---- feedback events ----
export const refreshSucceeded = (p: {
  rows: any[];
  currentPage: number;
  pageSize: number;
  total: number;
}) => ev(CRUD_EVENT.refreshSucceeded, p);
export const refreshFailed = (p: { error: string }) => ev(CRUD_EVENT.refreshFailed, p);
export const formOpened = (p: { mode: FormMode; row: any; initialForm: Record<string, any>; index: number | null }) =>
  ev(CRUD_EVENT.formOpened, p);
export const submitSucceeded = (p: { res: any; mode: FormMode }) => ev(CRUD_EVENT.submitSucceeded, p);
export const submitFailed = (p: { error: string }) => ev(CRUD_EVENT.submitFailed, p);
/**
 * The hook chain (or async validation) aborted the submit: keep the form open, drop submitStatus
 * back to idle, and surface any field-level `errors` (async validator failures). Distinct from
 * `submitFailed` (a request error → status 'error') per delta case before-submit-abort.
 */
export const submitAborted = (p: { errors?: Record<string, string>; reason?: string } = {}) =>
  ev(CRUD_EVENT.submitAborted, p);
export const removeSucceeded = (p: { index?: number; row?: any; res?: any }) =>
  ev(CRUD_EVENT.removeSucceeded, p);
export const removeFailed = (p: { error: string }) => ev(CRUD_EVENT.removeFailed, p);
/**
 * The remove hook chain aborted (beforeRemove returned false/threw): no delRequest, no refresh. The
 * local-mode splice already happened in the doRemove reducer, so this is a no-op fold (the chain just
 * stops). Distinct from `removeFailed` (a request error → an error notify). Mirrors `submitAborted`.
 */
export const removeAborted = (p: { reason?: string } = {}) => ev(CRUD_EVENT.removeAborted, p);
export type DictLoadedResult = DictRequestCorrelation & { nodes: any[] };
export type DictFailedResult = DictRequestCorrelation & { error: string };

/** @deprecated Correlated results are required while a request is active. */
export interface LegacyDictLoadedResult {
  dictId: string;
  data: any[];
}

/** @deprecated Correlated results are required while a request is active. */
export interface LegacyDictFailedResult {
  dictId: string;
  error: string;
}

export function dictLoaded(p: DictLoadedResult): AppEvent<DictLoadedResult>;
export function dictLoaded(p: LegacyDictLoadedResult): AppEvent<LegacyDictLoadedResult>;
export function dictLoaded(
  p: DictLoadedResult | LegacyDictLoadedResult,
): AppEvent<DictLoadedResult | LegacyDictLoadedResult> {
  return ev(CRUD_EVENT.dictLoaded, p);
}

export function dictLoadFailed(p: DictFailedResult): AppEvent<DictFailedResult>;
export function dictLoadFailed(p: LegacyDictFailedResult): AppEvent<LegacyDictFailedResult>;
export function dictLoadFailed(
  p: DictFailedResult | LegacyDictFailedResult,
): AppEvent<DictFailedResult | LegacyDictFailedResult> {
  return ev(CRUD_EVENT.dictLoadFailed, p);
}
/**
 * An async-compute field's `asyncFn` resolved (options fetched on a watched key). `key` is the form
 * field, `watchKey` the stable key of the watched value it ran against (re-runs only when this
 * changes — the loop guard), `value` the resolved result the projector injects as the field options.
 */
export const asyncComputeResolved = (p: { key: string; watchKey: string; value: any }) =>
  ev(CRUD_EVENT.asyncComputeResolved, p);
