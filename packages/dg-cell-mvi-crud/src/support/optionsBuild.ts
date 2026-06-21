/**
 * dg-cell-mvi-crud · support/optionsBuild — one-time normalization of crudOptions.
 *
 * Merges defaults + commonOptions + user crudOptions, then turns the `columns` map into an ordered,
 * key-filled column list (the analog of the reference crud's buildColumns, minus the Vue ref tree). The
 * result is held in the store closure (it never changes after build) — the projector reads it.
 */
import { cloneDeep, merge } from 'lodash-es';

import type {
  ColumnCompositionProps,
  ContainerOptions,
  CrudMode,
  CrudOptions,
  EditableActiveTrigger,
  EditableMode,
  EditableOptions,
  FormItemProps,
  PaginationOptions,
  RequestProp,
  TableMode,
  TabsOptions,
} from '../contract/crudOptions';
import { TABS_ALL } from '../contract/crudOptions';
import type { CrudStateSeed } from '../contract/state';
import type { DictConfig } from './dictRegistry';
import type { CrudTranslator } from './i18n';

/**
 * Injected capabilities threaded from the store into the build + the pure projector (the same pattern
 * as the `CrudUiPort` / storage ports, but build/projection concerns rather than effect concerns).
 * `t` localizes built-in chrome labels; `permission` filters action buttons. Both optional — absent
 * means identical pre-injection behavior.
 */
export interface NormalizeInjections {
  /** injected translator for built-in chrome labels (see support/i18n). */
  t?: CrudTranslator;
  /** injected button-permission predicate: `false` for a button's code drops it from the binding. */
  permission?: (code: string) => boolean;
}

export interface NormalizedEditable<R = any> {
  enabled: boolean;
  mode: EditableMode;
  exclusive: boolean;
  exclusiveEffect: 'cancel' | 'save';
  activeDefault: boolean;
  /** whole-table read-only: no cell becomes editable. */
  readonly: boolean;
  /** cell-mode activation gesture ('click' default | 'dblclick'). */
  activeTrigger: EditableActiveTrigger;
  persistType: 'local' | 'api';
  showAction: boolean;
  updateCell?: EditableOptions<R>['updateCell'];
  updateRow?: EditableOptions<R>['updateRow'];
  isEditable?: EditableOptions<R>['isEditable'];
}

export interface NormalizedColumn<R = any> {
  key: string;
  title: string;
  type?: string;
  order: number;
  column: Record<string, any> & { show: boolean };
  form: FormItemProps;
  addForm?: FormItemProps;
  editForm?: FormItemProps;
  viewForm?: FormItemProps;
  search: FormItemProps & {
    show: boolean;
    /** search-only value resolver (form → query param transform), run in buildPageQuery. */
    valueResolve?: (ctx: { form: Record<string, any>; key: string; value: any }) => void | any;
    /** auto-submit the search on this field's change (debounced in the view). */
    autoSearchTrigger?: false | 'change' | { event?: 'change'; wait?: number };
  };
  dict?: any;
  /** the dict state/registry key — a shared dict's `id`, else the column key. */
  dictId?: string;
  /**
   * Whether this column is exportable to CSV. Default true;
   * false excludes it from the export column set. Read by the export helper (exportColumns).
   */
  exportable: boolean;
  /**
   * Header-group children (multi-level header, port of the reference crud `column.children`). When present
   * (non-null), this is a HEADER GROUP node — not a data column: it has no dict/form/editable, only a
   * `title` (group label) and recursively-normalized child columns. The projector builds a matching
   * group node; the view nests el-table-column. Leaf columns keep `children === undefined`.
   */
  children?: NormalizedColumn<R>[];
  /**
   * This column is never editable within an editable crud (port of the reference crud `column.editable`
   * `disabled`/`readonly`, or the `column.editable: false` shorthand). The editable reducer skips
   * it when seeding edit buffers; the projector marks it so the view renders the static display.
   */
  editableReadonly: boolean;
  valueBuilder?: (scope: any) => any;
  valueResolve?: (scope: any) => any;
  raw: ColumnCompositionProps<R>;
}

