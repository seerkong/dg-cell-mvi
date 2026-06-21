/**
 * dg-cell-mvi-admin-contract · events — the per-actor command vocabulary (DEPA Actor 维 single-write
 * entry) + the cross-actor domain messages (design §B 消息协调).
 *
 * Mirrors crud/contract/events.ts: a `'<actor>.<verb>'` namespaced const map + typed event creators
 * that wrap data in `payload` (never flatten). Each actor's commands form a discriminated union — the
 * ONLY way to write that actor's fact (its reduce is the single writer). Other parties dispatch these
 * commands / publish messages; they never touch the fact directly.
 *
 * `command` (this file, the `*.set*` / `*.open*` …) = synchronous, folded in the actor's reduce,
 * immediately consistent. `domain message` (LOGGED_IN / PERMISSION_LOADED …) = asynchronous facts
 * that cross actor boundaries via the effect feedback loop (a publisher dispatches, a subscriber
 * actor reacts). This file only *declares* both; wiring the effect回流 is P2.
 */
import type { AppEvent } from 'dg-cell-mvi-core';
import type { LoginRequest, TabItem, UserInfo } from './state';

function ev<P extends object>(type: string, payload: P): AppEvent<P> {
  return { type, payload } as AppEvent<P>;
}

// ===========================================================================
// session actor commands  (single writer of SessionState)
// ===========================================================================
export const SESSION_EVENT = {
  // --- direct fact writes (feedback落点 of the auth flow) ---
  setToken: 'session.setToken',
  setUserInfo: 'session.setUserInfo',
  clearSession: 'session.clearSession',
  // --- auth COMMAND commands (folded to a status/loading change + an effect request; IO is in the effect) ---
  /** command: authenticate with credentials — reduce flips loading/status, emits the auth/login effect. */
  login: 'session.login',
  /** command: end the session — reduce emits the auth/logout effect (storage.remove + clearSession回流). */
  logout: 'session.logout',
  /** command: (re)load the current user profile — reduce emits the auth/loadUserInfo effect. */
  loadUserInfo: 'session.loadUserInfo',
  /** command: hydrate token from the storage shadow on store init — reduce emits the session/hydrate effect. */
  hydrate: 'session.hydrate',
  /** feedback: a login attempt failed — reduce records the error + drops loading (token untouched). */
  loginFailed: 'session.loginFailed',
} as const;
export type SessionEventType = (typeof SESSION_EVENT)[keyof typeof SESSION_EVENT];

export const setToken = (token: string) => ev(SESSION_EVENT.setToken, { token });
export const setUserInfo = (userInfo: UserInfo | null) =>
  ev(SESSION_EVENT.setUserInfo, { userInfo });
export const clearSession = () => ev(SESSION_EVENT.clearSession, {});

/** command: authenticate. The reduce sets status=authenticating/loading=true and emits the auth/login effect. */
export const login = (credentials: LoginRequest) => ev(SESSION_EVENT.login, { credentials });
/** command: log out. The reduce emits the auth/logout effect (optional http + storage.remove → clearSession). */
export const logout = () => ev(SESSION_EVENT.logout, {});
/** command: (re)load the user profile. The reduce emits the auth/loadUserInfo effect (http → setUserInfo). */
export const loadUserInfo = () => ev(SESSION_EVENT.loadUserInfo, {});
/** command: hydrate the token from the storage shadow (store init). The reduce emits the session/hydrate effect. */
export const hydrate = () => ev(SESSION_EVENT.hydrate, {});
/** feedback: record a failed login (error message; token stays as-is, loading clears, status=error). */
export const loginFailed = (error: string) => ev(SESSION_EVENT.loginFailed, { error });

/** Discriminated union of every command that may write SessionState. */
export type SessionCommand =
  | ReturnType<typeof setToken>
  | ReturnType<typeof setUserInfo>
  | ReturnType<typeof clearSession>
  | ReturnType<typeof login>
  | ReturnType<typeof logout>
  | ReturnType<typeof loadUserInfo>
  | ReturnType<typeof hydrate>
  | ReturnType<typeof loginFailed>;

// ===========================================================================
// tabs actor commands  (single writer of TabsState)
// ===========================================================================
export const TABS_EVENT = {
  openTab: 'tabs.openTab',
  closeTab: 'tabs.closeTab',
  closeOthers: 'tabs.closeOthers',
  closeAll: 'tabs.closeAll',
  setCurrent: 'tabs.setCurrent',
} as const;
export type TabsEventType = (typeof TABS_EVENT)[keyof typeof TABS_EVENT];

/** open (or focus, if already open) a tab; also becomes current. */
export const openTab = (tab: TabItem) => ev(TABS_EVENT.openTab, { tab });
/** close one tab by its `fullPath`. */
export const closeTab = (fullPath: string) => ev(TABS_EVENT.closeTab, { fullPath });
/** close every tab except the given `fullPath` (kept tabs may include affix-pinned ones). */
export const closeOthers = (fullPath: string) => ev(TABS_EVENT.closeOthers, { fullPath });
/** close all tabs (affix-pinned tabs are retained by the reducer). */
export const closeAll = () => ev(TABS_EVENT.closeAll, {});
/** set the active tab's `fullPath` (no open/close). */
export const setCurrent = (fullPath: string) => ev(TABS_EVENT.setCurrent, { fullPath });

