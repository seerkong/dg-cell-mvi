/**
 * dg-cell-mvi-crud · contract/crudOptions — the PUBLIC authoring contract.
 *
 * Kept intentionally close to the reference crud's crudOptions so authoring is familiar (request / columns /
 * pagination / table / form / search / rowHandle / toolbar). This is plain config data; the runtime
 * turns it into an immutable CrudState + a projected CrudBinding viewModel. Permissive by design —
 * unknown extra props pass through to the component layer.
 */
import type { DictConfig } from '../support/dictRegistry';

/** A column cell / form scope handed to compute() and value hooks. */
export interface CrudScope<R = any> {
  row?: R;
  form?: Record<string, any>;
  index?: number;
  key?: string;
  value?: any;
  mode?: string;
  [k: string]: any;
}

/**
 * Whatever a user render-hook returns — a VNode / string / number / array / null. Kept opaque
 * (`any`) on purpose: the agnostic crud package must NEVER create or call render fns (they would
 * produce framework VNodes); it only carries the fn ref through to the Vue layer, which calls it.
 */
export type VNodeLike = any;

/**
 * Scope handed to a TABLE-CELL render hook (`column.cellRender`). Same shape the per-row compute
 * boundary builds in DgCell — `{ row, index, value, key }` (plus any extra compute scope fields).
 */
export interface CellRenderScope<R = any> extends CrudScope<R> {
  row?: R;
  index?: number;
  value?: any;
  key?: string;
}

/**
 * Scope handed to a FORM-ITEM render hook (`form.render` / prefix / suffix / top / bottom /
 * conditionalRender). `form` is the live form data, `mode` the dialog mode, `key`/`value` the field.
 */
export interface FormItemRenderScope<R = any> {
  form: Record<string, any>;
  mode: 'add' | 'edit' | 'view';
  key: string;
  value: any;
  [k: string]: any;
}

/** A form-item render hook: receives the live form-item scope and returns opaque render output. */
export type FormItemRenderHook<R = any> = (scope: FormItemRenderScope<R>) => VNodeLike;

/**
 * `conditionalRender` on a form item: when `match(scope)` is true for the live form scope, the Vue
 * layer renders `render(scope)` in place of the default component. `match` is evaluated live in the
 * view (never in the agnostic projector) and `render` returns opaque view output.
 */
export interface ConditionalRender<R = any> {
  match: (scope: FormItemRenderScope<R>) => boolean;
  render: FormItemRenderHook<R>;
}

/**
 * Scope handed to a column-level `valueChange` handler — the field linkage boundary. `setValue`
 * collects writes to OTHER fields (applied as `setFormField` after the handler), `getValue` reads
 * the current form. Built with the live form data at the effect boundary (so it stays MVI-pure).
 */
export interface ValueChangeScope<R = any> {
  key: string;
  value: any;
  form: Record<string, any>;
  mode: 'add' | 'edit' | 'view';
  setValue: (key: string, value: any) => void;
  getValue: (key: string) => any;
  [k: string]: any;
}

/**
 * Column-level `valueChange`: a handler run when this field's
 * value changes in the form, which may set OTHER fields (linkage). Either a bare handler, or an
 * object form with `immediate` (also run once when the form opens). A handler returning a plain
 * object has its entries merged into the collected changes (alternative to calling `setValue`).
 */
export type ValueChangeHandler<R = any> = (scope: ValueChangeScope<R>) => void | Record<string, any>;
export type ValueChange<R = any> =
  | ValueChangeHandler<R>
  | { immediate?: boolean; handle: ValueChangeHandler<R> };

export interface PageQuery<R = any> {
  page: { currentPage: number; pageSize: number };
  form: Record<string, any>;
  sort: SortQuery;
}
export interface SortQuery {
  prop?: string;
  order?: 'asc' | 'desc' | null;
  asc?: boolean;
}
export interface PageRes<R = any> {
  records: R[];
  currentPage?: number;
  pageSize?: number;
  total?: number;
}

