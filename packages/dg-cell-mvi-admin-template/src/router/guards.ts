/**
 * dg-cell-mvi-admin-template · router/guards — the router-as-effect navigation guards.
 *
 * DEPA router-as-effect: vue-router stays the ENGINE; the guards are the integration boundary where the
 * chassis actors drive / are fed by navigation:
 *   - beforeEach reads the `session` token PROJECTION and runs the PURE `resolveAuthRedirect` decision
 *     (admin-logic) to gate auth routes, THEN the PURE `resolveRoutePermission` decision over the
 *     `permission` actor's codes to gate by `meta.permission` (a direct visit / deep link to a page the
 *     user lacks the code for → /403). The *mechanism* (NProgress / document.title / building the
 *     `?redirect=` query / next('/403')) lives HERE; the pure decisions stay render/IO free in admin-logic.
 *   - afterEach feeds the route change as a MESSAGE to the `tabs` actor (route change → openTab).
 *
 * Guards are plain modules, so they import the shared singletons directly (cannot use Vue inject).
 */
import type { Router, RouteLocationNormalized } from 'vue-router';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

import { resolveAuthRedirect, resolveRoutePermission } from 'dg-cell-mvi-admin-logic';
import { openTab } from 'dg-cell-mvi-admin-contract';
import type { TabItem } from 'dg-cell-mvi-admin-contract';
import { watch } from 'dg-cell-mvi-core';

import { sessionStore, tabsStore, permissionStore } from '../chassis/stores';

/** the app name appended to every document title. */
const APP_NAME = 'Admin Template';

// NProgress: no spinner, just the top bar.
NProgress.configure({ showSpinner: false });

/** Does the chassis currently hold an auth token? (reads the session actor's fact projection.) */
function hasToken(): boolean {
  return sessionStore.state().token !== '';
}

/** The permission actor's currently-held codes (read LIVE per navigation). */
function permissionCodes(): string[] {
  return permissionStore.state().codes;
}

/**
 * Has a codes load RESOLVED yet for this session? The permission gate consults this so it never误判 during
 * the load RACE: codes load asynchronously (~200ms HttpPort), so a login-redirect / reload / typed deep-link
 * can fire the guard BEFORE codes arrive. Gating only when `loaded` is true lets a not-yet-loaded visit
 * through; the post-load re-check below补跳s if it turns out无权.
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
    // keep-alive marker — follows `meta.cache` (default true; a route may opt out with `meta.cache: false`).
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
 * Install the chassis navigation guards on the app router. Called once from src/router/index.ts.
 *
 * beforeEach order: NProgress.start → auth gate → permission gate (only when codes loaded) → title.
 * afterEach  order: NProgress.done → tabs.openTab (route回流), skipping login / 404.
 * post-load re-check: a watch on the permission fact that补跳s /403 when codes resolve onto a route the
 *   user lacks the code for (closes the放行-before-codes-loaded window).
 */
export function installGuards(router: Router): void {
  router.beforeEach((to, _from, next) => {
    NProgress.start();

    // --- auth gate: pure decision over the session token projection. ---
    const redirectTarget = resolveAuthRedirect(to.meta, hasToken());
    if (redirectTarget) {
      // need login → bounce to /login?redirect=<原路径>.
      NProgress.done();
      next(`${redirectTarget}?redirect=${encodeURIComponent(to.fullPath)}`);
      return;
    }

    // --- permission gate: once authenticated, a DIRECT visit to a route whose meta.permission the user
    //     does not hold is blocked. GATE ONLY ONCE CODES ARE LOADED (load-race fix); the post-load re-check
    //     below补跳s the instant codes resolve if the verdict is无权. ---
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
    // route change = a message fed to the tabs actor. Login / 404 are not tabs.
    if (isTabbable(to)) {
      tabsStore.dispatch(openTab(toTabItem(to)));
    }
  });

  // --- POST-LOAD RE-CHECK (load-race fix, the second half of the `loaded` gate above). The instant the
  // codes load RESOLVES (`loaded` flips true), re-evaluate the route the user is CURRENTLY on with the
  // now-known codes; if无权,补跳 /403 — closing the window so a放行ed-then-forbidden visit cannot leave the
  // user parked on a page they lack the code for. No loop: /403 carries no meta.permission. ---
  watch(
    () => {
      const vm = permissionStore.viewModel();
      return { loaded: vm.loaded, codes: vm.codes };
    },
    ({ loaded }) => {
      if (!loaded) return;
      const current = router.currentRoute.value;
      const forbiddenTarget = resolveRoutePermission(current.meta, permissionCodes());
      if (forbiddenTarget && current.path !== forbiddenTarget) {
        router.replace(forbiddenTarget);
      }
    },
    { immediate: true },
  );
}
