/**
 * dg-cell-mvi-crud · contract/state — the immutable CrudState atom.
 *
 * the reference crud's deeply-mutated `crudBinding` is split here into (a) normalized authoring config held
 * in the store closure (never changes) and (b) this runtime state. Only runtime data lives in the
 * reactive atom; the projector combines config + state into the CrudBinding viewModel.
 */
import type {
  ColumnsFilterOverrides,
  CrudMode,
  EditableActiveTrigger,
  EditableMode,
} from './crudOptions';

export type FormMode = 'add' | 'edit' | 'view';
export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SubmitStatus = 'idle' | 'submitting' | 'saved' | 'error';
export type DictStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface PageState {
  currentPage: number;
  pageSize: number;
  total: number;
  pageSizes: number[];
}

export interface SortState {
  prop?: string;
  order?: 'asc' | 'desc' | null;
  asc?: boolean;
}

export interface ListSlice<R = any> {
  status: ListStatus;
  rows: R[];
  error: string | null;
  page: PageState;
  sort: SortState;
  selectedRowKeys: any[];
}

export interface SearchSlice {
  show: boolean;
  collapse: boolean;
  form: Record<string, any>;
  validatedForm: Record<string, any>;
}

/**
 * Tabs quick-filter runtime slice. Only the active tab value
 * is runtime state — the bar's name/type/options are static config (resolved in the projector). When
 * `active` equals the all-sentinel (config.tabs addAll value, default TABS_ALL) NO list filter is
 * applied; otherwise the query merges `{ [config.tabs.name]: active }`.
 */
export interface TabsSlice {
  active: any;
}

export interface FormSlice<R = any> {
  open: boolean;
  mode: FormMode;
  title: string;
  initialForm: Record<string, any>;
  /**
   * Dirty-tracking snapshot (P5): a deep clone of `form` taken when the dialog opens (formOpened). The
   * projector derives `form.dirty = !isEqual(form, initial)` so the view's saveRemind close-guard can
   * tell whether anything changed. Distinct from `initialForm` (the submit-chain baseline) so a draft
   * restore can rewrite `initial` to the restored values without disturbing the submit baseline.
   */
  initial: Record<string, any>;
  form: Record<string, any>;
  submitStatus: SubmitStatus;
  valid: boolean;
  errors: Record<string, string>;
  submitError: string | null;
  index: number | null;
  row: R | null;
  res?: any;
}

export interface DictEntry {
  status: DictStatus;
  data: any[];
  dataMap: Record<string, any>;
  error: string | null;
}
export type DictSlice = Record<string, DictEntry>;

/** Per-row inline-edit state: which cells are editing, their drafts, the pre-edit snapshot + errors. */
export interface EditableRowState {
  /** a new (unsaved) row vs an existing one. */
  isAdd: boolean;
  /** { [columnKey]: true } for cells currently in edit. */
  editing: Record<string, boolean>;
  /** { [columnKey]: value } — the live edited values. */
  draft: Record<string, any>;
  /** { [columnKey]: value } — pre-edit snapshot, restored on cancel. */
  original: Record<string, any>;
  /** { [columnKey]: message } — per-cell validation errors (`_global` for row-level). */
  errors: Record<string, string>;
  /** a save is in flight (api persist). */
  loading: boolean;
}

/** Inline-editing runtime slice. Config (mode/exclusive/...) is seeded from normalized options. */
export interface EditableSlice {
  enabled: boolean;
  mode: EditableMode;
  exclusive: boolean;
  exclusiveEffect: 'cancel' | 'save';
  activeDefault: boolean;
  /** whole-table read-only: no cell becomes editable (still enabled config-wise). */
  readonly: boolean;
  /** cell mode: gesture that activates a cell's inline editor ('click' | 'dblclick'). */
  activeTrigger: EditableActiveTrigger;
  /** rowId (String) -> per-row edit state. */
  rowStates: Record<string, EditableRowState>;
  /** strictly-decreasing id source for new (unsaved) rows. */
  newRowSeq: number;
  /** cell mode: the active cell as `"<rowId>::<key>"` (or null). */
  activeKey: string | null;
}

/**
 * Resolved async-compute slice — one entry per form field whose component option is an
 * `AsyncComputeValue`. Keyed by form field key. `watchKey` is
 * the last watched value the `asyncFn` ran against (a JSON-stable key); a change re-runs the fetch at
 * the effect boundary. `value` is the resolved result the projector injects as the field's options.
 */
export interface AsyncComputeEntry {
  watchKey: string;
  value: any;
  loading: boolean;
}
export type AsyncComputeSlice = Record<string, AsyncComputeEntry>;

/**
 * Column-settings overrides keyed by column key.
 * Seeded `{}`; `setColumnsFilter` merges, `resetColumnsFilter` clears. The projector reads each
 * column's override (effective = override ?? column config default) to drop hidden columns and apply
 * fixed/order. With `table.id` + `toolbar.columnsFilter.storage`, an effect persists this to storage.
 */
export type ColumnsFilterSlice = ColumnsFilterOverrides;

export interface CrudState<R = any> {
  mode: CrudMode;
  list: ListSlice<R>;
  search: SearchSlice;
  /** tabs quick-filter active value (the all-sentinel = no filter). */
  tabs: TabsSlice;
  form: FormSlice<R>;
  dict: DictSlice;
  editable: EditableSlice;
  /** resolved async-compute values (options fetched on a watched key), keyed by form field. */
  computeAsync: AsyncComputeSlice;
  /** column-settings overrides (show/fixed/order) keyed by column key. */
  columnsFilter: ColumnsFilterSlice;
  ui: { toolbarCompact: boolean; exporting: boolean };
}

export interface CrudStateSeed {
  mode: CrudMode;
  pageSize: number;
  pageSizes: number[];
  searchInitialForm: Record<string, any>;
  searchShow: boolean;
  /** the tabs quick-filter initial active value (addAll sentinel, else first option, else undefined). */
  tabsActive: any;
  editable: {
    enabled: boolean;
    mode: EditableMode;
    exclusive: boolean;
    exclusiveEffect: 'cancel' | 'save';
    activeDefault: boolean;
    readonly: boolean;
    activeTrigger: EditableActiveTrigger;
  };
}

export function createInitialCrudState<R = any>(seed: CrudStateSeed): CrudState<R> {
  return {
    mode: seed.mode,
    list: {
      status: 'idle',
      rows: [],
      error: null,
      page: { currentPage: 1, pageSize: seed.pageSize, total: 0, pageSizes: seed.pageSizes },
      sort: {},
      selectedRowKeys: [],
    },
    search: {
      show: seed.searchShow,
      collapse: false,
      form: { ...seed.searchInitialForm },
      validatedForm: { ...seed.searchInitialForm },
    },
    tabs: { active: seed.tabsActive },
    form: {
      open: false,
      mode: 'add',
      title: '',
      initialForm: {},
      initial: {},
      form: {},
      submitStatus: 'idle',
      valid: true,
      errors: {},
      submitError: null,
      index: null,
      row: null,
    },
    dict: {},
    editable: {
      enabled: seed.editable.enabled,
      mode: seed.editable.mode,
      exclusive: seed.editable.exclusive,
      exclusiveEffect: seed.editable.exclusiveEffect,
      activeDefault: seed.editable.activeDefault,
      readonly: seed.editable.readonly,
      activeTrigger: seed.editable.activeTrigger,
      rowStates: {},
      newRowSeq: -1,
      activeKey: null,
    },
    computeAsync: {},
    columnsFilter: {},
    ui: { toolbarCompact: false, exporting: false },
  };
}
