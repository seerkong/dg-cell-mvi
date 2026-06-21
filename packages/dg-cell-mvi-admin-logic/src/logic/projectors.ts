/**
 * dg-cell-mvi-admin-logic · logic/projectors — PURE state → viewModel projections for each actor.
 *
 * Thin read-only views of each fact (DEPA Data 维). No cross-actor data here (that is the menu/
 * breadcrumb projection's job, in menuProjection.ts). Pure: deterministic from state, no IO, never
 * written back. Mirrors crud/logic/projectors.ts (`project(state, config) -> Binding`).
 */
import type {
  SessionState,
  TabsState,
  PermissionState,
  SettingsState,
  SessionBinding,
  TabsBinding,
  PermissionBinding,
  SettingsBinding,
} from 'dg-cell-mvi-admin-contract';

export function projectSession(state: SessionState): SessionBinding {
  return {
    token: state.token,
    userInfo: state.userInfo,
    authenticated: state.token !== '',
    status: state.status,
    loading: state.loading,
    error: state.error,
  };
}

export function projectTabs(state: TabsState): TabsBinding {
  return {
    opened: state.opened,
    current: state.current,
    keepAlive: state.keepAlive,
  };
}

export function projectPermission(state: PermissionState): PermissionBinding {
  return { codes: state.codes, loaded: state.loaded };
}

export function projectSettings(state: SettingsState): SettingsBinding {
  return { theme: state.theme, locale: state.locale, primaryColor: state.primaryColor };
}
