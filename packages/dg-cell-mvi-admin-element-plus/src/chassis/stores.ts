/**
 * dg-cell-mvi-admin-element-plus · chassis/stores — the APP assembly root for the shared chassis actors.
 *
 * The app is the DEPA 消费方/装配根 (design §E "app: 消费方·注入具体端口·装配"): it owns the router and the
 * shared store instances and injects the concrete ports. Here we build the chassis data-ownership actors
 * ONCE as module singletons so every party sees the SAME fact:
 *   - the auth navigation guard (router-as-effect, src/router/guards.ts) reads the `session` token
 *     projection to decide redirects, and feeds route changes to the `tabs` actor (openTab);
 *   - the LoginView writes the token into the SAME `session` actor, so the token it sets is visible to
 *     the guard on the next navigation (T2.3-AC1: login → bounce back to ?redirect).
 *
 * A single shared instance is the correct shape AT THE ASSEMBLY ROOT (one app = one running chassis);
 * the actors stay pure single-writer stores (no global god-store — each owns only its own fact). Guards
 * are plain modules (not components), so they cannot use Vue inject — they `import { sessionStore }`
 * directly. Components get the same instances via `provide`/`useChassis()` (set up in main.ts).
 *
 * SCOPE (T2.3): session + tabs only. permission/settings actors join in P5/P6 — added here then, same
 * pattern. The session actor is wired with an HttpPort + localStorage StoragePort (auth effects + init
 * hydrate active), so a persisted token survives reload and is hydrated before the first guard run.
 *
 * HttpPort choice (T2.4, DEPA Effect 维 — swap the PORT IMPL, never the logic): the demo has no backend,
 * so in DEV we inject an in-process MOCK HttpPort (chassis/mockHttpPort.ts) that answers `/login` + `/mine`
 * — this makes the auth flow runnable end-to-end without a server. In a real/prod build we inject the
 * axios HttpPort (hits the proxied/absolute API base). The seam is just `createSessionStore({ http })`;
 * createSessionStore still runs the REAL auth effects either way — only the transport differs. P3 does the
 * proper "axios + mock switch" (interceptors/envelope/401); this is the minimal dev mock.
 *   - DEV by default → mock; set `VITE_APP_MOCK=false` to force the axios port even in dev (e.g. against a
 *     real backend running behind the vite proxy).
 *   - PROD → always the axios port (the mock is never selected).
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
import { USER_RESOURCE, USER_SEED } from '../views/user/resource';

/** The shared chassis surface handed to components via provide/inject (and imported directly by guards). */
export interface Chassis {
  /** the session data-ownership actor (token/userInfo/auth flow) — single source of auth truth. */
  session: SessionStore;
  /** the tabs data-ownership actor (multi-tab bar) — fed by the router afterEach (route change = message). */
  tabs: TabsStore;
  /**
   * the permission data-ownership actor (remote-loaded codes) — single source of permission truth. The
   * menu/breadcrumb projections + v-permission + crud button perms read its `codes`. Loaded reactively
   * by the chassis coordination below (authenticated → loadPermissions), NOT on its own init.
   */
  permission: PermissionStore;
  /**
   * the settings data-ownership actor (theme/locale) — single source of preference truth (P6·T6.1). Its
   * `locale` fact drives vue-i18n + EP locale + crud chrome (App.vue watches it → I18nPort.setLocale).
   * T6.1 builds it PURE (setLocale just folds the fact); T6.2 injects the StoragePort persist effect +
   * boot hydrate so a chosen locale/theme survives reload.
   */
  settings: SettingsStore;
  /**
   * the SHARED transport seam (T3.2). The SAME HttpPort instance the session actor uses — data pages get
   * it via `useChassis().http` and route their crud requests through it (createHttpCrudRequest), so they
   * inherit the same auth header / 401→logout / envelope unwrap. dev = mockHttpPort, prod = axios.
   */
  http: HttpPort;
}

// --- support: the concrete ports the consumer injects (the Effect-维 seam lives at the app root). ---
// HttpPort: DEV → in-process mock (no backend needed); else → axios. `VITE_APP_MOCK=false` forces axios
// even in dev. This is the ONLY place the transport impl is chosen — logic/effects are untouched.
// The dev mock additionally serves the migrated data resources' crud endpoints (T3.2) from in-memory
// stores; the axios port hits the real backend behind the same urls. Either way the page talks to `http`.
//
// The port's auth/401 seams (T3.1) are wired HERE to the shared session actor; framework-neutral
// admin-support never imports a store: it only calls back. The callbacks are LAZY (read per request), so
// they capture the `sessionStore` binding below and run only at request time — after it is assigned.
//   - getAuthToken → the session actor's token fact (injected as the auth header when truthy; axios only —
//     the mock has no header to inject);
//   - onUnauthorized → dispatch the `logout` command (clears session + token shadow → guard bounces to
//     /login). This is the 401→logout half of the single-transport goal. The REAL trigger is a backend 401
//     on the axios port; the mock never 401s on its own, so in DEV it ALSO gets `onUnauthorized` wired to
//     the SAME logout dispatch — used only by its `/debug/401` path (the "模拟 401" button), so 401→logout
//     is browser-verifiable without a backend. Identical side effect either way (dispatch logout).
let sessionStoreRef: SessionStore | undefined;
const onUnauthorized = () => {
  sessionStoreRef?.dispatch(logout());
};
const useMock = import.meta.env.DEV && import.meta.env.VITE_APP_MOCK !== 'false';
const http: HttpPort = useMock
  ? createMockHttpPort({ resources: [{ ...USER_RESOURCE, seed: USER_SEED }], onUnauthorized })
  : createAxiosHttpPort({
      getAuthToken: () => sessionStoreRef?.state().token,
      onUnauthorized,
    });