/**
 * Normalized tabs quick-filter config (null when no tabs bar is configured). `allValue` is the
 * resolved no-filter sentinel (the addAll value, default TABS_ALL); `addAll` carries the prepended
 * "全部" tab descriptor (or null when addAll is off). `dictId` keys the dict state when `dict` is set.
 */
export interface NormalizedTabs {
  show: boolean;
  name: string;
  type: 'tabs' | 'radio-button' | 'radio';
  options: Array<{ label: string; value: any }>;
  dict?: DictConfig;
  dictId?: string;
  /** the prepended "全部" tab (or null when addAll is off). */
  addAll: { label: string; value: any } | null;
  /** the no-filter sentinel value (addAll.value, default TABS_ALL). */
  allValue: any;
}

export interface NormalizedCrudOptions<R = any> {
  mode: CrudMode;
  request: RequestProp<R>;
  columns: NormalizedColumn<R>[];
  columnsMap: Record<string, NormalizedColumn<R>>;
  /** tabs quick-filter config (null when not configured). */
  tabs: NormalizedTabs | null;
  pagination: { show: boolean; pageSize: number; pageSizes: number[] };
  table: {
    rowKey: string;
    show: boolean;
    /**
     * List-area render mode: 'table' (default) | 'virtual'
     * | 'card'. Framework-owned — excluded from nativeProps; DgCrud dispatches the list renderer on it.
     */
    mode: TableMode;
    /** stable table identity — the storage key suffix for column-settings persistence. */
    id?: string;
    index?: { show: boolean; label: string; width: number };
    selection?: { show: boolean; width: number };
    tree?: { children: string; hasChildren: string; defaultExpandAll: boolean };
    /** non-framework table keys (stripe/border/height/…) passed straight to el-table. */
    nativeProps: Record<string, any>;
  };
  /**
   * Outer-container passthrough — height/class/style/… applied to
   * DgCrud's outer wrapper. `null` when unset (no wrapper styling — byte-equivalent). Carried on the
   * immutable normalized config so the PURE projector exposes it the same way it exposes the table.
   */
  container: ContainerOptions | null;
  /** column-settings flags (port of toolbar.columnsFilter): the button + storage persistence gate. */
  columnsFilter: { show: boolean; storage: boolean };
  editable: NormalizedEditable<R>;
  rowHandle: Required<Pick<NonNullable<CrudOptions<R>['rowHandle']>, never>> & CrudOptions<R>['rowHandle'];
  actionbar: CrudOptions<R>['actionbar'];
  toolbar: CrudOptions<R>['toolbar'];
  search: {
    show: boolean;
    collapse: boolean;
    /** crud-wide auto-search trigger (a per-column search.autoSearchTrigger overrides per field). */
    autoSearchTrigger: false | 'change' | { event?: 'change'; wait?: number };
  };
  form: CrudOptions<R>['form'];
  addForm: CrudOptions<R>['addForm'];
  editForm: CrudOptions<R>['editForm'];
  viewForm: CrudOptions<R>['viewForm'];
  raw: CrudOptions<R>;
  seed: CrudStateSeed;
  /**
   * Injected translator for built-in chrome labels (threaded from useCrud's `i18n` port). `undefined`
   * when none injected — the projector then resolves every built-in label to its default Chinese
   * (behavior-equivalent). Carried on the (immutable) normalized config so the PURE projector can read
   * it the same way it reads columns/buttons.
   */
  t?: CrudTranslator;
  /**
   * Injected button-permission predicate (threaded from useCrud's `permission` port). `undefined` when
   * none injected — the projector then keeps every button. Carried on the normalized config so the
   * PURE button projectors can drop a button whose `permission` code yields `false`.
   */
  permission?: (code: string) => boolean;
}

function defaultOptions<R>(): CrudOptions<R> {
  return {
    mode: { name: 'remote' },
    pagination: { show: true, currentPage: 1, pageSize: 20, pageSizes: [10, 20, 50, 100] },
    table: { rowKey: 'id', show: true },
    search: { show: true, collapse: false },
    rowHandle: { show: true, width: 200, fixed: 'right', buttons: {} },
    actionbar: { show: true, buttons: {} },
    toolbar: { show: true, buttons: {} },
  };
}

