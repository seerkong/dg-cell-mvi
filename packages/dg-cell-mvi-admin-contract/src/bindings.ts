/**
 * dg-cell-mvi-admin-contract · bindings — the read-only viewModel shapes each actor's `project`
 * produces (DEPA Data 维 7-级 surface_view inputs are *not* here — those enter via commands).
 *
 * For the four data-ownership actors the viewModel is a thin read-only view of the fact (no derived
 * cross-actor data — that is what the menu/breadcrumb *projections* are for, declared in projection.ts).
 * Kept as distinct named types so the render layer binds to a stable contract, not the raw state.
 */
import type { SessionState, SessionStatus, SettingsState, TabItem } from './state';

/** session viewModel — read-only projection of SessionState (+ a convenience auth flag). */
export interface SessionBinding {
  token: string;
  userInfo: SessionState['userInfo'];
  /** derived: `token !== ''` — handy for guards/headers; never written, recomputed each project. */
  authenticated: boolean;
  /** coarse auth lifecycle status (anonymous / authenticating / authenticated / error). */
  status: SessionStatus;
  /** true while an auth effect is in flight — drives the login button spinner. */
  loading: boolean;
  /** last auth error message ('' = none) — the login page shows it. */
  error: string;
}

/** tabs viewModel — read-only projection of TabsState. */
export interface TabsBinding {
  opened: TabItem[];
  current: string;
  keepAlive: string[];
}

/** permission viewModel — read-only projection of PermissionState. */
export interface PermissionBinding {
  codes: string[];
  /** has a codes load resolved at least once this session? (the guard's load-race guard — see PermissionState.loaded). */
  loaded: boolean;
}

/** settings viewModel — read-only projection of SettingsState. */
export interface SettingsBinding {
  theme: SettingsState['theme'];
  locale: SettingsState['locale'];
  /** the custom EP primary color (hex), or undefined when unset (⇒ EP default). The settings drawer reads it. */
  primaryColor: SettingsState['primaryColor'];
}
