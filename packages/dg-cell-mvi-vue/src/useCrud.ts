/**
 * dg-cell-mvi-vue · useCrud — the composable front door.
 *
 * Owns a crud store and bridges its `viewModel` (CrudBinding) signal to a Vue Ref via the depa vue
 * adapter (useGraphSignal). Returns `{ crudBinding, commands, store }`. `commands` are bound
 * dispatchers; `createCrudOptions` receives them (forward-declared) so config can reference them.
 */
import { onMounted, onScopeDispose, provide, type Ref } from 'vue';
import { useGraphSignal } from 'depa-data-graph-vue';

import {
  UI_ADAPTER_KEY,
  type UiAdapter,
  type UiRegistry,
} from './support/uiRegistry';
import { CRUD_I18N_KEY } from './support/i18nInject';

import {
  createCrudStore,
  doRefresh,
  doSearch,
  resetSearch,
  toggleSearch,
  select,
  setPage,
  setPageSize,
  setSearchField,
  setSort,
  setActiveTab,
  openAdd,
  openEdit,
  openView,
  doRemove,
  setFormField,
  doSubmit,
  closeForm,
  setCompact,
  loadDict,
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
  resolveT,
  type ColumnsFilterOverrides,
  type CrudBinding,
  type CrudOptions,
  type CrudStore,
  type CrudUiPort,
  type CrudTranslator,
} from 'dg-cell-mvi-crud';