export type TabsCommand =
  | ReturnType<typeof openTab>
  | ReturnType<typeof closeTab>
  | ReturnType<typeof closeOthers>
  | ReturnType<typeof closeAll>
  | ReturnType<typeof setCurrent>;

// ===========================================================================
// permission actor commands  (single writer of PermissionState)
// ===========================================================================
export const PERMISSION_EVENT = {
  // --- direct fact writes (feedback落点 of the remote load) ---
  setCodes: 'permission.setCodes',
  clearCodes: 'permission.clearCodes',
  // --- COMMAND command (folded to an effect request; the remote IO is in createPermissionEffects) ---
  /** command: (re)load the permission codes from the backend — reduce emits the permission/load effect. */
  loadPermissions: 'permission.loadPermissions',
} as const;
export type PermissionEventType = (typeof PERMISSION_EVENT)[keyof typeof PERMISSION_EVENT];

export const setCodes = (codes: string[]) => ev(PERMISSION_EVENT.setCodes, { codes });
export const clearCodes = () => ev(PERMISSION_EVENT.clearCodes, {});
/**
 * command: load the codes from remote. The reduce only NAMES the permission/load effect; the injected
 * HttpPort effect fetches the codes and回流s `[setCodes(codes), permissionLoaded({codes})]`. This is the
 * permission half of the cross-actor flow (chassis bridges session's authenticated → this command).
 */
export const loadPermissions = () => ev(PERMISSION_EVENT.loadPermissions, {});

export type PermissionCommand =
  | ReturnType<typeof setCodes>
  | ReturnType<typeof clearCodes>
  | ReturnType<typeof loadPermissions>;

// ===========================================================================
// settings actor commands  (single writer of SettingsState)
// ===========================================================================
export const SETTINGS_EVENT = {
  // --- direct preference-fact writes (each folds the field + emits the persist effect, P6·T6.2) ---
  setTheme: 'settings.setTheme',
  setLocale: 'settings.setLocale',
  setPrimaryColor: 'settings.setPrimaryColor',
  // --- COMMAND command: hydrate the persisted preferences on store init → re-dispatch the fact writes ---
  /** command: read the persisted {theme,locale,primaryColor} shadow on init — reduce emits settings/hydrate. */
  hydrate: 'settings.hydrate',
} as const;
export type SettingsEventType = (typeof SETTINGS_EVENT)[keyof typeof SETTINGS_EVENT];

export const setTheme = (theme: string) => ev(SETTINGS_EVENT.setTheme, { theme });
export const setLocale = (locale: string) => ev(SETTINGS_EVENT.setLocale, { locale });
/** set the custom EP primary color (hex). The reduce folds it + emits the persist effect (P6·T6.2). */
export const setPrimaryColor = (primaryColor: string) =>
  ev(SETTINGS_EVENT.setPrimaryColor, { primaryColor });
/** command: hydrate persisted preferences (settings actor init). The reduce emits the settings/hydrate effect. */
export const hydrateSettings = () => ev(SETTINGS_EVENT.hydrate, {});

export type SettingsCommand =
  | ReturnType<typeof setTheme>
  | ReturnType<typeof setLocale>
  | ReturnType<typeof setPrimaryColor>
  | ReturnType<typeof hydrateSettings>;

// ===========================================================================
// cross-actor domain messages  (design §B — published on the effect feedback loop, P2)
//
// These are *facts that cross actor boundaries*: a publisher dispatches them, a different actor (or a
// projection refresh) reacts. Declared now so P2 only wires the effect回流 — no schema churn later.
//   login succeeds → publish LoggedIn → permission actor loads codes (PermissionLoaded) → menu re-projects
//   logout         → publish LoggedOut → session/permission/tabs clear
// ===========================================================================
export const DOMAIN_MESSAGE = {
  loggedIn: 'domain.loggedIn',
  loggedOut: 'domain.loggedOut',
  permissionLoaded: 'domain.permissionLoaded',
} as const;
export type DomainMessageType = (typeof DOMAIN_MESSAGE)[keyof typeof DOMAIN_MESSAGE];

/** published by the auth flow after a successful login (session token + profile are set). */
export const loggedIn = (p: { token: string; userInfo: UserInfo | null }) =>
  ev(DOMAIN_MESSAGE.loggedIn, p);
/** published on logout — subscribers (session/permission/tabs) clear their facts. */
export const loggedOut = () => ev(DOMAIN_MESSAGE.loggedOut, {});
/** published once permission codes have been resolved (remote loaded) — menu re-projects. */
export const permissionLoaded = (p: { codes: string[] }) =>
  ev(DOMAIN_MESSAGE.permissionLoaded, p);

export type DomainMessage =
  | ReturnType<typeof loggedIn>
  | ReturnType<typeof loggedOut>
  | ReturnType<typeof permissionLoaded>;