const storage = createLocalStorageStoragePort({ prefix: 'admin:' });

// --- logic: the shared chassis actors (built ONCE; the whole app shares these instances). ---
/**
 * Shared `session` actor singleton — guards read its token; LoginView writes it; SessionProof can log out.
 * Real auth effects active (login/logout/loadUserInfo/persist/hydrate); the injected `http` is the mock in
 * dev, axios otherwise. localStorage StoragePort → token persists + init-hydrates (survives reload).
 */
export const sessionStore: SessionStore = createSessionStore({ http, storage });
// expose the just-built session actor to the axios port's lazy auth/401 callbacks (see `sessionStoreRef`).
sessionStoreRef = sessionStore;
/** Shared `tabs` actor singleton — the router afterEach dispatches openTab into it. */
export const tabsStore: TabsStore = createTabsStore();
/**
 * Shared `permission` actor singleton — owns the remote-loaded codes. Wired with the SAME `http` instance
 * as the session actor (one transport, one auth header / 401 path) so its codes load goes through the same
 * seam (dev mock `/permissions` endpoint, axios otherwise). It does NOT load on its own init — WHEN to load
 * is the cross-actor decision made just below at this composition root.
 */
export const permissionStore: PermissionStore = createPermissionStore({ http });
/**
 * Shared `settings` actor singleton — owns theme/locale/primaryColor. T6.2 wires the localStorage
 * StoragePort (the SAME `storage` port the session actor uses), so every preference write persists and
 * the store INIT-HYDRATES the persisted {theme,locale,primaryColor} before the first apply — a chosen
 * theme/locale/color survives reload ("刷新保持"). The APPLY of those facts (html.dark via ThemePort,
 * vue-i18n via I18nPort, EP CSS vars) is done at the 装配根 by App.vue's watches (NOT in the reducer/
 * effect), keeping admin-logic free of DOM/vue/el (decisions §6/§8). setTheme/setLocale/setPrimaryColor
 * fold the fact + emit settings/persist; the boot hydrate re-dispatches them, and App.vue's `immediate`
 * watch applies the restored values.
 */
export const settingsStore: SettingsStore = createSettingsStore({ storage });

// ───────────────────────────────────────────────────────────────────────────
// CROSS-ACTOR COORDINATION (decisions §10: 跨 actor 协调=消息, no god-store, no cross-store direct call).
//
// This is the composition root (装配根) — the ONLY place that owns BOTH actor instances, so it is the
// correct place to bridge them. The bridge is EXPLICIT ASSEMBLY, not a god-store: each actor stays a pure
// single-writer of its OWN fact; neither imports the other. We only WATCH the session's projected
// `authenticated` flag and DISPATCH a permission COMMAND in response — exactly the design §B shape
// (login → loggedIn → permission loads → menu re-projects), realized here via the reactive projection.
//
//   authenticated TRUE  → dispatch loadPermissions()  → permission/load effect → setCodes + permissionLoaded
//                         → menu = projection(routes × codes) recomputes (codes change ⇒ menu changes).
//   authenticated FALSE → dispatch clearCodes()        → codes emptied (logout drops the menu's gated items).
//
// `immediate: true` covers HYDRATE: after a reload the persisted token is hydrated → `authenticated` is
// already true at subscribe time → the watcher fires once immediately → codes are (re)loaded. So a
// reloaded, still-logged-in user gets their codes back without re-logging in. The watcher is module-level
// (one app = one running chassis); it lives for the app's lifetime (never torn down — the singletons do not
// dispose), so no StopHandle bookkeeping is needed.
//
// WHY NOT in the session login effect: that would make the session actor reach into permission (a hidden
// cross-store call) — the very god-store/direct-call coupling decisions §10 forbids. Keeping the WHEN here
// (assembly) and the HOW in each actor's own reduce/effect preserves the actor boundary.
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
export const CHASSIS_KEY: InjectionKey<Chassis> = Symbol('dg-cell-mvi:admin:chassis');

/**
 * Resolve the shared chassis inside a component `setup()`. Falls back to the module singletons when no
 * provider is present (e.g. a component rendered outside the app provide tree in a test) so callers never
 * get `undefined` — the singletons ARE the canonical instances either way.
 */
export function useChassis(): Chassis {
  return inject(CHASSIS_KEY, chassis);
}
