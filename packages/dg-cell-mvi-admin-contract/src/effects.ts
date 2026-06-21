/**
 * dg-cell-mvi-admin-contract · effects — the chassis effect-REQUEST vocabulary (DEPA Effect 维).
 *
 * Mirrors crud/contract/effects.ts: a `'<domain>/<verb>'` keyed const map + typed request creators
 * (payload-wrapped, never flattened). A reduce returns these in its `{ state, effects }`; the logic
 * layer's effect handlers — built by `createAuthEffects(ports)` with injected HttpPort/StoragePort —
 * run the IO and re-dispatch feedback events (setToken/setUserInfo/clearSession/loginFailed).
 *
 * The reduce only NAMES the side effect (a pure, serializable description); WHICH port runs it and HOW
 * is decided at assembly time when ports are injected — the Effect-维 `fn(runtime,input,config)` seam.
 *
 * P2·T2.1 scope = the auth + token-persistence requests below. Later phases add their own request
 * families here (http transport, router, …) without disturbing these.
 */
import type { EffectRequest } from 'dg-cell-mvi-core';
import type { LoginRequest, SettingsState } from './state';

export const SESSION_EFFECT = {
  /** call the backend login endpoint with credentials; on success → setToken (+ persist) + profile. */
  login: 'auth/login',
  /** end the session: optional backend logout call + remove the token shadow → clearSession. */
  logout: 'auth/logout',
  /** fetch the current user's profile (the `mine` call) → setUserInfo. */
  loadUserInfo: 'auth/loadUserInfo',
  /** write the token to its storage shadow (best-effort; storage is a shadow, never a source). */
  persistToken: 'session/persist',
  /** read the token from its storage shadow on init → setToken (the hydrate path). */
  hydrateToken: 'session/hydrate',
} as const;
export type SessionEffectType = (typeof SESSION_EFFECT)[keyof typeof SESSION_EFFECT];

function fx<P extends object>(type: string, payload: P): EffectRequest<P> {
  return { type, payload } as EffectRequest<P>;
}

/** request: POST credentials to the login endpoint; handler re-dispatches setToken/setUserInfo or loginFailed. */
export const loginEffect = (p: { credentials: LoginRequest }) => fx(SESSION_EFFECT.login, p);
/** request: end the session (optional http) then storage.remove(token) → clearSession回流. */
export const logoutEffect = () => fx(SESSION_EFFECT.logout, {});
/** request: GET the current profile (`mine`); handler re-dispatches setUserInfo. */
export const loadUserInfoEffect = () => fx(SESSION_EFFECT.loadUserInfo, {});
/** request: write the token to storage (or remove it when empty); pure shadow persistence, no回流. */
export const persistTokenEffect = (p: { token: string }) => fx(SESSION_EFFECT.persistToken, p);
/** request: read the persisted token on init; handler re-dispatches setToken when one is found. */
export const hydrateTokenEffect = () => fx(SESSION_EFFECT.hydrateToken, {});

/** Discriminated union of every session/auth effect request the reduce may emit. */
export type SessionEffectRequest =
  | ReturnType<typeof loginEffect>
  | ReturnType<typeof logoutEffect>
  | ReturnType<typeof loadUserInfoEffect>
  | ReturnType<typeof persistTokenEffect>
  | ReturnType<typeof hydrateTokenEffect>;

// ===========================================================================
// permission actor effect requests (P5·T5.1) — the 1-级 remote-loaded codes fact's IO seam.
//
// The codes are a remote-loaded fact (design §A: permission = 1-级, loaded from remote). The reduce
// only NAMES the load; createPermissionEffects (injected HttpPort) runs the request and回流s
// setCodes + permissionLoaded. Same Effect-维 shape as the session requests above.
// ===========================================================================
export const PERMISSION_EFFECT = {
  /** fetch the current user's permission codes from the backend → setCodes(+ publish permissionLoaded). */
  loadPermissions: 'permission/load',
} as const;
export type PermissionEffectType = (typeof PERMISSION_EFFECT)[keyof typeof PERMISSION_EFFECT];

/** request: GET/POST the permission codes; handler re-dispatches setCodes + publishes permissionLoaded. */
export const loadPermissionsEffect = () => fx(PERMISSION_EFFECT.loadPermissions, {});

/** Discriminated union of every permission effect request the reduce may emit. */
export type PermissionEffectRequest = ReturnType<typeof loadPermissionsEffect>;

// ===========================================================================
// settings actor effect requests (P6·T6.2) — the 1-级 preference fact's persistence (StoragePort) seam.
//
// The settings preferences (theme/locale/primaryColor) are a 1-级 fact whose STORAGE is a shadow (design
// §A: localStorage shadows facts, never sources them). Every preference write folds the field in the
// reduce AND names settings/persist (the StoragePort blob write); store init names settings/hydrate (read
// the blob → re-dispatch the fact writes). The APPLY of those facts (html.dark / vue-i18n / EP CSS vars)
// is a SEPARATE effect through ThemePort/I18nPort, driven at the assembly root — NOT here (admin-logic
// stays free of DOM/vue/el; this persist effect only touches the injected StoragePort). Same Effect-维
// shape as the session persist/hydrate requests above.
// ===========================================================================
export const SETTINGS_EFFECT = {
  /** write the {theme,locale,primaryColor} preferences to their storage shadow (best-effort; no回流). */
  persist: 'settings/persist',
  /** read the persisted preferences on init → re-dispatch setTheme/setLocale/setPrimaryColor (the hydrate path). */
  hydrate: 'settings/hydrate',
} as const;
export type SettingsEffectType = (typeof SETTINGS_EFFECT)[keyof typeof SETTINGS_EFFECT];

/** request: persist the current preference snapshot to storage (pure shadow write — no回流). */
export const persistSettingsEffect = (p: { settings: SettingsState }) =>
  fx(SETTINGS_EFFECT.persist, p);
/** request: read the persisted preferences on init; handler re-dispatches the fact writes for what it finds. */
export const hydrateSettingsEffect = () => fx(SETTINGS_EFFECT.hydrate, {});

/** Discriminated union of every settings effect request the reduce may emit. */
export type SettingsEffectRequest =
  | ReturnType<typeof persistSettingsEffect>
  | ReturnType<typeof hydrateSettingsEffect>;
