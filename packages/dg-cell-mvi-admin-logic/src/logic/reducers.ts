/**
 * dg-cell-mvi-admin-logic · logic/reducers — the PURE reducers for the four data-ownership actors.
 *
 * One `reduce<Actor>(state, event) -> { state, effects }` per actor (DEPA Actor 维). Each is the
 * SINGLE WRITER of its fact: the only place that fact mutates is here, folding that actor's commands.
 * Pure — never mutates inputs (always returns a fresh object on change), never does IO (no effects in
 * T1.2; persistence/remote land as effects in P2/P3). Unknown events return the SAME state reference
 * (a no-op fold), so dispatching another actor's command can never change this actor's fact.
 *
 * Mirrors crud/logic/reducers.ts (`{ state, effects: [] }`, spread-copy immutability).
 */
import type { AppEvent, ReduceResult } from 'dg-cell-mvi-core';
import {
  SESSION_EVENT,
  TABS_EVENT,
  PERMISSION_EVENT,
  SETTINGS_EVENT,
  loginEffect,
  logoutEffect,
  loadUserInfoEffect,
  persistTokenEffect,
  hydrateTokenEffect,
  loadPermissionsEffect,
  persistSettingsEffect,
  hydrateSettingsEffect,
} from 'dg-cell-mvi-admin-contract';
import type {
  SessionState,
  TabsState,
  PermissionState,
  SettingsState,
  TabItem,
  LoginRequest,
} from 'dg-cell-mvi-admin-contract';

/** no-op / settled fold: state unchanged, no effects. */
function ok<S>(state: S): ReduceResult<S> {
  return { state, effects: [] };
}

/** settled fold that also emits effect requests (the IO is named here, run at the effect boundary). */
function emit<S>(state: S, effects: ReduceResult<S>['effects']): ReduceResult<S> {
  return { state, effects };
}

// ---------------------------------------------------------------------------
// tabs helpers (pure)
// ---------------------------------------------------------------------------

/** recompute keepAlive from opened (derived within the fact: names of keep-alive tabs, de-duped). */
function deriveKeepAlive(opened: TabItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of opened) {
    if (t.keepAlive && t.name && !seen.has(t.name)) {
      seen.add(t.name);
      out.push(t.name);
    }
  }
  return out;
}

/** is this tab pinned (affix) — affix tabs survive closeOthers/closeAll. */
function isAffix(t: TabItem): boolean {
  return Boolean(t.meta && (t.meta as Record<string, unknown>).affix);
}

// ===========================================================================
// session reducer  (single writer of SessionState)
//
// Stays the SINGLE WRITER of SessionState even with auth: the auth *commands* (login/logout/loadUserInfo/
// hydrate) only flip control flags + NAME effects here; the IO runs at the effect boundary
// (createAuthEffects, injected ports) and feeds its result back as the fact-writing commands
// (setToken/setUserInfo/clearSession/loginFailed). Token persistence is a SHADOW: every token write
// (set or clear) also emits persistTokenEffect, so the storage shadow tracks the fact, never sources it.
// Pure throughout (fresh object on change, no IO, unknown event = same-reference no-op fold).
// ===========================================================================
export function reduceSession(
  state: SessionState,
  event: AppEvent,
): ReduceResult<SessionState> {
  const p = (event.payload || {}) as Record<string, any>;
  switch (event.type) {
    // --- fact writes (feedback落点 of the auth flow) ---
    case SESSION_EVENT.setToken: {
      const token = String(p.token ?? '');
      // a non-empty token = authenticated & settled (loading/error cleared); empty = back to anonymous.
      const next: SessionState = token
        ? { ...state, token, status: 'authenticated', loading: false, error: '' }
        : { ...state, token, status: 'anonymous' };
      // persist the shadow on EVERY token write (set or clear) — storage tracks the fact, never sources it.
      return emit(next, [persistTokenEffect({ token })]);
    }
    case SESSION_EVENT.setUserInfo:
      // profile arrival is the tail of login → also drop loading (idempotent if already settled).
      return ok({ ...state, userInfo: p.userInfo ?? null, loading: false });
    case SESSION_EVENT.clearSession:
      // full reset to anonymous + clear the token shadow (covers a direct clear, not only logout).
      return emit(
        { ...state, token: '', userInfo: null, status: 'anonymous', loading: false, error: '' },
        [persistTokenEffect({ token: '' })],
      );

    // --- auth COMMAND commands (set control flags + NAME the effect; IO is in createAuthEffects) ---
    case SESSION_EVENT.login: {
      const credentials = (p.credentials ?? {}) as LoginRequest;
      return emit(
        { ...state, status: 'authenticating', loading: true, error: '' },
        [loginEffect({ credentials })],
      );
    }
    case SESSION_EVENT.logout:
      // not optimistic: the effect does storage.remove + re-dispatches clearSession (the actual fact write).
      return emit(state, [logoutEffect()]);
    case SESSION_EVENT.loadUserInfo:
      return emit({ ...state, loading: true }, [loadUserInfoEffect()]);
    case SESSION_EVENT.hydrate:
      // init: the effect reads the token shadow and re-dispatches setToken when one is found.
      return emit(state, [hydrateTokenEffect()]);

    // --- auth feedback ---
    case SESSION_EVENT.loginFailed:
      // record the error, drop loading; token/userInfo untouched (a failed login never mutates them).
      return ok({ ...state, status: 'error', loading: false, error: String(p.error ?? 'login failed') });

    default:
      return ok(state);
  }
}