export interface RequestProp<R = any> {
  /** page list. Receives the (transformed) query, returns the (untransformed) backend res. */
  pageRequest?: (query: any) => Promise<any>;
  addRequest?: (ctx: { form: Record<string, any> }) => Promise<any>;
  editRequest?: (ctx: { form: Record<string, any>; row: R }) => Promise<any>;
  delRequest?: (ctx: { row: R; index?: number }) => Promise<any>;
  infoRequest?: (ctx: { mode: string; row: R }) => Promise<R>;
  /** {page,form,sort} -> backend query shape (e.g. limit/offset). */
  transformQuery?: (query: PageQuery<R>) => any;
  /** backend res -> { records, currentPage, pageSize, total }. */
  transformRes?: (ctx: { res: any; query: any }) => PageRes<R>;
}

export interface PaginationOptions {
  show?: boolean;
  currentPage?: number;
  pageSize?: number;
  pageSizes?: number[];
}

/**
 * List-area render mode. Selects how the list
 * region renders: `'table'` (default) → the standard el-table; `'virtual'` → el-table-v2 virtual
 * scroll (large-data read + sort + selection); `'card'` → a responsive card grid. `mode` is a
 * framework-owned key — it is NOT a native el-table prop, so it is stripped from `table.nativeProps`
 * (never bound onto `<el-table>`). Unset is identical to `'table'` (byte-equivalent — no regression).
 */
export type TableMode = 'table' | 'virtual' | 'card';

export interface TableOptions<R = any> {
  rowKey?: string;
  show?: boolean;
  /**
   * List-area render mode: `'table'` (default el-table),
   * `'virtual'` (el-table-v2 virtual scroll), `'card'` (card grid). Framework-owned — excluded from
   * the el-table nativeProps passthrough. Unset ≡ `'table'` (no behavior change).
   */
  mode?: TableMode;
  /**
   * A stable table identity. Required for column-settings persistence: the storage key is
   * `crud:columnsFilter:<id>`.
   */
  id?: string;
  /** inline-editing config. */
  editable?: EditableOptions<R>;
  /** leading row-number column. */
  index?: { show?: boolean; label?: string; width?: number };
  /** leading multi-select checkbox column. */
  selection?: { show?: boolean; width?: number };
  /** render as a tree-table over a children key (rows carry the nested children array). */
  tree?: { children?: string; hasChildren?: string; defaultExpandAll?: boolean };
  /**
   * Any other key (stripe / border / height / max-height / scroll / …) passes through to the
   * underlying el-table — see TableOptions' index signature. The framework-owned keys above are
   * stripped; everything else is collected into the projected `table.nativeProps`.
   */
  [k: string]: any;
}

/**
 * A single column's column-settings override. `show`/`fixed`/
 * `order` are merged over the column's config defaults — an unset key keeps the config default.
 */
export interface ColumnsFilterOverride {
  show?: boolean;
  fixed?: 'left' | 'right' | false;
  order?: number;
}
export type ColumnsFilterOverrides = Record<string, ColumnsFilterOverride>;

/** Inline-editing modes. */
export type EditableMode = 'free' | 'row' | 'cell';

/**
 * What gesture activates a cell's inline editor in CELL mode (port of the reference crud
 * `editable.activeTrigger`). the reference crud uses `'onClick' | 'onDbClick'`; we keep the MVI-clean
 * DOM-event names `'click' | 'dblclick'`. Default `'click'` (== the pre-T7.1 behavior).
 */
export type EditableActiveTrigger = 'click' | 'dblclick';

/**
 * Inline-editing config — port of the reference crud `table.editable`. `enabled` turns the table editable;
 * `mode` picks cell / row / free. Persistence is `local` (mutate the in-memory rows) unless an
 * `updateCell`/`updateRow` callback is supplied (then `api`). `exclusive` keeps a single active
 * cell/row; `exclusiveEffect` decides whether switching saves or cancels the previous one.
 */
