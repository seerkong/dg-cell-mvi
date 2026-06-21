/**
 * dg-cell-mvi-admin-template · chassis/stores — the APP assembly root for the shared chassis actors.
 *
 * The app is the DEPA 消费方/装配根: it owns the router and the shared store instances and injects the
 * concrete ports. Here we build the chassis data-ownership actors ONCE as module singletons so every party
 * sees the SAME fact:
 *   - the auth navigation guard (router/guards.ts) reads the `session` token projection to decide
 *     redirects, and feeds route changes to the `tabs` actor (openTab);
 *   - the LoginView writes the token into the SAME `session` actor, so it is visible to the guard on the
 *     next navigation (login → bounce back to ?redirect);
 *   - the menu/breadcrumb projections + v-permission + crud button perms read the `permission` codes;
 *   - App.vue watches the `settings` locale/theme/primaryColor and applies them (vue-i18n / EP / DOM).
 *
 * A single shared instance is the correct shape AT THE ASSEMBLY ROOT (one app = one running chassis); the
 * actors stay pure single-writer stores (no global god-store — each owns only its own fact). Guards are
 * plain modules (not components), so they `import { sessionStore }` directly; components get the same
 * instances via `provide`/`useChassis()` (set up in main.ts).
 *
 * HttpPort choice (DEPA Effect 维 — swap the PORT IMPL, never the logic):
 *   - DEV by default → an in-process MOCK HttpPort (chassis/mockHttpPort.ts) answering /login + /mine +
 *     /permissions + the example product CRUD — runnable end-to-end WITHOUT a server.
 *   - set `VITE_APP_MOCK=false` (or any prod build) → the axios HttpPort (hits the proxied/absolute API).
 * The seam is just `createSessionStore({ http })`; the real auth/crud effects run either way — only the
 * transport differs.
 */
import type { InjectionKey } from 'vue';
import { inject } from 'vue';

import {
  createSessionStore,
  createTabsStore,
  createPermissionStore,
  createSettingsStore,
} from 'dg-cell-mvi-admin-logic';
import type {
  SessionStore,
  TabsStore,
  PermissionStore,
  SettingsStore,
} from 'dg-cell-mvi-admin-logic';
import type { HttpPort } from 'dg-cell-mvi-admin-contract';
import { logout, loadPermissions, clearCodes } from 'dg-cell-mvi-admin-contract';
import { watch } from 'dg-cell-mvi-core';
import { createAxiosHttpPort, createLocalStorageStoragePort } from 'dg-cell-mvi-admin-support';

import { createMockHttpPort } from './mockHttpPort';
import { PRODUCT_RESOURCE, PRODUCT_SEED } from '../views/product/resource';

/** The shared chassis surface handed to components via provide/inject (and imported directly by guards). */
export interface Chassis {
  /** the session data-ownership actor (token/userInfo/auth flow) — single source of auth truth. */
  session: SessionStore;
  /** the tabs data-ownership actor (multi-tab bar) — fed by the router afterEach (route change = message). */
  tabs: TabsStore;
  /** the permission data-ownership actor (remote-loaded codes) — single source of permission truth. */
  permission: PermissionStore;
  /** the settings data-ownership actor (theme/locale/primaryColor) — single source of preference truth. */
  settings: SettingsStore;
  /** the SHARED transport seam — the SAME HttpPort the session actor uses (dev = mock, prod = axios). */
  http: HttpPort;
}

// --- support: the concrete ports the consumer injects (the Effect-维 seam lives at the app root). ---
// HttpPort: DEV → in-process mock (no backend needed); else → axios. `VITE_APP_MOCK=false` forces axios
// even in dev. This is the ONLY place the transport impl is chosen — logic/effects are untouched.
//
// The port's auth/401 seams are wired HERE to the shared session actor; framework-neutral admin-support
// never imports a store — it only calls back. The callbacks are LAZY (read per request), so they capture
// the `sessionStore` binding below and run only at request time — after it is assigned.
let sessionStoreRef: SessionStore | undefined;
const onUnauthorized = () => {
  sessionStoreRef?.dispatch(logout());
};
const useMock = import.meta.env.DEV && import.meta.env.VITE_APP_MOCK !== 'false';
const http: HttpPort = useMock
  ? createMockHttpPort({
      // register the example CRUD resource so the mock serves /product/* from an in-memory store.
      // Add more `{ ...YOUR_RESOURCE, seed: YOUR_SEED }` entries here as you add CRUD pages.
      resources: [{ ...PRODUCT_RESOURCE, seed: PRODUCT_SEED }],
      onUnauthorized,
    })
  : createAxiosHttpPort({
      getAuthToken: () => sessionStoreRef?.state().token,
      onUnauthorized,
    });
const storage = createLocalStorageStoragePort({ prefix: 'admin-template:' });

// --- logic: the shared chassis actors (built ONCE; the whole app shares these instances). ---
/** Shared `session` actor singleton — guards read its token; LoginView writes it. Real auth effects active. */
export const sessionStore: SessionStore = createSessionStore({ http, storage });
// expose the just-built session actor to the axios port's lazy auth/401 callbacks (see `sessionStoreRef`).
sessionStoreRef = sessionStore;
/** Shared `tabs` actor singleton — the router afterEach dispatches openTab into it. */
export const tabsStore: TabsStore = createTabsStore();
/** Shared `permission` actor singleton — owns the remote-loaded codes (same `http` seam as the session). */
export const permissionStore: PermissionStore = createPermissionStore({ http });
/** Shared `settings` actor singleton — owns theme/locale/primaryColor (persisted via the same `storage`). */
export const settingsStore: SettingsStore = createSettingsStore({ storage });

// ───────────────────────────────────────────────────────────────────────────
// CROSS-ACTOR COORDINATION (跨 actor 协调=消息, no god-store, no cross-store direct call).
//
// This is the composition root (装配根) — the ONLY place that owns BOTH actor instances, so it is the
// correct place to bridge them. Each actor stays a pure single-writer of its OWN fact; neither imports the
// other. We only WATCH the session's projected `authenticated` flag and DISPATCH a permission COMMAND:
//   authenticated TRUE  → loadPermissions()  → permission/load effect → setCodes (menu re-projects).
//   authenticated FALSE → clearCodes()       → codes emptied (logout drops the menu's gated items).
//
// `immediate: true` covers HYDRATE: after a reload the persisted token is hydrated → `authenticated` is
// already true at subscribe time → the watcher fires once immediately → codes are (re)loaded.
// ───────────────────────────────────────────────────────────────────────────
watch(
  () => sessionStore.viewModel().authenticated,
  (authed) => {
    permissionStore.dispatch(authed ? loadPermissions() : clearCodes());
  },
  { immediate: true },
);

/** The shared chassis bundle (same instances as the singletons above; `http` is the injected transport). */
export const chassis: Chassis = {
  session: sessionStore,
  tabs: tabsStore,
  permission: permissionStore,
  settings: settingsStore,
  http,
};

/** Vue injection key for the shared chassis (components resolve it via `useChassis()`). */
export const CHASSIS_KEY: InjectionKey<Chassis> = Symbol('dg-cell-mvi:admin-template:chassis');

/**
 * Resolve the shared chassis inside a component `setup()`. Falls back to the module singletons when no
 * provider is present so callers never get `undefined` — the singletons ARE the canonical instances.
 */
export function useChassis(): Chassis {
  return inject(CHASSIS_KEY, chassis);
}