// ===========================================================================
// tabs reducer  (single writer of TabsState)
// ===========================================================================
export function reduceTabs(state: TabsState, event: AppEvent): ReduceResult<TabsState> {
  const p = (event.payload || {}) as Record<string, any>;
  switch (event.type) {
    case TABS_EVENT.openTab: {
      const tab = p.tab as TabItem;
      if (!tab || !tab.fullPath) return ok(state);
      const exists = state.opened.some((t) => t.fullPath === tab.fullPath);
      // open = add if new (focus if already open); either way it becomes current. No duplicates.
      const opened = exists
        ? state.opened.map((t) => (t.fullPath === tab.fullPath ? { ...t, ...tab } : t))
        : [...state.opened, tab];
      return ok({ ...state, opened, current: tab.fullPath, keepAlive: deriveKeepAlive(opened) });
    }
    case TABS_EVENT.closeTab: {
      const fullPath = String(p.fullPath ?? '');
      const idx = state.opened.findIndex((t) => t.fullPath === fullPath);
      if (idx < 0) return ok(state);
      const opened = state.opened.filter((t) => t.fullPath !== fullPath);
      // if the closed tab was current, fall back to its right neighbour, else left, else none.
      let current = state.current;
      if (state.current === fullPath) {
        const next = state.opened[idx + 1] ?? state.opened[idx - 1];
        current = next ? next.fullPath : '';
      }
      return ok({ ...state, opened, current, keepAlive: deriveKeepAlive(opened) });
    }
    case TABS_EVENT.closeOthers: {
      const keepPath = String(p.fullPath ?? '');
      const opened = state.opened.filter((t) => t.fullPath === keepPath || isAffix(t));
      const current = opened.some((t) => t.fullPath === keepPath) ? keepPath : state.current;
      return ok({ ...state, opened, current, keepAlive: deriveKeepAlive(opened) });
    }
    case TABS_EVENT.closeAll: {
      const opened = state.opened.filter((t) => isAffix(t));
      const current = opened.some((t) => t.fullPath === state.current)
        ? state.current
        : opened[0]?.fullPath ?? '';
      return ok({ ...state, opened, current, keepAlive: deriveKeepAlive(opened) });
    }
    case TABS_EVENT.setCurrent:
      return ok({ ...state, current: String(p.fullPath ?? '') });
    default:
      return ok(state);
  }
}