export interface EditableOptions<R = any> {
  enabled?: boolean;
  mode?: EditableMode;
  /** only one cell/row editing at a time (default true). */
  exclusive?: boolean;
  /** when exclusive switches away from a cell/row: save it or cancel it (default 'cancel'). */
  exclusiveEffect?: 'cancel' | 'save';
  /** start every row/cell in edit mode on load (free mode). */
  activeDefault?: boolean;
  /**
   * Whole-table read-only: the table is enabled for editing
   * config-wise, but EVERY cell renders its static display (no cell becomes editable). A coarse
   * counterpart to per-column `column.editable.readonly`. Default false.
   */
  readonly?: boolean;
  /**
   * CELL mode: which gesture activates a cell's inline editor (port of the reference crud
   * `editable.activeTrigger`). `'click'` (default — pre-T7.1 behavior) or `'dblclick'`.
   */
  activeTrigger?: EditableActiveTrigger;
  /** force a persistence strategy; defaults to 'api' when updateCell/updateRow exist, else 'local'. */
  persistType?: 'local' | 'api';
  /** per-cell save (cell mode). */
  updateCell?: (ctx: { rowId: any; row: R; key: string; value: any }) => Promise<any>;
  /** per-row save (row/free mode); falls back to request.add/editRequest when omitted. */
  updateRow?: (ctx: { rowId: any; row: R; isAdd: boolean }) => Promise<any>;
  /** predicate: may this cell be edited? */
  isEditable?: (ctx: { key: string; row: R; index: number }) => boolean;
  /** show inline save/cancel/edit action column (default true). */
  showAction?: boolean;
}

/**
 * Per-column inline-editing config (port of the reference crud `column.editable` /
 * `TableColumnEditableProps`). Lives on `column.editable`. Set `readonly`/`disabled` to mark a column
 * NEVER editable within an editable crud — it renders the static read display even while its row /
 * sibling cells are being edited. As a shorthand, `column.editable: false` means the same thing.
 *
 * `updateCell` / `updateColumn` are the reference crud's per-column save-request hooks (a column owning its
 * own persistence). They are carried on the contract for parity but are architecturally N/A in this
 * MVI port (see findings): per-cell persistence is the table-level `editable.updateCell` effect, and
 * `updateColumn` is a ref-driven imperative API with no MVI counterpart.
 */
export interface ColumnEditableProps<R = any> {
  /** this column is never editable (renders the static display while other cells edit). */
  disabled?: boolean;
  /** alias of `disabled` (the reference crud `editable.readonly` shape) — this column is never editable. */
  readonly?: boolean;
  /** show the inline action affordance for this column (default inherits the table). */
  showAction?: boolean;
  /** per-column save request (the reference crud parity; N/A in MVI — see findings). */
  updateCell?: (ctx: { rowId: any; row: R; key: string; value: any }) => Promise<any>;
  /** per-column batch save request (the reference crud parity; N/A in MVI — see findings). */
  updateColumn?: (ctx: { rowId: any; row: R; key: string; data: R[] }) => Promise<any>;
  [k: string]: any;
}

/**
 * A search-item value resolver. Runs at the
 * search-form → query-param boundary (support/buildPageQuery), BEFORE the form becomes a page-query
 * param. The handler may MUTATE `form` (add/replace query keys — e.g. split a daterange into
 * `startTime`/`endTime`) and/or RETURN a replacement value for `key` (written back at `key`). Sync
 * only (a Promise return is ignored, matching the form valueResolve). Additive: no resolver → the
 * search field flows through to the query verbatim.
 */
export type SearchValueResolve<R = any> = (ctx: {
  form: Record<string, any>;
  key: string;
  value: any;
}) => void | any;

/**
 * Auto-search trigger. When enabled, changing a
 * search field auto-submits the search (debounced) — the user no longer has to press 查询. The
 * debounce lives in the VIEW (DgSearch), NOT in any reducer. Forms:
 *   - `false` (default / unset) → search only on the 查询 button (current behavior).
 *   - `'change'` → auto-submit on field change (default ~300ms debounce).
 *   - `{ event?: 'change'; wait?: number }` → same, with a custom debounce `wait` (ms).
 */
export type SearchAutoTrigger =
  | false
  | 'change'
  | { event?: 'change'; wait?: number };