export interface CrudCommands<R = any> {
  doRefresh: (p?: { goFirstPage?: boolean; silence?: boolean }) => void;
  doSearch: (p?: { form?: Record<string, any>; goFirstPage?: boolean; mergeForm?: boolean }) => void;
  setSearchField: (key: string, value: any) => void;
  resetSearch: () => void;
  toggleSearch: () => void;
  setPage: (currentPage: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (p: { prop?: string; order?: 'asc' | 'desc' | null; asc?: boolean; isServerSort?: boolean }) => void;
  select: (rowKeys: any[]) => void;
  /** pick the active tab (tabs quick-filter): filters the list by config.tabs.name, resets to page 1. */
  setActiveTab: (value: any) => void;
  openAdd: (p?: { row?: any }) => void;
  openEdit: (p: { row?: any; index?: number }) => void;
  openView: (p: { row?: any; index?: number }) => void;
  doRemove: (p: { row?: any; index?: number; noConfirm?: boolean }) => void;
  setFormField: (key: string, value: any) => void;
  doSubmit: () => void;
  closeForm: () => void;
  setCompact: (value: boolean) => void;
  setColumnsFilter: (overrides: ColumnsFilterOverrides) => void;
  resetColumnsFilter: () => void;
  loadDict: (p: { dictId: string; value?: any; reload?: boolean }) => void;
  // ---- inline editing ----
  editableEnable: (p?: { mode?: 'free' | 'row' | 'cell'; exclusive?: boolean; exclusiveEffect?: 'cancel' | 'save'; activeDefault?: boolean }) => void;
  editableDisable: () => void;
  editableStartRowEdit: (p: { rowId: any; index: number }) => void;
  editableStartCellEdit: (p: { rowId: any; index: number; key: string }) => void;
  editableSetCellValue: (p: { rowId: any; key: string; value: any }) => void;
  /** programmatic update-cell (MVI counterpart of getEditableCell().setValue) — by rowId OR index. */
  editableUpdateCell: (p: { rowId?: any; index?: number; colKey: string; value: any }) => void;
  editableSaveRow: (p: { rowId: any; index: number }) => void;
  editableSaveCell: (p: { rowId: any; index: number; key: string }) => void;
  editableSaveAll: () => void;
  editableCancelRow: (p: { rowId: any; index: number }) => void;
  editableCancelCell: (p: { rowId: any; key: string }) => void;
  editableAddRow: (p?: { row?: Record<string, any> }) => void;
  editableRemoveRow: (p: { rowId: any; index: number }) => void;
}

/**
 * The context handed to `createCrudOptions`. Carries the bound `commands` (so config can reference
 * dispatchers) AND the resolved translator `t` (so user CONFIG — not just framework chrome — can
 * localize labels, e.g. `title: t('mod.field', '字段')`). `t` is always present: when no `i18n` is
 * injected it is the identity-fallback (`(key, fallback) => fallback ?? key`).
 */
export interface CreateCrudContext<R = any> {
  commands: CrudCommands<R>;
  /** resolve a label through the injected translator (falls back to the provided default). */
  t: CrudTranslator;
}

export interface UseCrudOptions<R = any> {
  createCrudOptions: (ctx: CreateCrudContext<R>) => { crudOptions: CrudOptions<R> };
  commonOptions?: CrudOptions<R>;
  /** doRefresh on mount (default true). */
  immediate?: boolean;
  /**
   * Injected translator for built-in framework chrome labels (新增/编辑/删除/查询/重置/确定/取消/列设置 …)
   * AND for user config via the `t` handed to `createCrudOptions`. Either a bare `(key, fallback?) =>
   * string` fn or `{ t }`. Absent → built-in labels stay the default Chinese (behavior-equivalent).
   */
  i18n?: CrudTranslator | { t: CrudTranslator };
  /**
   * Injected button-permission predicate. A button carrying a
   * `permission` code is dropped from the projected binding when `permission(code) === false`. Absent
   * → every button is kept.
   */
  permission?: (code: string) => boolean;
  /**
   * Swappable UI registry: component resolution (`resolveComponent`) + imperative UI
   * (confirm/notify/message). It is THE single UI-coupling object — it backs the crud store's
   * `CrudUiPort` (built below) AND is provided to descendant components (via `UI_ADAPTER_KEY` so
   * DgComponentRender resolves components through it and DgRowHandle/DgFormWrapper inject it for
   * confirm). NO default here — this package is UI-library-neutral (zero UI-library dependency), so the
   * registry is supplied by the UI package: the Element UI package's `useCrud` wrapper defaults it to
   * its `elementUiRegistry`, and a future `dg-cell-mvi-antd` would default its own `antdUiRegistry`.
   * When neither `uiRegistry` nor `uiAdapter` is given, nothing is provided (descendant components fall
   * back to their own injected default) and the store gets a no-op imperative-UI port.
   */
  uiRegistry?: UiRegistry;
  /**
   * BACK-COMPAT alias of `uiRegistry` (F10 name). A bare imperative-UI adapter (confirm/notify/message,
   * no component resolution) — when only this is set, component resolution is left to descendant
   * components' own injected default (this neutral package supplies no UI library). PRECEDENCE:
   * `uiRegistry` wins when both are set. Prefer `uiRegistry`.
   */
  uiAdapter?: UiAdapter;
  /**
   * Low-level confirm/notify port handed straight to the crud store. Escape hatch that overrides
   * the port derived from `uiAdapter`; normally leave unset and pass `uiAdapter` instead.
   */
  ui?: CrudUiPort;
}

export interface UseCrudRet<R = any> {
  crudBinding: Ref<CrudBinding<R>>;
  commands: CrudCommands<R>;
  store: CrudStore<R>;
}

export function useCrud<R = any>(options: UseCrudOptions<R>): UseCrudRet<R> {
  // forward-declared commands so createCrudOptions can capture the reference
  const commands = {} as CrudCommands<R>;

  // Normalize the injected translator: accept a bare fn or `{ t }`. The `t` handed to createCrudOptions
  // is always defined — when nothing is injected it is the identity-fallback (returns the default), so
  // config using `t(key, fallback)` works whether or not localization is wired (behavior-equivalent).
  const injectedTranslator: CrudTranslator | undefined =
    typeof options.i18n === 'function' ? options.i18n : options.i18n?.t;
  const t: CrudTranslator = (key, fallback) => resolveT(injectedTranslator, key, fallback ?? '');

  const { crudOptions } = options.createCrudOptions({ commands, t });

  // The swappable UI registry. THE single source of UI coupling: descendant components inject it
  // (UI_ADAPTER_KEY) for both component resolution AND confirm/notify/message, and the crud store's
  // CrudUiPort is built from it below — so confirm/notify behavior is identical whether triggered by a
  // component or by a crud effect. THIS PACKAGE IS UI-LIBRARY-NEUTRAL (zero UI-library dependency), so
  // there is NO default registry here — the UI package supplies it (the Element UI package's useCrud
  // wrapper passes its `elementUiRegistry`).
  //   - `uiRegistry` wins when set (the common path — the UI package's wrapper passes its registry).
  //   - else a back-compat `uiAdapter` (bare imperative-UI port, no resolveComponent) is adapted into a
  //     registry whose `resolveComponent` returns undefined (no UI library to resolve against here —
  //     DgComponentRender then applies its own terminal fallback / its own injected default).
  //   - else nothing: leave the registry unprovided so descendant components use their OWN injected
  //     default (in the Element UI package that is its `elementUiRegistry`), and give the store a no-op
  //     imperative-UI port.
  const adapter: UiRegistry | undefined = options.uiRegistry
    ? options.uiRegistry
    : options.uiAdapter
      ? {
          resolveComponent: () => undefined,
          confirm: options.uiAdapter.confirm.bind(options.uiAdapter),
          notify: options.uiAdapter.notify.bind(options.uiAdapter),
          message: options.uiAdapter.message.bind(options.uiAdapter),
        }
      : undefined;
  // Provide only when a registry was supplied — otherwise descendants keep their own inject default.
  if (adapter) provide(UI_ADAPTER_KEY, adapter);
  // Provide the resolved translator to descendants (additive): name-rendered form components off the
  // projected-binding path (e.g. DgSubTable) inject it to localize their own built-in chrome through the
  // SAME translator the projector uses. `t` is always defined (identity-fallback when no i18n injected),
  // so an unprovided/standalone component falls back to the default Chinese — byte-equivalent.
  provide(CRUD_I18N_KEY, t);

  // The framework-agnostic crud package only declares the CrudUiPort interface; bridge it onto the
  // adapter (behavior-equivalent to the prior inline Element-Plus port). An explicit `options.ui`
  // still wins as a low-level escape hatch. With no registry the port is a no-op (a UI-neutral build
  // with no UI library wired makes no confirm/notify calls).
  const ui: CrudUiPort =
    options.ui ||
    (adapter
      ? {
          confirm: (o) =>
            adapter.confirm({
              message: o.message || '确定执行此操作?',
              title: o.title || '提示',
              type: 'warning',
            }),
          notify: (kind, message) => adapter.notify({ kind, message }),
        }
      : {
          confirm: () => Promise.resolve(true),
          notify: () => {},
        });

  // the browser localStorage backs column-settings persistence (no-op when unavailable, e.g. SSR).
  const storage =
    typeof localStorage !== 'undefined'
      ? {
          getItem: (k: string) => localStorage.getItem(k),
          setItem: (k: string, v: string) => localStorage.setItem(k, v),
        }
      : undefined;

  const store = createCrudStore<R>({
    crudOptions,
    commonOptions: options.commonOptions,
    ui,
    storage,
    // injected capabilities — threaded onto the normalized
    // config so the PURE projector localizes built-in labels + filters permissioned buttons.
    i18n: injectedTranslator,
    permission: options.permission,
  });

  const d = store.dispatch;
  Object.assign(commands, {
    doRefresh: (p?: any) => d(doRefresh(p)),
    doSearch: (p?: any) => d(doSearch(p)),
    setSearchField: (k: string, v: any) => d(setSearchField(k, v)),
    resetSearch: () => d(resetSearch()),
    toggleSearch: () => d(toggleSearch()),
    setPage: (n: number) => d(setPage(n)),
    setPageSize: (n: number) => d(setPageSize(n)),
    setSort: (p: any) => d(setSort(p)),
    select: (keys: any[]) => d(select(keys)),
    setActiveTab: (v: any) => d(setActiveTab(v)),
    openAdd: (p?: any) => d(openAdd(p)),
    openEdit: (p: any) => d(openEdit(p)),
    openView: (p: any) => d(openView(p)),
    doRemove: (p: any) => d(doRemove(p)),
    setFormField: (k: string, v: any) => d(setFormField(k, v)),
    doSubmit: () => d(doSubmit()),
    closeForm: () => d(closeForm()),
    setCompact: (v: boolean) => d(setCompact(v)),
    setColumnsFilter: (o: ColumnsFilterOverrides) => d(setColumnsFilter(o)),
    resetColumnsFilter: () => d(resetColumnsFilter()),
    loadDict: (p: { dictId: string; value?: any; reload?: boolean }) => d(loadDict(p)),
    editableEnable: (p?: any) => d(editableEnable(p)),
    editableDisable: () => d(editableDisable()),
    editableStartRowEdit: (p: any) => d(editableStartRowEdit(p)),
    editableStartCellEdit: (p: any) => d(editableStartCellEdit(p)),
    editableSetCellValue: (p: any) => d(editableSetCellValue(p)),
    editableUpdateCell: (p: any) => d(editableUpdateCell(p)),
    editableSaveRow: (p: any) => d(editableSaveRow(p)),
    editableSaveCell: (p: any) => d(editableSaveCell(p)),
    editableSaveAll: () => d(editableSaveAll()),
    editableCancelRow: (p: any) => d(editableCancelRow(p)),
    editableCancelCell: (p: any) => d(editableCancelCell(p)),
    editableAddRow: (p?: any) => d(editableAddRow(p)),
    editableRemoveRow: (p: any) => d(editableRemoveRow(p)),
  } satisfies CrudCommands<R>);

  // THE bridge: store.viewModel signal -> Vue Ref (depa watch under the hood)
  const crudBinding = useGraphSignal<CrudBinding<R>, unknown>(store.graph, 'viewModel');

  onScopeDispose(() => store.dispose());
  if (options.immediate !== false) {
    onMounted(() => {
      commands.doRefresh();
      // eagerly load every column-backed dict so cells + form selects have options/labels.
      // dedup by dictId so a shared dict (multiple columns referencing one id) loads only once.
      // Recurse into header-group `children` (multi-level headers) so a dict-backed leaf nested under
      // a group still gets loaded.
      const loadedDictIds = new Set<string>();
      const loadColumnDicts = (cols: ReadonlyArray<unknown>): void => {
        for (const col of cols) {
          const c = col as { dict?: unknown; dictId?: string; children?: unknown[] };
          if (c.dict && c.dictId && !loadedDictIds.has(c.dictId)) {
            loadedDictIds.add(c.dictId);
            commands.loadDict({ dictId: c.dictId });
          }
          if (Array.isArray(c.children) && c.children.length) loadColumnDicts(c.children);
        }
      };
      loadColumnDicts(store.config.columns);
      // also load the tabs quick-filter dict (when the tabs bar resolves its options from a dict).
      const tabs = (store.config as { tabs?: { dict?: unknown; dictId?: string } }).tabs;
      if (tabs?.dict && tabs.dictId && !loadedDictIds.has(tabs.dictId)) {
        loadedDictIds.add(tabs.dictId);
        commands.loadDict({ dictId: tabs.dictId });
      }
    });
  }

  return { crudBinding, commands, store };
}
