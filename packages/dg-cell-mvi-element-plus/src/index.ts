/**
 * dg-cell-mvi-element-plus — Element Plus view layer for dg-cell-mvi-crud.
 *
 * This package owns ALL the Fs* components that render `el-*` plus `elementUiRegistry` (the Element
 * impl of `dg-cell-mvi-vue`'s UI-neutral `UiRegistry`). It depends on `dg-cell-mvi-vue` (useCrud +
 * the UiRegistry interface + injection keys + UI-neutral helpers) and on element-plus.
 *
 * For ergonomics it ALSO re-exports `dg-cell-mvi-vue`'s `useCrud` (+ its types) and the full crud
 * contract (`export * from 'dg-cell-mvi-vue'`, which itself re-exports `dg-cell-mvi-crud`), so an
 * Element-Plus app imports EVERYTHING from this single package.
 *
 * WIRING (how the Element registry defaults in without `dg-cell-mvi-vue` depending on element-plus):
 * vue's `useCrud` takes `uiRegistry` with NO element default (it must stay UI-neutral). This package
 * re-exports a `useCrud` wrapper that DEFAULTS `uiRegistry` to `elementUiRegistry`, so an app importing
 * `useCrud` from here gets the Element registry provided to descendants (component resolution +
 * confirm/notify/message) automatically — behavior-identical to before the split. (The Fs* components
 * additionally fall back to `elementUiRegistry` via their own `inject(UI_ADAPTER_KEY, elementUiRegistry)`
 * default, so standalone component usage without useCrud still resolves the Element registry.)
 */

// ---- the Element registry impl (the Element implementation of dg-cell-mvi-vue's UiRegistry) ----
export {
  elementUiRegistry,
  elementUiAdapter,
  COMPONENT_ALIASES,
  resolveElementComponentSpec,
} from './support/elementUiRegistry';

// ---- the useCrud wrapper that defaults the UI registry to the Element registry ----
export { useCrud } from './useCrud';

// ---- all Fs* components (el-* rendering) ----
export { default as DgCrud } from './components/DgCrud.vue';
export { default as DgTable } from './components/DgTable.vue';
export { default as DgVirtualTable } from './components/DgVirtualTable.vue';
export { default as DgCardList } from './components/DgCardList.vue';
export { default as DgSearch } from './components/DgSearch.vue';
export { default as DgTabs } from './components/DgTabs.vue';
export { default as DgPagination } from './components/DgPagination.vue';
export { default as DgForm } from './components/DgForm.vue';
export { default as DgFormItem } from './components/DgFormItem.vue';
export { default as DgFormWrapper } from './components/DgFormWrapper.vue';
export { default as DgComponentRender } from './components/DgComponentRender';
export { default as DgButton } from './components/DgButton';
export { default as DgRowHandle } from './components/DgRowHandle.vue';
export { default as DgActionbar } from './components/DgActionbar.vue';
export { default as DgToolbar } from './components/DgToolbar.vue';
export { default as DgColumnsFilter } from './components/DgColumnsFilter.vue';
export { default as DgCell } from './components/DgCell';
export { default as DgSubTable } from './components/DgSubTable.vue';

// ---- admin chassis render components (pure UI: props/events only, NO admin-logic/admin-contract dep) ----
export { default as DgAdminOutside } from './components/DgAdminOutside.vue';
export { default as DgLogin } from './components/DgLogin.vue';
export { default as DgAdminTabs } from './components/DgAdminTabs.vue';
export type { AdminTabItem } from './components/DgAdminTabs.types';
// layout chrome (P4·T4.2): sidebar (multi-level + collapse + iconify), header (fold/user-dropdown/logout),
// breadcrumb. All PURE UI — they consume the menu/breadcrumb PROJECTIONS via props (decisions §9), own no
// store/contract/router. DgAdminMenuNode is the sidebar's internal recursion carrier (not re-exported).
export { default as DgAdminSidebar } from './components/DgAdminSidebar.vue';
export { default as DgAdminHeader } from './components/DgAdminHeader.vue';
export { default as DgAdminBreadcrumb } from './components/DgAdminBreadcrumb.vue';
export type { AdminMenuItem, AdminBreadcrumbItem } from './components/DgAdminSidebar.types';
// settings drawer (P6·T6.2): dark switch + theme-color presets/picker + language select. PURE UI — props
// in / `update:*` events out (the host binds them to the settings actor). EP-native dark via ThemePort.
export { default as DgAdminSettings } from './components/DgAdminSettings.vue';
export type { AdminSettingsLocale } from './components/DgAdminSettings.types';

// ---- the Element-Plus ThemePort adapter (EP-native dark `html.dark` + `--el-color-primary` family) ----
// structurally a contract `ThemePort` (no admin-contract import; same neutrality as dg-cell-mvi-vue's
// vueI18nPort). The app injects it + drives applyTheme/applyPrimaryColor from the settings actor (T6.2).
export { createElementThemePort } from './support/elementThemePort';
export type {
  ElementThemePort,
  CreateElementThemePortOptions,
} from './support/elementThemePort';

// ---- re-export dg-cell-mvi-vue (UI-neutral): UiRegistry interface + injection keys + neutral helpers
//      (DgRender / exportCsv / cellResolve) + types, AND transitively the crud contract
//      (dg-cell-mvi-vue does `export * from 'dg-cell-mvi-crud'`). NOTE: vue's `useCrud` is shadowed by
//      this package's wrapper above (an explicit `export { useCrud } from './useCrud'` takes precedence
//      over a `export *` star), so importing `useCrud` from here yields the Element-defaulting wrapper. ----
export * from 'dg-cell-mvi-vue';