/**
 * Per-column search-item config. Extends the form-item shape
 * (so a search field authors like a form field — component / title / col …) with two search-only
 * hooks: `valueResolve` (transform the field before it becomes a query param) and `autoSearchTrigger`
 * (auto-submit on change). `show` opts the field into the search bar (default off). `col` (inherited
 * from FormItemProps) sets the field's grid span in the search row.
 */
export interface SearchItemOptions<R = any> extends FormItemProps {
  show?: boolean;
  /** transform this field before it becomes a query param (mutate `form` and/or return a value). */
  valueResolve?: SearchValueResolve<R>;
  /** auto-submit the search when this field changes (debounced in the view). */
  autoSearchTrigger?: SearchAutoTrigger;
}

/** Per-column composition: title + per-surface (column/form/search) overrides + type. */
export interface ColumnCompositionProps<R = any> {
  /** filled from the columns map key */
  key?: string;
  title?: string;
  type?: string;
  order?: number;
  /**
   * A HEADER GROUP (multi-level table header, port of the reference crud `column.children`): when set, this
   * column is NOT a data column — it renders an `<el-table-column :label>` wrapping its child
   * columns (which may themselves be groups, nesting arbitrarily deep). Each child is a full
   * `ColumnCompositionProps` (its own title/type/column/cellRender/editable/…). Either a keyed map
   * (`{ phone: {...}, email: {...} }`) or an array of child columns. Leaf (no-children) columns at
   * the top level still render flat — only columns declaring `children` become header groups.
   */
  children?: Record<string, ColumnCompositionProps<R>> | ColumnCompositionProps<R>[];
  /**
   * Include this column in CSV export. Default `true`;
   * `false` excludes the column from the exported file. Additive — unset → included.
   */
  exportable?: boolean;
  /** table-cell config */
  column?: Record<string, any> & {
    show?: boolean;
    width?: number;
    align?: string;
    /** custom cell render hook — replaces the default cell content (called in the Vue layer). */
    cellRender?: (scope: CellRenderScope<R>) => VNodeLike;
    /**
     * Per-column inline-editing config. `{ readonly: true }` /
     * `{ disabled: true }` — or the shorthand `editable: false` — marks this column NEVER editable
     * within an editable crud (it renders the static display while sibling cells edit).
     */
    editable?: ColumnEditableProps<R> | false;
  };
  /**
   * column-level value-change linkage: run a handler when
   * this field's value changes in the form; the handler may set OTHER fields (linkage). Runs at the
   * effect boundary (the reducer stays pure); `immediate` also runs it once when the form opens.
   */
  valueChange?: ValueChange<R>;
  /** form-item config (all modes) */
  form?: FormItemProps;
  /** add-only form override */
  addForm?: FormItemProps;
  /** edit-only form override */
  editForm?: FormItemProps;
  /** view-only form override */
  viewForm?: FormItemProps;
  /** search-item config (component/col + search-only valueResolve / autoSearchTrigger). */
  search?: SearchItemOptions<R>;
  /** dict config (async options) — opaque to the contract; resolved by the dict slice */
  dict?: any;
  /** value transforms */
  valueBuilder?: (scope: CrudScope<R>) => any;
  valueResolve?: (scope: CrudScope<R>) => any;
  [k: string]: any;
}

export interface FormItemProps {
  show?: boolean;
  title?: string;
  /** component descriptor: { name, ...props } */
  component?: Record<string, any> & { name?: string };
  rules?: ValidationRule[];
  value?: any;
  helper?: string;
  /** grid span / flex sizing for this item (consumed by DgForm). */
  col?: { span?: number; width?: number | string };
  /** section name for `group` / `group-tabs` form layouts. */
  group?: string;
  /**
   * Render hooks, all called in the Vue layer with the live
   * form-item scope `{ form, mode, key, value }`. `render` replaces the default input component;
   * `prefixRender`/`suffixRender` render inline before/after it; `topRender`/`bottomRender` render
   * blocks above/below the whole item. These are opaque fn refs — the agnostic layer never calls them.
   */
  render?: FormItemRenderHook;
  prefixRender?: FormItemRenderHook;
  suffixRender?: FormItemRenderHook;
  topRender?: FormItemRenderHook;
  bottomRender?: FormItemRenderHook;
  /**
   * Conditional render: when `match(scope)` is true for the live form scope, the Vue layer renders
   * `render(scope)` instead of the default component. `match` is evaluated live in the view.
   */
  conditionalRender?: ConditionalRender;
  [k: string]: any;
}

