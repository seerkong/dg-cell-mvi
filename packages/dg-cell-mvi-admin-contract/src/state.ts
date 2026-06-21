/**
 * dg-cell-mvi-admin-contract · state — the data-ownership actor state atoms (DEPA Data 维, design §A).
 *
 * Each of the four 1-级 authoritative facts is one immutable atom owned by exactly one actor:
 *   session  (token / userInfo)        ← session actor    (localStorage is its shadow)
 *   tabs     (opened / current / keepAlive) ← tabs actor   (persisted per user)
 *   permission (codes)                 ← permission actor (loaded from remote)
 *   settings (theme / locale)          ← settings actor   (persisted)
 *
 * Pure declarations only: no behavior, no IO. The logic package builds a `dg-cell-mvi-core`
 * single-atom store per actor over these shapes (reduce pure, IO at the effect boundary).
 *
 * `createInitial*State` factories live here (not in logic) because they describe the *shape's* zero
 * value — a contract concern (the seed an actor starts from), mirroring crud's `createInitialCrudState`
 * placement only in spirit (crud keeps it in its contract layer too).
 */

// ---------------------------------------------------------------------------
// session (1 authoritative_fact · owner: session actor)
// ---------------------------------------------------------------------------

/** Minimal shape of the authenticated user (extensible — concrete apps widen via the generic). */
export interface UserInfo {
  id?: string | number;
  username?: string;
  nickname?: string;
  avatar?: string;
  /** roles/extra fields are app-specific; kept open so apps need not fork the type. */
  [k: string]: unknown;
}

/**
 * The credentials a `login` command carries (the request body the auth HttpPort effect posts). Open-ended
 * (`[k]`) so apps can add captcha/tenant/etc. without forking the type — username/password are the
 * borrowed canonical fields (ref project `LoginReq`).
 */
export interface LoginRequest {
  username: string;
  password: string;
  [k: string]: unknown;
}

/**
 * What a successful `login` resolves to. `token` is mandatory; `userInfo` is optional — some backends
 * return the profile inline with the token, others require a follow-up `mine` call. The auth effect
 * handles both (uses the inline profile when present, else triggers loadUserInfo). Open-ended for
 * extra envelope fields (e.g. `expire`, ref project `LoginRes`).
 */
export interface LoginResponse {
  token: string;
  userInfo?: UserInfo | null;
  [k: string]: unknown;
}

/**
 * Coarse auth lifecycle status of the session actor — a derived control-flag the login page / guards
 * read. `anonymous` (no token) → `authenticating` (login effect in flight) → `authenticated` (token
 * set) | `error` (login rejected). Distinct from `loading` which is the raw in-flight boolean.
 */
export type SessionStatus = 'anonymous' | 'authenticating' | 'authenticated' | 'error';

export interface SessionState {
  /** the bearer token; empty string = unauthenticated. */
  token: string;
  /** the resolved user profile; null until `mine` resolves (or after clear). */
  userInfo: UserInfo | null;
  /** coarse auth lifecycle status (auth-flow control fact, set by the reduce as the flow progresses). */
  status: SessionStatus;
  /** true while an auth effect (login / loadUserInfo) is in flight — drives the login button spinner. */
  loading: boolean;
  /** last auth error message (empty string = none); set on a failed login, cleared on retry/success. */
  error: string;
}

export function createInitialSessionState(): SessionState {
  return { token: '', userInfo: null, status: 'anonymous', loading: false, error: '' };
}

// ---------------------------------------------------------------------------
// tabs (1 authoritative_fact · owner: tabs actor)
// ---------------------------------------------------------------------------

/**
 * One opened multi-tab entry. `fullPath` is the identity (a route may open under different
 * params/query); `name` keys keep-alive. `meta` carries title/cache flags read by the projector/UI.
 */
export interface TabItem {
  name: string;
  fullPath: string;
  title?: string;
  /** keep-alive marker for this tab. */
  keepAlive?: boolean;
  /** opaque route extras the UI may read (icon/affix/...). */
  meta?: Record<string, unknown>;
}

export interface TabsState {
  /** the open tab bar, in order. */
  opened: TabItem[];
  /** the active tab's `fullPath` (empty = none). */
  current: string;
  /** the `name`s of tabs whose component should be kept alive (derived from opened on every write). */
  keepAlive: string[];
}

export function createInitialTabsState(): TabsState {
  return { opened: [], current: '', keepAlive: [] };
}

// ---------------------------------------------------------------------------
// permission (1 authoritative_fact, remote-loaded · owner: permission actor)
// ---------------------------------------------------------------------------

export interface PermissionState {
  /** the flat list of permission codes the current user holds. */
  codes: string[];
  /**
   * has a permission load RESOLVED at least once for the current session? (a control fact, not a code).
   * Starts `false`; `setCodes` flips it `true` (codes are now authoritative — even an empty result means
   * "the backend says no extra perms", not "still loading"); `clearCodes` (logout) flips it back `false`.
   *
   * The router permission guard reads this to avoid a LOAD-RACE误判: the codes load is async (~chassis
   * watch authenticated → loadPermissions HttpPort), so on a login-redirect / reload / deep-link the guard
   * can fire BEFORE codes arrive. With `loaded` it only enforces `meta.permission` once codes are真实载入
   * (未 loaded ⇒ skip the permission gate, never误跳 /403); the assembly root re-checks the current route
   * the moment `loaded` flips true (closing the放行→后发现无权 window). `codes` alone cannot distinguish
   * "loaded, holds nothing" from "not loaded yet" — both are `[]` — which is exactly why this flag exists.
   */
  loaded: boolean;
}

export function createInitialPermissionState(): PermissionState {
  return { codes: [], loaded: false };
}

// ---------------------------------------------------------------------------
// settings (1 authoritative_fact · owner: settings actor)
// ---------------------------------------------------------------------------

export interface SettingsState {
  /** theme name ('light' | 'dark' | custom token); the EP ThemePort applies it (P6). */
  theme: string;
  /** active locale tag ('zh-CN' | 'en' | ...); the I18nPort applies it (P6). */
  locale: string;
  /**
   * the custom EP primary color (a hex like '#409eff'); the ThemePort applies it as the `--el-color-primary`
   * CSS-variable family (P6·T6.2). Optional — absent ⇒ EP's built-in default blue (the apply seam skips it).
   * A 1-级 preference fact like theme/locale (same owner/persist path), NOT a separate actor.
   */
  primaryColor?: string;
}

export function createInitialSettingsState(): SettingsState {
  // default theme/locale match the seed the i18n/theme apply seams align to; primaryColor unset ⇒ EP default.
  return { theme: 'light', locale: 'zh-CN' };
}
