/**
 * dg-cell-mvi-admin-logic — DEPA admin chassis *logic* layer (public API).
 *
 * Per design.md «DEPA 重构» §B/§E and decisions.md §8: pure reducers/projectors (the four
 * data-ownership actors: session/tabs/permission/settings) + menu/breadcrumb projection + permission
 * resolve. ZERO IO / browser / vue / el — depends ONLY on dg-cell-mvi-admin-contract (ports + schema),
 * dg-cell-mvi-core (the single-atom MVI store primitive), and the depa primitives.
 *
 * The four actors are each a `dg-cell-mvi-core` single-atom store (single-write + command entry +
 * pure reduce). Their factories accept an OPTIONAL injected effect-handler map (the Effect-维 seam) —
 * in T1.2 none is passed (pure state machines); P2/P3/P5/P6 inject real IO handlers built on the
 * contract ports. (REC-9: this pure-logic layer has no executing-actor / mailbox scenario, so the
 * unused depa-actor / depa-processor declarations were dropped from package.json — they belong to a
 * later phase that actually wires execution actors.)
 */

// --- data-ownership actor store factories (each = a core single-atom store) ---
export { createSessionStore } from './stores/sessionStore';
export type { SessionStore, CreateSessionStoreDeps } from './stores/sessionStore';
export { createTabsStore } from './stores/tabsStore';
export type { TabsStore, CreateTabsStoreDeps } from './stores/tabsStore';
export { createPermissionStore } from './stores/permissionStore';
export type { PermissionStore, CreatePermissionStoreDeps } from './stores/permissionStore';
export { createSettingsStore } from './stores/settingsStore';
export type { SettingsStore, CreateSettingsStoreDeps } from './stores/settingsStore';
export { createActorStore } from './stores/createActorStore';
export type { CreateActorStoreOptions } from './stores/createActorStore';

// --- pure reducers (single writers) — exported for direct unit testing + reuse ---
export {
  reduceSession,
  reduceTabs,
  reducePermission,
  reduceSettings,
} from './logic/reducers';

// --- pure binding projectors (state → viewModel) ---
export {
  projectSession,
  projectTabs,
  projectPermission,
  projectSettings,
} from './logic/projectors';

// --- 6-级 derived projections (pure functions, NOT stores; design §9) + permission/auth resolve ---
export {
  projectMenu,
  projectBreadcrumb,
  hasPermission,
  resolveAuthRedirect,
  // T5.2: pure route-level permission gate for the nav guard (sibling of resolveAuthRedirect).
  resolveRoutePermission,
} from './logic/menuProjection';

// --- Effect 维: the session actor's auth effect factory (fn(runtime,input,config) + injected ports) ---
export { createAuthEffects } from './effects/authEffects';
export type { AuthPorts, AuthEffectsConfig } from './effects/authEffects';

// --- Effect 维: the permission actor's remote-load effect factory (injected HttpPort; T5.1) ---
export { createPermissionEffects } from './effects/permissionEffects';
export type { PermissionPorts, PermissionEffectsConfig } from './effects/permissionEffects';

// --- Effect 维: the settings actor's persist/hydrate effect factory (injected StoragePort; T6.2) ---
export { createSettingsEffects } from './effects/settingsEffects';
export type { SettingsPorts, SettingsEffectsConfig } from './effects/settingsEffects';

/**
 * Wiring marker retained from T1.1 for the cross-package smoke proof (it asserts admin-logic loads
 * with core + admin-contract resolvable). Harmless one-liner.
 */
export const ADMIN_LOGIC_READY = true;
