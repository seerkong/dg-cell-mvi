/**
 * dg-cell-mvi-crud · logic/projectors — pure projectCrudBinding(state, config) -> CrudBinding.
 *
 * Combines the closure config (columns, normalized once) with runtime state into a complete,
 * immutable description of what to render (the viewModel). The Vue components are thin: read this,
 * emit commands. (Form / rowHandle / toolbar projection added in later stages.)
 */
import type {
  ContainerOptions,
  EditableActiveTrigger,
  EditableMode,
  TableMode,
} from '../contract/crudOptions';
import type { ListStatus, SortState } from '../contract/state';
import type { CrudState, EditableRowState } from '../contract/state';
import type { NormalizedColumn, NormalizedCrudOptions } from '../support/optionsBuild';
import { projectForm, projectFormColumns } from './projectors/form';
import type { ResolvedFormItem } from './projectors/form';
import { projectActionbar, projectRowHandle, projectToolbar } from './projectors/buttons';
import { I18N_KEY, resolveT } from '../support/i18n';
import type {
  ActionbarBinding,
  ButtonGroupRun,
  RemoveBinding,
  ResolvedButton,
  RowHandleBinding,
  ToolbarBinding,
} from './projectors/buttons';
import { projectDictSlice, type DictControlBinding } from './projectors/dict';

export type {
  ResolvedFormItem,
  ResolvedButton,
  ButtonGroupRun,
  RowHandleBinding,
  RemoveBinding,
  ActionbarBinding,
  ToolbarBinding,
};

export interface ResolvedTableColumn {
  key: string;
  title: string;
  type?: string;
  width?: number;
  align?: string;
  sortable?: boolean | string;
  fixed?: 'left' | 'right' | boolean;
  props: Record<string, any>;
  /**
   * Optional cell render hook (`column.cellRender`) — replaces the default cell content. Carried
   * through as an opaque fn ref (NEVER called here — the projector is in the agnostic package and
   * must not produce VNodes); DgCell calls it per-row with `{ row, index, value, key }`.
   */
  cellRender?: (scope: any) => any;
  /**
   * Whether this (leaf) column is included in CSV export.
   * Default true; `false` excludes it. The export helper filters on this; group nodes are never
   * data columns so they are skipped by the export flattening regardless.
   */
  exportable: boolean;
  /**
   * Header-group children (multi-level header, port of the reference crud `column.children`). When present
   * this column is a GROUP node — it renders an el-table-column wrapping these projected children
   * (which may themselves be groups). Leaf columns keep `children === undefined`. The view nests
   * el-table-column for groups; leaf columns render their cell exactly as before.
   */
  children?: ResolvedTableColumn[];
}

export interface ResolvedSearchColumn {
  key: string;
  title: string;
  type?: string;
  component: Record<string, any>;
  /** grid layout (search.col, e.g. `{ span }`) — consumed by DgSearch to size the item's el-col. */
  col?: Record<string, any>;
  /**
   * Per-field auto-search trigger (search.autoSearchTrigger). When set it overrides the crud-wide
   * `search.autoSearchTrigger` for this field. The debounce lives in DgSearch (never a reducer).
   */
  autoSearchTrigger?: false | 'change' | { event?: 'change'; wait?: number };
}

/** One resolved tab in the tabs quick-filter bar (label + value). */
export interface TabOption {
  label: string;
  value: any;
}

/**
 * The tabs quick-filter view shape (DgTabs reads this). When the bar is not configured or
 * `show !== true`, only `{ show: false }` is exposed (the view renders nothing). Otherwise `options`
 * is the resolved list (static options or dict-resolved label/value pairs) with the addAll ("全部")
 * tab prepended when configured; `active` is the current selection.
 */
export interface TabsBinding {
  show: boolean;
  name?: string;
  type?: 'tabs' | 'radio-button' | 'radio';
  active?: any;
  options?: TabOption[];
}

/** One row of the column-settings dialog: every column + its effective show (override ?? default). */
export interface ColumnsFilterItem {
  key: string;
  title: string;
  show: boolean;
}

/** The column-settings view shape (the DgColumnsFilter dialog reads this). */
export interface ColumnsFilterBinding {
  /** the dialog/button is enabled (toolbar.columnsFilter.show). */
  show: boolean;
  /** the full column roster (incl. hidden ones) with effective show, for the toggle list. */
  items: ColumnsFilterItem[];
  /** the dialog title (localized via the injected translator; default 列设置). */
  title: string;
  /** the 重置 footer button label (localized; default 重置). */
  resetText: string;
  /** the 取消 footer button label (localized; default 取消). */
  cancelText: string;
  /** the 确定 footer button label (localized; default 确定). */
  confirmText: string;
}

