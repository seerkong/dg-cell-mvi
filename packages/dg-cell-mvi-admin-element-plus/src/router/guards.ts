/**
 * dg-cell-mvi-admin-element-plus · router/guards — the router-as-effect navigation guards (T2.3).
 *
 * DEPA router-as-effect (design §F P2 / §B): vue-router stays the ENGINE; the guards are the integration
 * boundary where the chassis actors drive / are fed by navigation:
 *   - beforeEach reads the `session` token PROJECTION and runs the PURE `resolveAuthRedirect` decision
 *     (admin-logic) to gate auth routes, THEN the PURE `resolveRoutePermission` decision over the
 *     `permission` actor's codes to gate by `meta.permission` (T5.2: a direct visit / deep link to a
 *     page the user lacks the code for → /403). The *mechanism* (NProgress / document.title / building
 *     the `?redirect=` query / next('/403')) lives HERE in the app router layer (not in admin-logic —
 *     that stays render/IO free). Both pure decisions are unit-tested in admin-logic; this file is the
 *     thin vue-router adapter that reads the two actors' projections and applies the redirects.
 *   - afterEach feeds the route change as a MESSAGE to the `tabs` actor (route change → openTab), i.e.
 *     the route回流 drives the tabs actor (design §B "路由变化作消息喂 tabs").
 *
 * Token read: from the shared `sessionStore` projection — `state().token` (the session actor's fact).
 * Guards are plain modules, so they import the shared singleton directly (cannot use Vue inject).
 */
import type { Router, RouteLocationNormalized } from 'vue-router';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

import { resolveAuthRedirect, resolveRoutePermission } from 'dg-cell-mvi-admin-logic';
import { openTab } from 'dg-cell-mvi-admin-contract';
import type { TabItem } from 'dg-cell-mvi-admin-contract';
import { watch } from 'dg-cell-mvi-core';

import { sessionStore, tabsStore, permissionStore } from '../chassis/stores';

/** the app name appended to every document title (e.g. "用户管理 · dg-cell-mvi Admin"). */
const APP_NAME = 'dg-cell-mvi Admin';

// NProgress: no spinner, just the top bar (matches the reference admin's feel).
NProgress.configure({ showSpinner: false });

/** Does the chassis currently hold an auth token? (reads the session actor's fact projection.) */
function hasToken(): boolean {
  return sessionStore.state().token !== '';
}

/**
 * The permission actor's currently-held codes (read LIVE per navigation). The chassis loads these
 * reactively after login (authenticated → loadPermissions, chassis/stores.ts). Read fresh each call so
 * the gate reflects the latest codes.
 */
function permissionCodes(): string[] {
  return permissionStore.state().codes;
}

/**
 * Has a codes load RESOLVED yet for this session? The permission gate consults this so it never误判 during
 * the load RACE: the codes fetch is async (~200ms HttpPort), so a login-redirect / reload / typed deep-link
 * to a permission-gated route can fire the guard BEFORE codes arrive — at which point `codes` is `[]` for a
 * not-loaded reason, indistinguishable from "loaded, holds nothing". Gating only when `loaded` is true means
 * a not-yet-loaded visit is let through (no误跳 /403); the post-load re-check below补跳s if it turns out无权.
 */
function permissionLoaded(): boolean {
  return permissionStore.state().loaded;
}

/** Set the browser tab title from the route meta (falls back to just the app name). */
function applyTitle(to: RouteLocationNormalized): void {
  const title = typeof to.meta?.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
}

/** Map a resolved route to a tabs `TabItem` (the shape the tabs actor's openTab command carries). */
function toTabItem(to: RouteLocationNormalized): TabItem {
  return {
    name: typeof to.name === 'string' ? to.name : to.fullPath,
    fullPath: to.fullPath,
    title: typeof to.meta?.title === 'string' ? to.meta.title : undefined,
    // keep-alive marker (behavior admin.layout multi-tab: "keepAlive 按 meta.cache include 列表"). The
    // tabs reducer's deriveKeepAlive only includes tabs whose `keepAlive` is true, so this flag is what
    // populates the layout's `<keep-alive :include>`. Follows `meta.cache` (default true — framework
    // pages cache so navigating away/back restores their state, like the reference admin's cached views;
    // a route may opt out with `meta.cache: false`).
    keepAlive: to.meta?.cache !== false,
    meta: to.meta as Record<string, unknown>,
  };
}

/** route names that live OUTSIDE the framework chrome → never opened as a tab. */
const NON_TAB_ROUTES = new Set(['login', 'not-found', 'forbidden']);

function isTabbable(to: RouteLocationNormalized): boolean {
  if (typeof to.name === 'string' && NON_TAB_ROUTES.has(to.name)) return false;
  return true;
}

/**
 * Install the chassis navigation guards on the app router. Called once from src/router/index.ts after
 * the router is created.
 *
 * beforeEach order: NProgress.start → auth gate (resolveAuthRedirect → redirect or pass) → permission gate
 *   (only when codes are loaded — load-race fix) → title.
 * afterEach  order: NProgress.done → tabs.openTab (route回流 → tabs actor), skipping login / 404.
 * post-load re-check: a watch on the permission fact that补跳s /403 when codes resolve onto a route the
 *   user lacks the code for (closes the放行-before-codes-loaded window; see the watch below).
 */
