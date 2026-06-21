/**
 * dg-cell-mvi-crud · support/i18n — injected-translator port + the built-in-label KEY map.
 *
 * the reference crud localizes its built-in chrome (新增/编辑/删除/查询/重置/确定/取消/列设置 …). This package is
 * framework-agnostic, so localization is supplied as an INJECTED translator port (same pattern as the
 * `CrudUiPort` / storage ports): `useCrud` threads an optional `i18n` fn into the store, which makes it
 * available to the PURE projector (carried on the normalized config — see optionsBuild). The projector
 * resolves every built-in label through `resolveT(translator, key, fallback)`.
 *
 * Behavior-equivalence guarantee: when NO translator is injected, every label resolves to its default
 * Chinese string (the same literal the projector emitted before i18n existed) — existing demos are
 * byte-identical. When a translator IS injected, it may return localized text; a missing translation
 * (empty / undefined / the key echoed back) still falls back to the provided default.
 */

/**
 * The injected translator: `(key, fallback?) => string`. The projector always passes a `fallback`
 * (the default Chinese label), so a translator that doesn't know a key can safely return the key,
 * undefined, or '' — `resolveT` recovers the fallback in every case.
 */
export type CrudTranslator = (key: string, fallback?: string) => string;

/**
 * Resolve a built-in label through the (possibly absent) translator. The resilient resolver:
 * - no translator → the fallback (identical to pre-i18n behavior).
 * - translator returns empty / undefined / the key itself (a common "missing key" signal) → fallback.
 * - otherwise → the translator's (localized) result.
 */
export function resolveT(
  translator: CrudTranslator | undefined,
  key: string,
  fallback: string,
): string {
  if (!translator) return fallback;
  let out: string | undefined;
  try {
    out = translator(key, fallback);
  } catch {
    return fallback;
  }
  if (out == null || out === '' || out === key) return fallback;
  return out;
}

/**
 * Stable keys for every built-in label the projector emits (framework chrome). Authors who inject a
 * translator localize against these keys; the second arg to `resolveT` is always the default Chinese.
 * Namespaced under `fs.*` to mirror the reference crud's i18n key space and avoid clashing with app keys.
 */
export const I18N_KEY = {
  // actionbar (above-table primary actions)
  actionbarAdd: 'fs.actionbar.add',
  // rowHandle (per-row operations column)
  rowHandleTitle: 'fs.rowHandle.title',
  rowHandleView: 'fs.rowHandle.view',
  rowHandleEdit: 'fs.rowHandle.edit',
  rowHandleRemove: 'fs.rowHandle.remove',
  // toolbar (table toolbar)
  toolbarRefresh: 'fs.toolbar.refresh',
  toolbarCompact: 'fs.toolbar.compact',
  toolbarExport: 'fs.toolbar.export',
  toolbarColumnsFilter: 'fs.toolbar.columnFilter',
  // remove confirm (rowHandle.remove default confirm)
  removeConfirmTitle: 'fs.rowHandle.removeConfirmTitle',
  removeConfirmMessage: 'fs.rowHandle.removeConfirmMessage',
  // form (dialog chrome)
  formAdd: 'fs.form.add',
  formEdit: 'fs.form.edit',
  formView: 'fs.form.view',
  formCancel: 'fs.form.cancel',
  formOk: 'fs.form.save',
  // form dirty-close confirm (DgFormWrapper saveRemind guard — was hardcoded in the view).
  formCloseConfirmTitle: 'fs.form.closeConfirmTitle',
  formCloseConfirmMessage: 'fs.form.closeConfirmMessage',
  // editable inline-row action column (DgTable's contextual 操作/保存/取消/编辑/删除 — were hardcoded).
  editableOperations: 'fs.editable.operations',
  editableSave: 'fs.editable.save',
  editableCancel: 'fs.editable.cancel',
  editableEdit: 'fs.editable.edit',
  editableRemove: 'fs.editable.remove',
  // sub-table virtual-model editor (DgSubTable's 操作/删除 chrome — were hardcoded). 添加一行 below.
  subTableOperations: 'fs.subTable.operations',
  subTableRemove: 'fs.subTable.remove',
  subTableAddRow: 'fs.subTable.addRow',
  // search bar (the query-bar chrome — the 查询/重置 buttons + the default input placeholder PREFIX,
  // concatenated with the field title in the view: `${placeholderPrefix}${title}` → "请输入用户名" /
  // "Enter Username"). These were the missing keys (the search labels were hardcoded in the view).
  searchSearch: 'fs.search.search',
  searchReset: 'fs.search.reset',
  searchPlaceholder: 'fs.search.placeholder',
  // column-settings dialog (opened from the toolbar 列设置 button) — its title + footer buttons.
  columnsFilterTitle: 'fs.columnsFilter.title',
  columnsFilterReset: 'fs.columnsFilter.reset',
  columnsFilterCancel: 'fs.columnsFilter.cancel',
  columnsFilterConfirm: 'fs.columnsFilter.confirm',
} as const;

export type I18nKey = (typeof I18N_KEY)[keyof typeof I18N_KEY];