export interface ValidationRule {
  required?: boolean;
  message?: string;
  max?: number;
  min?: number;
  pattern?: RegExp | string;
  type?: string;
  /**
   * Custom validator. Sync rules return `false`/string (fail) or `true`/undefined (pass) and are
   * evaluated in the pure reducer. An **async** validator returns a Promise — it is awaited at the
   * submit effect boundary (rejecting, or resolving to `false`/a string, fails the field).
   */
  validator?: (rule: any, value: any) => boolean | string | void | Promise<boolean | string | void>;
  [k: string]: any;
}

export type ColumnsOptions<R = any> = Record<string, ColumnCompositionProps<R>>;

/**
 * Remove config. The confirm
 * (`confirmTitle`/`confirmMessage`/`showConfirm`) is UI — surfaced through the projector and popped in
 * the Vue layer (DgRowHandle / useCrud). The async hooks run at the remove effect boundary, mirroring
 * the submit hook chain: `beforeRemove` (gate; `false`/throw aborts) → `doRemove` (override delRequest)
 * → `afterRemove` → `onRemoved`. `ctx = { row, index, rows? }` (+ `res` for the post-request hooks).
 */
export interface RemoveOptions<R = any> {
  /** the confirm dialog title (default 提示). */
  confirmTitle?: string;
  /** the confirm dialog message (default 确定要删除此记录吗?). */
  confirmMessage?: string;
  /** pop a confirm before deleting (default true). */
  showConfirm?: boolean;
  /** gate before the delete: returning `false` or throwing aborts (no delRequest, no refresh). */
  beforeRemove?: RemoveHook<R>;
  /** override the default delRequest (when present, delRequest is NOT called). */
  doRemove?: RemoveHook<R>;
  /** runs after a successful delete (before the refresh feedback). */
  afterRemove?: RemoveHook<R>;
  /** final side-effect hook after a successful delete. */
  onRemoved?: RemoveHook<R>;
  [k: string]: any;
}

/**
 * rowHandle button-dropdown config. When `show` is on, the
 * per-row buttons split: the first `atLeast` stay inline, the rest collapse into a "更多 ▾" dropdown.
 * `text` overrides the dropdown trigger label (default 更多). Additive: off (default) → all buttons
 * render inline exactly as before.
 */
export interface RowHandleDropdownOptions {
  /** enable the overflow dropdown (default false → all buttons inline). */
  show?: boolean;
  /** keep this many buttons inline; the rest go into the dropdown (default 1). */
  atLeast?: number;
  /** dropdown trigger label (default 更多). */
  text?: string;
}

export interface RowHandleOptions<R = any> {
  show?: boolean;
  width?: number;
  fixed?: 'left' | 'right';
  buttons?: Record<string, ButtonOptions>;
  /** remove (delete) config: confirm UI + the remove hook chain. */
  remove?: RemoveOptions<R>;
  /**
   * Overflow-dropdown config: when enabled, buttons past
   * `atLeast` collapse into a "更多 ▾" dropdown. Off (default) → every button renders inline.
   */
  dropdown?: RowHandleDropdownOptions;
}
export interface ActionbarOptions {
  show?: boolean;
  buttons?: Record<string, ButtonOptions>;
}
export interface ToolbarOptions {
  show?: boolean;
  buttons?: Record<string, ButtonOptions>;
  /**
   * Column-settings control. `show` adds the toolbar
   * button + dialog; `storage` (with `table.id`) persists the column settings to localStorage.
   */
  columnsFilter?: { show?: boolean; storage?: boolean };
}
export interface ButtonOptions {
  show?: boolean;
  text?: string;
  title?: string;
  icon?: string;
  type?: string;
  order?: number;
  disabled?: boolean;
  /**
   * Permission code. When set AND a `permission`
   * predicate is injected into the store (useCrud option), the button is DROPPED from the projected
   * binding when `predicate(code) === false`. No code, or no injected predicate → the button is kept
   * (additive / backward-compatible).
   */
  permission?: string;
  /**
   * Button group name. When set on rowHandle buttons, the
   * projector clusters adjacent same-group buttons (preserving order) so the view can wrap them in an
   * el-button-group. Ungrouped buttons render standalone, exactly as before.
   */
  group?: string;
  /**
   * Custom click handler for a rowHandle button (the MVI counterpart of the reference crud's button `click`).
   * Carried as an opaque fn ref through the projector (NEVER called there); DgRowHandle calls it with
   * the per-row `{ row, index }` scope. The three built-in actions (view/edit/remove) keep their
   * default command dispatch; `onClick` is for author-defined buttons (and overflow-dropdown items).
   */
  onClick?: (scope: { row: any; index: number; key: string }) => void;
  [k: string]: any;
}