/** The inline-editing view shape on CrudBinding.table — per-row state + per-column edit controls. */
export interface TableEditableBinding {
  enabled: boolean;
  mode: EditableMode;
  exclusive: boolean;
  activeDefault: boolean;
  /** whole-table read-only: no cell becomes editable. */
  readonly: boolean;
  /** cell-mode activation gesture ('click' default | 'dblclick'). */
  activeTrigger: EditableActiveTrigger;
  showAction: boolean;
  /** rowId (String) -> per-row edit state (editing/draft/errors/loading). */
  rowStates: Record<string, EditableRowState>;
  /** cell mode: the active `"<rowId>::<key>"`. */
  activeKey: string | null;
  /** columnKey -> the resolved edit control (name + options + props), reused from the form columns. */
  columns: Record<string, ResolvedFormItem>;
  /** columnKey -> true for columns that are NEVER editable (render static display while others edit). */
  readonlyColumns: Record<string, boolean>;
  /**
   * The inline-row action column chrome, localized through the injected translator (defaults = the
   * Chinese literals DgTable used to hardcode — a zh / no-translator build is byte-equivalent):
   * `operations` (the column header 操作), `save`/`cancel` (the editing-row footer), `edit` (start
   * row-edit), `remove` (delete row). DgTable binds these instead of literals so they follow the locale.
   */
  actionLabels: {
    operations: string;
    save: string;
    cancel: string;
    edit: string;
    remove: string;
  };
}

export interface CrudBinding<R = any> {
  table: {
    columns: ResolvedTableColumn[];
    rows: R[];
    loading: boolean;
    sort: SortState;
    rowKey: string;
    selectedRowKeys: any[];
    show: boolean;
    /**
     * List-area render mode: 'table' (default) | 'virtual' |
     * 'card'. DgCrud dispatches the list renderer on this; the resolved `columns` are SHARED across
     * all modes (a virtual/card view maps the same column list). Unset config → 'table' (no regression).
     */
    mode: TableMode;
    editable: TableEditableBinding;
    /** leading row-number column config (or null when off). */
    index: { show: boolean; label: string; width: number } | null;
    /** leading multi-select column config (or null when off). */
    selection: { show: boolean; width: number } | null;
    /** el-table tree-props (or null when not a tree table). */
    treeProps: { children: string; hasChildren: string } | null;
    /** expand all tree rows by default. */
    defaultExpandAll: boolean;
    /** non-framework table props (stripe/border/height/…) bound straight onto el-table. */
    nativeProps: Record<string, any>;
  };
  pagination: {
    show: boolean;
    currentPage: number;
    pageSize: number;
    total: number;
    pageSizes: number[];
  };
  search: {
    show: boolean;
    collapse: boolean;
    columns: ResolvedSearchColumn[];
    form: Record<string, any>;
    /** crud-wide auto-search trigger (DgSearch falls back to this when a field sets no per-field one). */
    autoSearchTrigger: false | 'change' | { event?: 'change'; wait?: number };
    /** the 查询 button label (localized via the injected translator; default 查询). */
    searchText: string;
    /** the 重置 button label (localized; default 重置). */
    resetText: string;
    /** the default input placeholder PREFIX — the view builds `${placeholderPrefix}${col.title}`
     *  ("请输入用户名" / "Enter Username"). Localized; default 请输入. */
    placeholderPrefix: string;
  };
  tabs: TabsBinding;
  form: ReturnType<typeof projectForm>;
  rowHandle: RowHandleBinding;
  actionbar: ActionbarBinding;
  toolbar: ToolbarBinding;
  columnsFilter: ColumnsFilterBinding;
  dict: Record<string, DictControlBinding>;
  status: ListStatus;
  error: string | null;
  /**
   * Outer-container passthrough — height/class/style/… for DgCrud's
   * outer wrapper. `null` when unset (no wrapper styling — byte-equivalent). The view binds it onto
   * the wrapper element; it never affects the inner table/form logic.
   */
  container: ContainerOptions | null;
}

/**
 * Resolve the tabs quick-filter binding. Off (no config / show !== true) → `{ show: false }`. On →
 * resolve options: static `config.tabs.options`, or dict-resolved label/value pairs from the loaded
 * dict state (`state.dict[dictId].data`, mapped via the dict's value/label fields — the same node
 * shape columns resolve), then prepend the addAll ("全部") tab when configured. Pure.
 */