// ===========================================================================
// permission reducer  (single writer of PermissionState)
//
// Stays the SINGLE WRITER of the codes fact even with the remote load: the `loadPermissions` COMMAND only
// NAMES the permission/load effect here; the IO runs at the effect boundary (createPermissionEffects,
// injected HttpPort) and feeds its result back as the fact-writing command setCodes (+ the cross-actor
// permissionLoaded message). `menu = projection(routes × codes)` recomputes whenever codes change.
// Pure throughout (fresh object on change, no IO, unknown event = same-reference no-op fold).
// ===========================================================================
export function reducePermission(
  state: PermissionState,
  event: AppEvent,
): ReduceResult<PermissionState> {
  const p = (event.payload || {}) as Record<string, any>;
  switch (event.type) {
    // --- fact writes (feedback落点 of the remote load) ---
    case PERMISSION_EVENT.setCodes:
      // codes resolved → they are now authoritative: flip `loaded` true (even an empty result is a real
      // answer — "no extra perms" — not "still loading"). This is what lets the guard tell "loaded, holds
      // nothing" apart from "not loaded yet" (both have codes === []), closing the load-race误判.
      return ok({ ...state, codes: Array.isArray(p.codes) ? [...p.codes] : [], loaded: true });
    case PERMISSION_EVENT.clearCodes:
      // logout / session reset → codes gone AND back to the unloaded state (next login re-loads; the guard
      // must again not gate until that resolves). Keeps `loaded` honest across a logout→login cycle.
      return ok({ ...state, codes: [], loaded: false });

    // --- COMMAND command (NAME the effect; the IO + 回流 is in createPermissionEffects) ---
    case PERMISSION_EVENT.loadPermissions:
      // not optimistic: codes are NOT touched here — the effect fetches them and re-dispatches setCodes.
      // Keeping the existing codes until the load resolves means a re-load can never momentarily blank
      // the menu (a failed load also leaves codes intact — the effect回流s nothing on failure).
      return emit(state, [loadPermissionsEffect()]);

    default:
      return ok(state);
  }
}

// ===========================================================================
// settings reducer  (single writer of SettingsState)
//
// Stays the SINGLE WRITER of the preference fact even with persistence: every preference write
// (setTheme/setLocale/setPrimaryColor) folds the field here AND emits persistSettingsEffect with the
// NEXT snapshot, so the storage shadow tracks the fact (never sources it — design §A). The `hydrate`
// COMMAND only NAMES settings/hydrate; the IO runs at the effect boundary (createSettingsEffects,
// injected StoragePort) and feeds its result back as the fact-writing commands. The APPLY of these facts
// (html.dark / vue-i18n / EP CSS vars) is a SEPARATE concern done at the assembly root via ThemePort/
// I18nPort — NOT here (admin-logic touches no DOM/vue/el). Pure throughout (fresh object on change, no
// IO, unknown event = same-reference no-op fold).
// ===========================================================================
export function reduceSettings(
  state: SettingsState,
  event: AppEvent,
): ReduceResult<SettingsState> {
  const p = (event.payload || {}) as Record<string, any>;
  switch (event.type) {
    // --- preference fact writes: fold the field + persist the new snapshot (the shadow tracks the fact) ---
    case SETTINGS_EVENT.setTheme: {
      const next = { ...state, theme: String(p.theme ?? state.theme) };
      return emit(next, [persistSettingsEffect({ settings: next })]);
    }
    case SETTINGS_EVENT.setLocale: {
      const next = { ...state, locale: String(p.locale ?? state.locale) };
      return emit(next, [persistSettingsEffect({ settings: next })]);
    }
    case SETTINGS_EVENT.setPrimaryColor: {
      const next = { ...state, primaryColor: String(p.primaryColor ?? state.primaryColor ?? '') };
      return emit(next, [persistSettingsEffect({ settings: next })]);
    }

    // --- hydrate COMMAND (init): NAME the read effect; the IO + 回流 is in createSettingsEffects. ---
    case SETTINGS_EVENT.hydrate:
      // not optimistic: state is NOT touched here — the effect reads the shadow and re-dispatches the
      // fact writes for whatever it finds (so an absent/corrupt shadow simply leaves the seeded defaults).
      return emit(state, [hydrateSettingsEffect()]);

    default:
      return ok(state);
  }
}