export interface SearchOptions {
  show?: boolean;
  collapse?: boolean;
  /**
   * Crud-wide auto-search trigger. When enabled, a
   * change to ANY search field auto-submits the search (debounced in DgSearch, default ~300ms). A
   * per-column `search.autoSearchTrigger` overrides this for that field. Default (unset / `false`) =
   * search only on the 查询 button. The debounce lives in the view — never in a reducer.
   */
  autoSearchTrigger?: SearchAutoTrigger;
}

/**
 * The "all" sentinel for the tabs quick-filter. When
 * `tabs.active === TABS_ALL`, NO filter is added to the page query (the list is unconstrained). A
 * module constant (rather than `undefined`) so the active value is always concrete — the addAll tab's
 * value, the projected `tabs.active`, and the query-merge guard all compare against the same token.
 * Authors can override the addAll tab's value via `addAll: { value: ... }`; that override then plays
 * the role of the no-filter sentinel for that crud (the reducer/query-merge resolve it from config).
 */
export const TABS_ALL = '__all__';

/**
 * Tabs quick-filter: a tab / segmented bar above the table that
 * quick-filters the list by ONE field (`name`). Clicking a tab constrains the list query to
 * `{ [name]: activeValue }` and refetches from page 1; the addAll ("全部") tab clears the filter.
 * Options are static (`options`) OR dict-resolved (`dict`, reusing the column dict mechanism).
 */
export interface TabsOptions {
  /** render the tabs bar (default: only when tabs is configured AND show === true). */
  show?: boolean;
  /** the field this bar filters the list by (the query key). Required. */
  name: string;
  /** el-tabs (default) vs el-radio-group of el-radio-button. */
  type?: 'tabs' | 'radio-button' | 'radio';
  /** static options (label/value pairs). Either this or `dict`. */
  options?: Array<{ label: string; value: any }>;
  /** dict-driven options (reuses the column dict mechanism — resolved to label/value pairs). */
  dict?: DictConfig;
  /**
   * prepend an "全部" tab whose value is the all-sentinel (no filter). Default true. An object form
   * overrides its `label` (default 全部) and/or `value` (default TABS_ALL — the no-filter token).
   */
  addAll?: boolean | { label?: string; value?: any };
}

/**
 * Scope handed to every form submit hook — port of the reference crud's `SubmitProps` context, trimmed to
 * what the immutable model carries: the live (value-resolved) `form`, the dialog `mode`, the source
 * `row` (edit/view), and the `initialForm` snapshot. Hooks may inspect/mutate `form` in place before
 * the request runs (the chain passes the same object through).
 */
export interface FormScopeContext<R = any> {
  form: Record<string, any>;
  mode: 'add' | 'edit' | 'view';
  row: R | null;
  initialForm: Record<string, any>;
  [k: string]: any;
}

/**
 * A form submit hook. Runs at the submit effect boundary (never the pure reducer). Returning `false`
 * or throwing aborts the submit; any other resolved value continues the chain.
 */
export type FormSubmitHook<R = any> = (ctx: FormScopeContext<R>) => Promise<any | boolean> | any | boolean;

