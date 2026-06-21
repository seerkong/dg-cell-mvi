/**
 * dg-cell-mvi-vue — the UI-library-NEUTRAL Vue 3 adaptation of dg-cell-mvi-crud.
 *
 * This package contains ONLY what is neutral across UI libraries: the `useCrud` composable (binds a crud
 * store's viewModel to a Vue Ref + exposes bound commands), the `UiRegistry` INTERFACE + injection keys
 * (the swappable UI seam — its concrete Element impl lives in the Element UI package), the UI-neutral
 * helpers (`DgRender` / `exportCsv` / `cellResolve`), and a re-export of the crud contract.
 *
 * It has ZERO UI-library dependency and renders NO `el-*` components — every `Fs*` el-* renderer +
 * `elementUiRegistry` moved to the Element UI package. An app picks a UI package which re-exports this
 * package's surface for single-point imports.
 */
export { useCrud } from './useCrud';
export type { UseCrudOptions, UseCrudRet, CrudCommands, CreateCrudContext } from './useCrud';

// admin chassis binding (framework addition · add-admin-chassis P1·T1.4): the GENERIC, UI-neutral
// data-ownership-actor binding composable — the admin counterpart of `useCrud`, mechanism-identical
// (useGraphSignal bridge + onScopeDispose). Binds ANY dg-cell-mvi-core single-atom store (each admin
// actor is one) to a Vue Ref; commands are composed by the caller from the contract's event creators
// (optionally via the `bindCommands` sugar). No element-plus / no admin-schema dependency.
export { useAdminStore, bindCommands } from './useAdminStore';
export type {
  UseAdminStoreRet,
  EventCreatorMap,
  BoundCommands,
} from './useAdminStore';

// v-permission directive (framework addition · add-admin-chassis P5·T5.2): the UI-library-NEUTRAL,
// domain-NEUTRAL element-permission directive. `createPermissionDirective(can)` builds a Vue directive
// from an INJECTED `can(code)` predicate (a directive cannot inject() the chassis, so the predicate is
// closed over at install time). The app composes `can` from the permission actor's live codes. The
// directive knows no admin schema and reads no store — it only calls the predicate (decisions §8).
export { createPermissionDirective } from './permissionDirective';
export type { PermissionPredicate, PermissionValue } from './permissionDirective';

// vue-i18n adapter (framework addition · add-admin-chassis P6·T6.1): wraps a vue-i18n instance into the
// chassis I18nPort (structurally — see VueI18nPort). vue-i18n is an OPTIONAL peer; this module imports no
// admin schema (stays neutral, decisions §8) and no vue-i18n symbol (structural typing only). The app
// injects the returned port + drives `setLocale` from the settings actor's projected locale. The port's
// `t` is crud-`CrudTranslator`-compatible, so the SAME instance localizes crud chrome via useCrud({i18n}).
export { createVueI18nPort } from './vueI18nPort';
export type { VueI18nPort, VueI18nLike } from './vueI18nPort';

// UI-neutral render-hook host (calls opaque user render fns in the Vue layer; no UI-library coupling).
export { default as DgRender } from './components/DgRender';

// UI-neutral helpers.
export { exportCsv } from './support/exportCsv';
// shared read-mode cell resolution (used by DgCell + the virtual/card renderers in the UI package).
export { resolveCellProps, resolveCellText } from './support/cellResolve';

// The swappable UI registry INTERFACE + injection key (P3, crud.ui-registry) — UI-library-neutral. The
// concrete Element implementation (`elementUiRegistry` / `elementUiAdapter` / `COMPONENT_ALIASES` /
// `resolveElementComponentSpec`) lives in the Element UI package. Back-compat F10 type surface
// (UiAdapter / UiKind / UiConfirmOptions / UiNotifyOptions / UiMessageOptions / UI_ADAPTER_KEY) is
// exported alongside the P3 registry surface (UiRegistry / ResolvedComponentSpec / UI_REGISTRY_KEY).
export {
  // F10 back-compat (injection key + types):
  UI_ADAPTER_KEY,
  type UiAdapter,
  type UiKind,
  type UiConfirmOptions,
  type UiNotifyOptions,
  type UiMessageOptions,
  // P3 registry (interface + key + spec type):
  UI_REGISTRY_KEY,
  type UiRegistry,
  type ResolvedComponentSpec,
} from './support/uiRegistry';

// The crud translator injection seam (P6 i18n GAP): useCrud provides the resolved translator under
// CRUD_I18N_KEY so name-rendered form components off the projected-binding path (DgSubTable) can localize
// their own built-in chrome. `fallbackTranslator` is the inject default (returns the fallback) — keeps a
// standalone component byte-equivalent.
export { CRUD_I18N_KEY, fallbackTranslator } from './support/i18nInject';

// Re-export the framework-agnostic crud contract for convenience.
export * from 'dg-cell-mvi-crud';