export function installGuards(router: Router): void {
  router.beforeEach((to, _from, next) => {
    NProgress.start();

    // --- auth gate: pure decision over the session token projection (router-as-effect, design §F). ---
    const redirectTarget = resolveAuthRedirect(to.meta, hasToken());
    if (redirectTarget) {
      // need login → bounce to /login?redirect=<原路径> (the app assembles the redirect query here,
      // where to.fullPath lives — admin-logic returned only the bare '/login' target).
      NProgress.done();
      next(`${redirectTarget}?redirect=${encodeURIComponent(to.fullPath)}`);
      return;
    }

    // --- permission gate (T5.2): once authenticated, a DIRECT visit to a route whose meta.permission
    // the user does not hold is blocked. Pure decision (resolveRoutePermission) over the permission
    // actor's current codes — the route-level analog of projectMenu hiding the item from the sidebar:
    // hiding the menu link is not enough; a deep link / typed URL must be stopped too. The mechanism
    // (next('/403')) lives here; the decision stays pure in admin-logic. The /403 page itself is
    // ungated + public, so the redirect lands without re-triggering this gate (no loop).
    //
    // GATE ONLY ONCE CODES ARE LOADED (load-race fix): codes load asynchronously (chassis watch
    // authenticated → loadPermissions, ~200ms), so on a login-redirect / reload / typed deep-link this
    // guard can run BEFORE they arrive. Enforcing the gate then would read empty codes and误跳 /403 even
    // for a route the user DOES hold. So we only block when `permissionLoaded()` — until codes truly land
    // the permission gate is skipped (放行); the auth gate above still stops anonymous visits. The instant
    // codes resolve, the post-load re-check in installGuards补跳s /403 if the (now-known) verdict is无权,
    // so the放行-window cannot leave the user parked on a forbidden page. ---
    if (permissionLoaded()) {
      const forbiddenTarget = resolveRoutePermission(to.meta, permissionCodes());
      if (forbiddenTarget) {
        NProgress.done();
        next(forbiddenTarget);
        return;
      }
    }

    // already-authenticated user hitting /login → send to home instead of showing the login page again.
    if (to.name === 'login' && hasToken()) {
      NProgress.done();
      next('/');
      return;
    }

    applyTitle(to);
    next();
  });

  router.afterEach((to) => {
    NProgress.done();
    // route change = a message fed to the tabs actor (design §B). Login / 404 are not tabs.
    if (isTabbable(to)) {
      tabsStore.dispatch(openTab(toTabItem(to)));
    }
  });

  // --- POST-LOAD RE-CHECK (load-race fix, the second half of the `loaded` gate above). ---------------
  // The beforeEach permission gate放行s a navigation whose codes have not loaded yet (it cannot tell无权
  // from not-yet-loaded). That opens a window: a login-redirect / reload / typed deep-link can LAND on a
  // permission-gated page before codes arrive. The instant the codes load RESOLVES (permission/load HttpPort
  // re-dispatches setCodes → `loaded` flips true), we re-evaluate the route the user is CURRENTLY on with
  // the now-known codes; if the verdict is无权, we补跳 /403 — closing the window so a放行ed-then-forbidden
  // visit cannot leave the user parked on a page they lack the code for.
  //
  // Same singletons as everywhere else (permissionStore + this router) — the assembly-root coordination the
  // chassis itself cannot do (chassis/stores.ts owns no router reference), placed here where both are in
  // scope. We watch the projected `loaded`/`codes` (a reactive read of the permission fact); `untracked`
  // is unnecessary — `router.currentRoute.value` is read inside the callback, not the source.
  //
  // No loop: /403 carries no meta.permission, so resolveRoutePermission returns null for it (a re-check
  // while already on /403 is a no-op). A code-only change (re-load that keeps `loaded` true) also re-checks
  // and only ever redirects toward /403, never away from it — safe and idempotent.
  watch(
    () => {
      const vm = permissionStore.viewModel();
      // depend on BOTH so a re-load that changes codes (without toggling `loaded`) also re-checks.
      return { loaded: vm.loaded, codes: vm.codes };
    },
    ({ loaded }) => {
      if (!loaded) return; // not loaded yet (or just cleared on logout) → nothing authoritative to enforce.
      const current = router.currentRoute.value;
      const forbiddenTarget = resolveRoutePermission(current.meta, permissionCodes());
      // only补跳 if we are NOT already heading there (guards against a redundant replace / any loop).
      if (forbiddenTarget && current.path !== forbiddenTarget) {
        router.replace(forbiddenTarget);
      }
    },
    // immediate: if codes are ALREADY loaded by the time guards install (e.g. a fast hydrate that resolved
    // before this module ran), re-check the landing route once on install too — covers that ordering.
    { immediate: true },
  );
}