/**
 * Scope handed to every remove hook — the row being deleted, its table index, and (when known) the
 * current page rows. Mirrors the reference crud's remove context, trimmed to what the immutable model carries.
 * `beforeRemove`/`doRemove`/`afterRemove`/`onRemoved` receive this; `doRemove`/`afterRemove`/`onRemoved`
 * also see the request `res`.
 */
export interface RemoveScopeContext<R = any> {
  row: R | null;
  index?: number;
  rows?: R[];
  [k: string]: any;
}

/**
 * A remove hook. Runs at the remove effect boundary (never the pure reducer). `beforeRemove` returning
 * `false` or throwing aborts the delete (no delRequest, no refresh); `doRemove`, when present, replaces
 * the default delRequest.
 */
export type RemoveHook<R = any> = (ctx: RemoveScopeContext<R>) => Promise<any | boolean> | any | boolean;

/**
 * A custom form footer button. `onClick` receives a small action
 * context — `submit` dispatches the submit command, `close` dispatches the close command — so a button
 * can drive the form without touching state. Rendered in the dialog footer by DgFormWrapper.
 */
export interface FormButtonContext {
  /** dispatch the submit command (runs the full submit hook chain). */
  submit: () => void;
  /** dispatch the close command (vm.form.open → false → v-if unmounts the dialog). */
  close: () => void;
  /** the live form data. */
  form: Record<string, any>;
  /** the active dialog mode. */
  mode: 'add' | 'edit' | 'view';
}
export interface FormButton {
  /** stable key (defaults to the array index when omitted). */
  key?: string;
  text: string;
  type?: string;
  icon?: string;
  onClick: (ctx: FormButtonContext) => void;
  /**
   * Permission code. When set AND a `permission`
   * predicate is injected into the store, the footer button is DROPPED when `predicate(code) === false`.
   * No code, or no injected predicate → kept (additive / backward-compatible).
   */
  permission?: string;
  [k: string]: any;
}

/**
 * The form's beforeClose interception hook (port of el-dialog before-close). Receives a `done`
 * callback the user calls to proceed with closing; not calling it cancels the close. Only consulted
 * when `saveRemind` is off or the form is not dirty.
 */
export type FormBeforeClose = (done: () => void) => void;

/**
 * Form dialog/drawer wrapper config. The sizing/passthrough props
 * are bound onto el-dialog/el-drawer; the lifecycle hooks (`onOpen`/`onOpened`/`onClosed`) and
 * `beforeClose` are UI-lifecycle callbacks invoked from the view. `saveRemind` + `saveDraft` opt into
 * dirty-aware close confirmation and draft persistence (framework features — see FormSlice.initial).
 */
export interface FormWrapperOptions {
  /** 'dialog' (default) or 'drawer' / 'el-drawer'. */
  is?: string;
  /** dialog width (default 50%). */
  width?: string;
  /** drawer size (default 40%). */
  size?: string;
  /** drawer direction (default rtl). */
  direction?: string;
  /** dialog `top` offset. */
  top?: string;
  /** override the dialog/drawer title. */
  title?: string;
  /** open the dialog fullscreen. */
  fullscreen?: boolean;
  /** make the dialog draggable. */
  draggable?: boolean;
  /** render inside the page flow instead of teleporting to body (→ :append-to-body="!inner"). */
  inner?: boolean;
  /** el-dialog @open callback. */
  onOpen?: () => void;
  /** el-dialog @opened callback. */
  onOpened?: () => void;
  /** el-dialog @closed callback. */
  onClosed?: () => void;
  /** el-dialog :before-close interception. */
  beforeClose?: FormBeforeClose;
  /** prompt before closing when the form is dirty (uses FormSlice.initial / form.dirty). */
  saveRemind?: boolean;
  /** persist the form data to storage + restore a draft on open (needs a form `id` or table.id). */
  saveDraft?: boolean;
  /** the draft storage id (defaults to table.id). The key is `crud:formDraft:<id>`. */
  id?: string;
  [k: string]: any;
}