export function projectTabs<R = any>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): TabsBinding {
  const tabs = config.tabs;
  if (!tabs || tabs.show !== true) {
    return { show: false };
  }
  let options: TabOption[];
  if (tabs.dict && tabs.dictId) {
    const entry = state.dict[tabs.dictId];
    const valueField = tabs.dict.value ?? 'value';
    const labelField = tabs.dict.label ?? 'label';
    options = (entry?.data ?? []).map((node: any) => ({
      label: String(node[labelField] ?? node[valueField] ?? ''),
      value: node[valueField],
    }));
  } else {
    options = tabs.options.map((o) => ({ label: o.label, value: o.value }));
  }
  if (tabs.addAll) {
    options = [{ label: tabs.addAll.label, value: tabs.addAll.value }, ...options];
  }
  return {
    show: true,
    name: tabs.name,
    type: tabs.type,
    active: state.tabs.active,
    options,
  };
}

/**
 * Resolve ONE normalized column into a ResolvedTableColumn (recursing into header-group children).
 * A leaf column resolves exactly as before (key/title/width/align/sortable/fixed/props/cellRender/
 * exportable). A GROUP column (NormalizedColumn.children present) recurses — its `children` become
 * projected child columns (themselves possibly groups), and the view nests el-table-column. `fixed`
 * is the (override-aware) fixed value for top-level columns; children inherit their own config fixed.
 * Pure — never mutates config.
 */
function resolveTableColumn<R = any>(
  c: NormalizedColumn<R>,
  fixed: ResolvedTableColumn['fixed'],
): ResolvedTableColumn {
  const base: ResolvedTableColumn = {
    key: c.key,
    title: c.title,
    type: c.type,
    width: c.column.width,
    align: c.column.align,
    sortable: c.column.sortable,
    fixed,
    // carry the dict config + its (possibly shared) state key so DgCell can resolve value -> label
    props: c.dict ? { ...c.column, dict: c.dict, dictId: c.dictId } : c.column,
    // opaque cell render hook ref (column.cellRender) — passed through, called per-row in DgCell.
    cellRender: (c.column as Record<string, any>).cellRender,
    exportable: c.exportable,
  };
  if (c.children && c.children.length) {
    // group node: project each child (children declare their own fixed via their column config),
    // keeping only children whose config show !== false (a hidden child drops from the group).
    base.children = c.children
      .filter((child) => child.column.show !== false)
      .map((child) => resolveTableColumn(child, child.column.fixed));
  }
  return base;
}

