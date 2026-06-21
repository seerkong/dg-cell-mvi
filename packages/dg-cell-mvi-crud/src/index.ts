/**
 * dg-cell-mvi-crud — framework-agnostic CRUD model + behavior on dg-cell-mvi-core.
 *
 * Public surface: the crudOptions authoring contract, the command creators (CRUD_EVENT), and
 * createCrudStore (produces a store whose viewModel is a CrudBinding). The Vue view layer binds it.
 */
export * from './contract/crudOptions';
export type {
  CrudState,
  CrudStateSeed,
  ListSlice,
  SearchSlice,
  TabsSlice,
  FormSlice,
  DictSlice,
  DictEntry,
  EditableSlice,
  EditableRowState,
  ColumnsFilterSlice,
  PageState,
  SortState,
  FormMode,
  ListStatus,
  SubmitStatus,
  DictStatus,
} from './contract/state';
export { createInitialCrudState } from './contract/state';

export { CRUD_EVENT } from './contract/events';
export type { CrudEventType } from './contract/events';
export * as commands from './contract/events';
// named command creators (also available via the `commands` namespace)
export {
  doRefresh,
  doSearch,
  setSearchField,
  setSearchForm,
  resetSearch,
  toggleSearch,
  setPage,
  setPageSize,
  setSort,
  select,
  setTableData,
  setActiveTab,
  openAdd,
  openEdit,
  openView,
  openCopy,
  setFormField,
  doSubmit,
  closeForm,
  doRemove,
  loadDict,
  setCompact,
  editableEnable,
  editableDisable,
  editableStartRowEdit,
  editableStartCellEdit,
  editableSetCellValue,
  editableUpdateCell,
  editableSaveRow,
  editableSaveCell,
  editableSaveAll,
  editableCancelRow,
  editableCancelCell,
  editableAddRow,
  editableRemoveRow,
  setColumnsFilter,
  resetColumnsFilter,
  loadColumnsFilter,
} from './contract/events';

export { CRUD_EFFECT } from './contract/effects';
export type { CrudEffectType } from './contract/effects';

export { createCrudStore } from './contract/store';
export type { CrudStore, CreateCrudStoreOptions } from './contract/store';

export { reduceCrud } from './logic/reducers';
export { reduceEditable } from './logic/reducers/editable';
export { projectCrudBinding, projectTabs } from './logic/projectors';
export type {
  CrudBinding,
  ResolvedTableColumn,
  ResolvedSearchColumn,
  TableEditableBinding,
  ColumnsFilterBinding,
  ColumnsFilterItem,
  TabsBinding,
  TabOption,
} from './logic/projectors';

export { buildNormalizedOptions } from './support/optionsBuild';
export type {
  NormalizedCrudOptions,
  NormalizedColumn,
  NormalizedTabs,
  NormalizeInjections,
} from './support/optionsBuild';
export type { CrudUiPort } from './support/requestEffects';

// ---- injected i18n translator port (built-in chrome localization) ----
export { resolveT, I18N_KEY } from './support/i18n';
export type { CrudTranslator, I18nKey } from './support/i18n';

// ---- extended viewModel types (re-exported once via projectors.ts) ----
export type {
  ResolvedFormItem,
  ResolvedButton,
  ButtonGroupRun,
  RowHandleBinding,
  RemoveBinding,
  ActionbarBinding,
  ToolbarBinding,
} from './logic/projectors';

// ---- form slice ----
export { reduceForm } from './logic/reducers/form';
export { projectForm, projectFormColumns, pickFormColumns } from './logic/projectors/form';
export { validateForm } from './support/validate';
export { doValueBuilder, doValueResolve, buildInitialForm } from './support/valueTransforms';

// ---- export column selection (per-column exportable gate, flattens header groups to leaves) ----
export { exportColumns } from './support/exportColumns';

// ---- remove + buttons slice ----
export { reduceRemove } from './logic/reducers/remove';
export { projectRowHandle, projectActionbar, projectToolbar } from './logic/projectors/buttons';

// ---- columns-filter slice (column settings + storage persistence) ----
export { reduceColumnsFilter } from './logic/reducers/columnsFilter';
export {
  createColumnsFilterEffects,
  columnsFilterStorageKey,
} from './support/columnsFilterEffects';
export type { ColumnsFilterStoragePort } from './support/columnsFilterEffects';

// ---- form-draft (saveDraft) storage ----
export { createFormDraftEffects, formDraftStorageKey } from './support/formDraftEffects';
export type { FormDraftStoragePort } from './support/formDraftEffects';

// ---- dict + compute ----
export {
  compute,
  asyncCompute,
  ComputeValue,
  AsyncComputeValue,
  isSyncCompute,
  isAsyncCompute,
  resolveCompute,
} from './support/compute';
export type { ComputeScope, ComputeFn } from './support/compute';
export { createDictRegistry, getSharedDictRegistry, resetSharedDictRegistry } from './support/dictRegistry';
export type { DictRegistry, DictConfig, DictRequest, DictLoadContext, DictOnReadyContext } from './support/dictRegistry';
export { createDictEffects } from './support/dictEffects';
export { reduceDict } from './logic/reducers/dict';
export { dict, isDict, getNodesFromDataMap, getLabelsFromDataMap } from './logic/projectors/compute';
export type { DictFieldNames } from './logic/projectors/compute';