export interface FormOptions<R = any> {
  title?: string;
  /** form body layout: stacked grid (default), horizontal flex-wrap, or grouped sections / tabs. */
  layout?: 'default' | 'flex' | 'group' | 'group-tabs';
  /** dialog-vs-drawer + sizing + advanced behaviors. */
  wrapper?: FormWrapperOptions;
  /** custom footer buttons — replace the default 取消/确定 footer. */
  buttons?: FormButton[];
  /**
   * Submit hook chain. Order at the effect
   * boundary: beforeValidate → (sync + async validate) → beforeSubmit → doSubmit(or add/editRequest)
   * → afterSubmit → onSuccess. Any hook returning `false` or throwing aborts (form stays open,
   * submitStatus back to idle, no add/editRequest). `doSubmit`, when present, replaces the default
   * add/editRequest call.
   */
  beforeValidate?: FormSubmitHook<R>;
  beforeSubmit?: FormSubmitHook<R>;
  doSubmit?: FormSubmitHook<R>;
  afterSubmit?: FormSubmitHook<R>;
  onSuccess?: FormSubmitHook<R>;
  doReset?: FormSubmitHook<R>;
  [k: string]: any;
}

export interface CrudMode {
  name?: 'local' | 'remote';
  isMergeWhenUpdate?: boolean;
  isAppendWhenAdd?: boolean;
}

/**
 * A build-time crudOptions transform. Each enabled plugin's
 * `exec` runs ONCE over the user options at build (before the defaults/commonOptions merge), in array
 * order, chained: `opts = plugin.exec(opts) ?? opts`. A plugin can add/modify columns, set defaults,
 * inject toolbar/actionbar buttons, etc. `enabled === false` skips the plugin. Pure-ish — these are
 * user fns invoked once at normalization (never in the reducer/projector).
 */
export interface CrudPlugin<R = any> {
  /** optional name (diagnostics only). */
  name?: string;
  /** run this plugin (default true). `false` skips it. */
  enabled?: boolean;
  /** transform the options; returning undefined keeps the (possibly mutated) input. */
  exec: (opts: CrudOptions<R>) => CrudOptions<R> | void;
}

/**
 * Build-time settings. `plugins` are crudOptions transforms
 * run once at normalization. Additive: no `settings.plugins` → no change to the normalized options.
 */
export interface CrudSettings<R = any> {
  plugins?: Array<CrudPlugin<R>>;
}

/**
 * Outer-container config: a passthrough bag of container-level props
 * applied to DgCrud's outer wrapper element (height / class / style / any other attr). It never
 * touches the inner table/form logic — the projector carries it through and the view binds it onto
 * the wrapper. `height` may be a CSS string (`'520px'`) or a number (→ px). Unset → no wrapper
 * styling (byte-equivalent with the current behavior).
 */
export interface ContainerOptions {
  /** outer wrapper height (CSS string like `'520px'`, or a number treated as px by the view). */
  height?: string | number;
  /** extra class(es) on the outer wrapper. */
  class?: string;
  /** extra inline style on the outer wrapper. */
  style?: Record<string, any>;
  /** any other attribute passes straight through to the wrapper element. */
  [k: string]: any;
}

export interface CrudOptions<R = any> {
  mode?: CrudMode;
  /**
   * Outer-container config — a passthrough bag (height/class/style/…)
   * applied to DgCrud's outer wrapper. Projected through to `vm.container`; unset → no wrapper styling
   * (byte-equivalent). See ContainerOptions.
   */
  container?: ContainerOptions;
  request?: RequestProp<R>;
  columns?: ColumnsOptions<R>;
  pagination?: PaginationOptions;
  table?: TableOptions<R>;
  form?: FormOptions<R>;
  addForm?: FormOptions<R>;
  editForm?: FormOptions<R>;
  viewForm?: FormOptions<R>;
  search?: SearchOptions;
  /** tabs quick-filter bar above the table. */
  tabs?: TabsOptions;
  rowHandle?: RowHandleOptions<R>;
  actionbar?: ActionbarOptions;
  toolbar?: ToolbarOptions;
  /** build-time settings — `plugins` transform crudOptions at build. */
  settings?: CrudSettings<R>;
  [k: string]: any;
}

/** Alias kept for the reference crud familiarity. */
export type DynamicallyCrudOptions<R = any> = CrudOptions<R>;