export function buildNormalizedOptions<R = any>(
  userOptions: CrudOptions<R>,
  commonOptions?: CrudOptions<R>,
  injections?: NormalizeInjections,
): NormalizedCrudOptions<R> {
  // ---- settings.plugins (build-time crudOptions transforms) ----
  // BEFORE the defaults/commonOptions merge, run each ENABLED plugin's exec over the USER options in
  // array order (chain: opts = plugin.exec(opts) ?? opts). A plugin may add/modify columns, set
  // defaults, inject buttons, etc. Additive: no settings.plugins → userOptions passes through unchanged.
  // (Operate on a clone so the caller's object is never mutated; the merge below also clones.)
  let pluginned: CrudOptions<R> = userOptions || {};
  const plugins = pluginned.settings?.plugins;
  if (Array.isArray(plugins) && plugins.length) {
    pluginned = cloneDeep(pluginned);
    for (const plugin of plugins) {
      if (!plugin || plugin.enabled === false || typeof plugin.exec !== 'function') continue;
      pluginned = plugin.exec(pluginned) ?? pluginned;
    }
  }

  const merged: CrudOptions<R> = merge(
    {},
    defaultOptions<R>(),
    cloneDeep(commonOptions || {}),
    cloneDeep(pluginned || {}),
  );

  const columnsMap: Record<string, NormalizedColumn<R>> = {};
  const sharedDicts = (merged as any).dicts as Record<string, any> | undefined;

  /**
   * Normalize ONE column (recursing into header-group `children`). `fallbackOrder` is the
   * source-order index used when the column declares no explicit `order`. A column declaring
   * `children` becomes a HEADER GROUP: its children are normalized recursively (a map keys children
   * by their map key; an array uses each child's `key` or its index) and sorted by effective order.
   * Group nodes still pass their `column` props through (so group label/align/fixed work) but carry
   * no dict/edit semantics of their own. Leaf columns normalize exactly as before.
   */
  function normalizeColumn(
    key: string,
    raw: ColumnCompositionProps<R>,
    fallbackOrder: number,
  ): NormalizedColumn<R> {
    // resolve the dict: a column may reference a shared dict by `id` (registered under
    // crudOptions.dicts) — merge the shared config in (column overrides win) and key state by that id;
    // otherwise the dict is keyed by the column key (cloneable: each column owns its state entry).
    let colDict = raw.dict as any;
    let dictId: string | undefined;
    if (colDict) {
      const sharedId = colDict.id as string | undefined;
      if (sharedId && sharedDicts && sharedDicts[sharedId]) {
        colDict = merge({}, sharedDicts[sharedId], colDict);
        dictId = sharedId;
      } else {
        dictId = sharedId ?? key;
      }
    }
    // per-column read-only (the reference crud column.editable disabled/readonly, or `editable: false`
    // shorthand). A column so marked is NEVER turned into an edit buffer field.
    const colEditable = (raw.column as Record<string, any> | undefined)?.editable;
    const editableReadonly =
      colEditable === false ||
      (colEditable != null &&
        typeof colEditable === 'object' &&
        (colEditable.readonly === true || colEditable.disabled === true));

    // header-group children (multi-level header). A keyed map keys each child by its map key; an
    // array uses each child's own `key` (or a synthetic `<parent>__<index>`). Recurse + sort.
    let children: NormalizedColumn<R>[] | undefined;
    if (raw.children != null) {
      const childEntries: Array<{ k: string; c: ColumnCompositionProps<R> }> = Array.isArray(
        raw.children,
      )
        ? raw.children.map((c, idx) => ({ k: (c.key as string) ?? `${key}__${idx}`, c }))
        : Object.keys(raw.children).map((k) => ({
            k,
            c: (raw.children as Record<string, ColumnCompositionProps<R>>)[k],
          }));
      children = childEntries
        .map(({ k, c }, idx) => normalizeColumn(k, c, idx))
        .sort((a, b) => a.order - b.order);
    }

    return {
      key,
      title: raw.title ?? key,
      type: raw.type,
      order: raw.order ?? fallbackOrder,
      column: { show: true, ...(raw.column || {}) },
      form: { show: true, ...(raw.form || {}) },
      addForm: raw.addForm,
      editForm: raw.editForm,
      viewForm: raw.viewForm,
      search: { show: false, ...(raw.search || {}) },
      dict: colDict,
      dictId,
      // exportable defaults to true; only an explicit false excludes the column from CSV export.
      exportable: raw.exportable !== false,
      children,
      editableReadonly,
      valueBuilder: raw.valueBuilder,
      valueResolve: raw.valueResolve,
      raw,
    };
  }

  const columns: NormalizedColumn<R>[] = [];
  let i = 0;
  for (const key of Object.keys(merged.columns || {})) {
    const raw = (merged.columns as any)[key] as ColumnCompositionProps<R>;
    const norm = normalizeColumn(key, raw, i);
    columnsMap[key] = norm;
    columns.push(norm);
    i += 1;
  }
  columns.sort((a, b) => a.order - b.order);

  const pagination = merged.pagination as Required<PaginationOptions>;
  const searchInitialForm: Record<string, any> = {};
  for (const col of columns) {
    if (col.search.show && col.search.value !== undefined) {
      searchInitialForm[col.key] = col.search.value;
    }
  }

  const ed = (merged.table?.editable || {}) as EditableOptions<R>;
  const hasApi = Boolean(ed.updateCell || ed.updateRow);
  const editable: NormalizedEditable<R> = {
    enabled: ed.enabled === true,
    mode: ed.mode || 'row',
    exclusive: ed.exclusive !== false,
    exclusiveEffect: ed.exclusiveEffect || 'cancel',
    activeDefault: ed.activeDefault === true,
    readonly: ed.readonly === true,
    activeTrigger: ed.activeTrigger === 'dblclick' ? 'dblclick' : 'click',
    persistType: ed.persistType || (hasApi ? 'api' : 'local'),
    showAction: ed.showAction !== false,
    updateCell: ed.updateCell,
    updateRow: ed.updateRow,
    isEditable: ed.isEditable,
  };

  // collect the table's extra (non-framework-owned) keys for el-table passthrough. The keys listed
  // here are consumed by the framework (rowKey/show/mode/editable/index/selection/tree/id) —
  // everything else (stripe/border/height/max-height/scroll/…) is forwarded verbatim as nativeProps.
  // `mode` is the render-mode selector (table/virtual/card) — NOT a native el-table prop, so it must
  // NOT leak onto <el-table> (it would warn / mis-bind); it is excluded here and surfaced separately.
  const TABLE_FRAMEWORK_KEYS = new Set([
    'rowKey',
    'show',
    'mode',
    'editable',
    'index',
    'selection',
    'tree',
    'id',
  ]);
  const tableNativeProps: Record<string, any> = {};
  for (const key of Object.keys(merged.table || {})) {
    if (!TABLE_FRAMEWORK_KEYS.has(key)) {
      tableNativeProps[key] = (merged.table as Record<string, any>)[key];
    }
  }

  const cf = (merged.toolbar?.columnsFilter || {}) as { show?: boolean; storage?: boolean };
  const columnsFilter = { show: cf.show === true, storage: cf.storage === true };

  // ---- tabs quick-filter normalization ----
  // resolve the addAll ("全部") tab + its value (the no-filter sentinel), and the static options.
  // dict-driven options are resolved later in the projector (from the loaded dict state), so here we
  // only carry the dict config + its state key; the seed's initial active is the addAll sentinel when
  // addAll is on, else the first static option's value, else undefined.
  const rawTabs = merged.tabs as TabsOptions | undefined;
  let tabs: NormalizedTabs | null = null;
  if (rawTabs && rawTabs.name) {
    const addAllOpt = rawTabs.addAll;
    const addAllOn = addAllOpt !== false; // default true
    const addAllObj = addAllOpt && typeof addAllOpt === 'object' ? addAllOpt : {};
    const allValue = addAllObj.value !== undefined ? addAllObj.value : TABS_ALL;
    const addAll = addAllOn ? { label: addAllObj.label ?? '全部', value: allValue } : null;
    const staticOptions = Array.isArray(rawTabs.options) ? rawTabs.options : [];
    const tabsDictId = rawTabs.dict ? `__tabs__:${rawTabs.name}` : undefined;
    tabs = {
      show: rawTabs.show === true,
      name: rawTabs.name,
      type: rawTabs.type ?? 'tabs',
      options: staticOptions,
      dict: rawTabs.dict,
      dictId: tabsDictId,
      addAll,
      allValue,
    };
    // register the tabs dict under its dictId so the dict effect/reducer resolveDictConfig (which
    // checks config.raw.dicts first) can load it the same way a column dict loads.
    if (rawTabs.dict && tabsDictId) {
      const dicts = ((merged as any).dicts ??= {}) as Record<string, DictConfig>;
      if (!dicts[tabsDictId]) dicts[tabsDictId] = rawTabs.dict;
    }
  }
  // initial active value: addAll sentinel if addAll, else the first static option's value, else undefined.
  const tabsActive: any = tabs
    ? tabs.addAll
      ? tabs.allValue
      : tabs.options.length > 0
        ? tabs.options[0].value
        : undefined
    : undefined;

  const seed: CrudStateSeed = {
    mode: merged.mode || { name: 'remote' },
    pageSize: pagination.pageSize,
    pageSizes: pagination.pageSizes,
    searchInitialForm,
    searchShow: merged.search?.show !== false,
    tabsActive,
    editable: {
      enabled: editable.enabled,
      mode: editable.mode,
      exclusive: editable.exclusive,
      exclusiveEffect: editable.exclusiveEffect,
      activeDefault: editable.activeDefault,
      readonly: editable.readonly,
      activeTrigger: editable.activeTrigger,
    },
  };

  return {
    mode: merged.mode || { name: 'remote' },
    request: merged.request || {},
    columns,
    columnsMap,
    tabs,
    pagination: { show: pagination.show !== false, pageSize: pagination.pageSize, pageSizes: pagination.pageSizes },
    table: {
      rowKey: merged.table?.rowKey || 'id',
      show: merged.table?.show !== false,
      // render mode: default 'table' (byte-equivalent); only 'virtual'/'card' divert the renderer.
      mode: (merged.table?.mode as TableMode) || 'table',
      id: merged.table?.id,
      nativeProps: tableNativeProps,
      index: merged.table?.index
        ? {
            show: merged.table.index.show !== false,
            label: merged.table.index.label ?? '#',
            width: merged.table.index.width ?? 60,
          }
        : undefined,
      selection: merged.table?.selection
        ? { show: merged.table.selection.show !== false, width: merged.table.selection.width ?? 48 }
        : undefined,
      tree: merged.table?.tree
        ? {
            children: merged.table.tree.children ?? 'children',
            hasChildren: merged.table.tree.hasChildren ?? 'hasChildren',
            defaultExpandAll: merged.table.tree.defaultExpandAll === true,
          }
        : undefined,
    },
    // outer-container passthrough (height/class/style/…) — null when unset (no wrapper styling).
    container: (merged.container as ContainerOptions | undefined) ?? null,
    editable,
    columnsFilter,
    rowHandle: merged.rowHandle as any,
    actionbar: merged.actionbar,
    toolbar: merged.toolbar,
    search: {
      show: merged.search?.show !== false,
      collapse: merged.search?.collapse === true,
      autoSearchTrigger: merged.search?.autoSearchTrigger ?? false,
    },
    form: merged.form,
    addForm: merged.addForm,
    editForm: merged.editForm,
    viewForm: merged.viewForm,
    raw: merged,
    seed,
    // injected capabilities carried for the pure projector (undefined when not injected).
    t: injections?.t,
    permission: injections?.permission,
  };
}
