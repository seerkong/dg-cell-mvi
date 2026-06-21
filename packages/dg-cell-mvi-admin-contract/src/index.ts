/**
 * dg-cell-mvi-admin-contract — DEPA admin chassis *contract* layer (the bottom, pure declarations).
 *
 * Per decisions.md §7–§10 and design.md «DEPA 重构» (A–F):
 *   - Data 维 (design §A): the four 1-级 authoritative-fact state atoms (session/tabs/permission/
 *     settings) + the 6-级 derived-projection shapes (menu/breadcrumb) live here as pure types.
 *   - Actor 维 (design §B): each actor's single-write command vocabulary (discriminated unions) +
 *     the cross-actor domain messages.
 *   - Effect 维 (design §C): all chassis side effects are shaped `fn(runtime, input, config)` where
 *     `runtime` is an injected *port*. logic depends only on these port *signatures*, never on a
 *     concrete IO/browser/vue/el implementation. support/render supply the implementations.
 *
 * This package owns NO behavior and performs NO IO. Adding members later is a contract-only, backward
 * additive change (design «兼容性设计»).
 *
 * Dependency policy: `dg-cell-mvi-core` is consumed from source via tsconfig `paths`;
 * `depa-data-graph-core` is an npm package resolved through node_modules (transitive: core's source
 * imports it). No infra-dev path alias is used for any depa-* package in this new chassis.
 */

// --- Data 维: state atoms (T1.2) + auth data types (T2.1) ---
export type {
  UserInfo,
  SessionState,
  SessionStatus,
  LoginRequest,
  LoginResponse,
  TabItem,
  TabsState,
  PermissionState,
  SettingsState,
} from './state';
export {
  createInitialSessionState,
  createInitialTabsState,
  createInitialPermissionState,
  createInitialSettingsState,
} from './state';

// --- Actor 维: per-actor commands + cross-actor domain messages (T1.2) + auth commands (T2.1) ---
export {
  SESSION_EVENT,
  setToken,
  setUserInfo,
  clearSession,
  login,
  logout,
  loadUserInfo,
  hydrate,
  loginFailed,
  TABS_EVENT,
  openTab,
  closeTab,
  closeOthers,
  closeAll,
  setCurrent,
  PERMISSION_EVENT,
  setCodes,
  clearCodes,
  loadPermissions,
  SETTINGS_EVENT,
  setTheme,
  setLocale,
  setPrimaryColor,
  hydrateSettings,
  DOMAIN_MESSAGE,
  loggedIn,
  loggedOut,
  permissionLoaded,
} from './events';
export type {
  SessionEventType,
  SessionCommand,
  TabsEventType,
  TabsCommand,
  PermissionEventType,
  PermissionCommand,
  SettingsEventType,
  SettingsCommand,
  DomainMessageType,
  DomainMessage,
} from './events';

// --- Data 维: per-actor read-only viewModel shapes (T1.2) ---
export type {
  SessionBinding,
  TabsBinding,
  PermissionBinding,
  SettingsBinding,
} from './bindings';

// --- Data 维: 6-级 derived projections — shapes + pure-function contracts (T1.2, design §9) ---
export type {
  RouteMeta,
  RouteDescriptor,
  MenuItem,
  BreadcrumbItem,
  ProjectMenu,
  ProjectBreadcrumb,
  HasPermission,
} from './projection';

// ===========================================================================
// Effect 维 injection-seam ports.
//   HttpPort / StoragePort: members fleshed out in T1.3 (concrete impls in admin-support).
//   RouterPort / I18nPort / ThemePort: signature placeholders (P2/P6, render-layer adapters).
// ===========================================================================

// HttpPort + StoragePort transport/persistence seams + their config/value types (T1.3).
// I18nPort localization seam fleshed out in P6·T6.1 (vue-i18n adapter in dg-cell-mvi-vue).
export type {
  HttpMethod,
  HttpRequestConfig,
  HttpPort,
  StoragePort,
  I18nPort,
  ThemePort,
} from './ports';

// --- Effect 维: the chassis effect-request vocabulary (T2.1 auth/persist; T5.1 permission load) ---
export {
  SESSION_EFFECT,
  loginEffect,
  logoutEffect,
  loadUserInfoEffect,
  persistTokenEffect,
  hydrateTokenEffect,
  PERMISSION_EFFECT,
  loadPermissionsEffect,
  SETTINGS_EFFECT,
  persistSettingsEffect,
  hydrateSettingsEffect,
} from './effects';
export type {
  SessionEffectType,
  SessionEffectRequest,
  PermissionEffectType,
  PermissionEffectRequest,
  SettingsEffectType,
  SettingsEffectRequest,
} from './effects';

/**
 * RouterPort — navigation seam (RESERVED). router-as-effect is REALIZED in the app router/guard layer
 * (design §F: "vue-router stays the ENGINE; the guard is the integration boundary"): the guards read the
 * session/permission PROJECTIONS and run the PURE decisions `resolveAuthRedirect` / `resolveRoutePermission`
 * (admin-logic), and `afterEach` feeds the route change as a MESSAGE to the `tabs` actor (openTab). That
 * design needs no injected router port — vue-router is used directly at the composition root.
 *
 * This interface is therefore intentionally a member-less RESERVED seam (kept for symmetry with the other
 * ports + as the extension point IF a future consumer needs a fully pluggable, framework-agnostic router
 * abstraction, e.g. to drive navigation from admin-logic). Adding members later is backward-additive.
 */
export interface RouterPort {}

// I18nPort — localization seam (P6·T6.1). Fleshed out in ./ports (members t/setLocale/getLocale) and
// re-exported above with HttpPort/StoragePort; the vue-i18n adapter lives in dg-cell-mvi-vue.
//
// ThemePort — theming seam (P6·T6.2, design §6 EP-native dark + §F P6). Fleshed out in ./ports (members
// applyTheme + optional applyPrimaryColor) and re-exported above with the other ports; the EP-native
// adapter (`createElementThemePort`) lives in dg-cell-mvi-element-plus.