export function projectCrudBinding<R = any>(
  state: CrudState<R>,
  config: NormalizedCrudOptions<R>,
): CrudBinding<R> {
  // apply the column-settings overrides (state.columnsFilter): effective show/fixed/order =
  // override-field ?? the column's config default. Drop columns whose *effective* show is false
  // (a config-default ComputeValue is not === false, so cell-level compute markers still pass through
  // and resolve per-row in DgCell), then sort by effective order. Overrides are runtime state; the
  // normalized config is never mutated.
  const cfOverrides = state.columnsFilter || {};
  const tableColumns: ResolvedTableColumn[] = config.columns
    .map((c) => {
      const o = cfOverrides[c.key] || {};
      const show = o.show !== undefined ? o.show : c.column.show;
      const fixed = o.fixed !== undefined ? o.fixed : c.column.fixed;
      const order = o.order !== undefined ? (o.order as number) : c.order;
      return { c, show, fixed, order };
    })
    .filter((e) => e.show !== false)
    .sort((a, b) => a.order - b.order)
    .map(({ c, fixed }) => resolveTableColumn(c, fixed));

  // the column-settings toggle roster: every column + its effective show. A config-default show that
  // is a compute marker (not a plain boolean) is treated as shown (true) for the toggle — the override
  // is what the dialog writes. Listed in effective-order so the dialog mirrors the table.
  const columnsFilterItems: ColumnsFilterItem[] = config.columns
    .map((c) => {
      const o = cfOverrides[c.key] || {};
      const order = o.order !== undefined ? (o.order as number) : c.order;
      const effShow = o.show !== undefined ? o.show : c.column.show;
      return { key: c.key, title: c.title, show: effShow !== false, order };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ key, title, show }) => ({ key, title, show }));

  const searchColumns: ResolvedSearchColumn[] = config.columns
    .filter((c) => c.search.show === true)
    .map((c) => ({
      key: c.key,
      title: c.search.title ?? c.title,
      type: c.type,
      component: c.search.component || {},
      // grid span for this search item (search.col, e.g. { span }) — DgSearch sizes the el-col.
      col: (c.search as Record<string, any>).col,
      // per-field auto-search trigger (overrides the crud-wide one for this field when set).
      autoSearchTrigger: c.search.autoSearchTrigger,
    }));

  // per-column read-only roster (column.editable disabled/readonly, or `editable: false`). The view
  // reads this to render the static display for these columns even while sibling cells edit.
  const readonlyColumns: Record<string, boolean> = {};
  for (const c of config.columns) if (c.editableReadonly) readonlyColumns[c.key] = true;

  // edit controls per editable column (only resolved when editing is on) — shares the form columns
  // so a field edits with the same control + dict options it uses in the dialog. None are built when
  // the whole table is read-only; per-column read-only columns are individually excluded (the view
  // falls back to the static cell for them).
  const editColumns: Record<string, ResolvedFormItem> = {};
  if (state.editable.enabled && !state.editable.readonly) {
    for (const item of projectFormColumns(state, config, 'edit')) {
      if (readonlyColumns[item.key]) continue;
      editColumns[item.key] = item;
    }
  }

  return {
    table: {
      columns: tableColumns,
      rows: state.list.rows,
      loading: state.list.status === 'loading',
      sort: state.list.sort,
      rowKey: config.table.rowKey,
      selectedRowKeys: state.list.selectedRowKeys,
      show: config.table.show,
      // render mode (table/virtual/card) — DgCrud picks the list renderer; default 'table'.
      mode: config.table.mode,
      index: config.table.index ?? null,
      selection: config.table.selection ?? null,
      treeProps: config.table.tree
        ? { children: config.table.tree.children, hasChildren: config.table.tree.hasChildren }
        : null,
      defaultExpandAll: config.table.tree?.defaultExpandAll ?? false,
      nativeProps: config.table.nativeProps,
      editable: {
        enabled: state.editable.enabled,
        mode: state.editable.mode,
        exclusive: state.editable.exclusive,
        activeDefault: state.editable.activeDefault,
        readonly: state.editable.readonly,
        activeTrigger: state.editable.activeTrigger,
        showAction: config.editable.showAction,
        rowStates: state.editable.rowStates,
        activeKey: state.editable.activeKey,
        columns: editColumns,
        readonlyColumns,
        // inline-row action column chrome localized (default = the Chinese literals DgTable hardcoded).
        actionLabels: {
          operations: resolveT(config.t, I18N_KEY.editableOperations, '操作'),
          save: resolveT(config.t, I18N_KEY.editableSave, '保存'),
          cancel: resolveT(config.t, I18N_KEY.editableCancel, '取消'),
          edit: resolveT(config.t, I18N_KEY.editableEdit, '编辑'),
          remove: resolveT(config.t, I18N_KEY.editableRemove, '删除'),
        },
      },
    },
    pagination: {
      show: config.pagination.show,
      currentPage: state.list.page.currentPage,
      pageSize: state.list.page.pageSize,
      total: state.list.page.total,
      pageSizes: state.list.page.pageSizes,
    },
    search: {
      show: state.search.show,
      collapse: state.search.collapse,
      columns: searchColumns,
      form: state.search.form,
      autoSearchTrigger: config.search.autoSearchTrigger,
      // search-bar chrome localized through the injected translator (default = the Chinese literals the
      // view used to hardcode — so a zh session / no-translator build is byte-equivalent).
      searchText: resolveT(config.t, I18N_KEY.searchSearch, '查询'),
      resetText: resolveT(config.t, I18N_KEY.searchReset, '重置'),
      placeholderPrefix: resolveT(config.t, I18N_KEY.searchPlaceholder, '请输入'),
    },
    tabs: projectTabs(state, config),
    form: projectForm(state, config),
    rowHandle: projectRowHandle(state, config),
    actionbar: projectActionbar(state, config),
    toolbar: projectToolbar(state, config),
    columnsFilter: {
      show: config.columnsFilter.show === true,
      items: columnsFilterItems,
      // column-settings dialog chrome localized (default = the Chinese literals the dialog hardcoded).
      title: resolveT(config.t, I18N_KEY.columnsFilterTitle, '列设置'),
      resetText: resolveT(config.t, I18N_KEY.columnsFilterReset, '重置'),
      cancelText: resolveT(config.t, I18N_KEY.columnsFilterCancel, '取消'),
      confirmText: resolveT(config.t, I18N_KEY.columnsFilterConfirm, '确定'),
    },
    dict: projectDictSlice(state, config),
    status: state.list.status,
    error: state.list.error,
    // outer-container passthrough (null when unset) — bound onto DgCrud's wrapper in the view.
    container: config.container,
  };
}
