/**
 * dg-cell-mvi-admin-element-plus · router — hash-history router built from the resource tree.
 *
 * Every resource becomes a child route under LayoutFramework (so they share the aside/header chrome),
 * its component lazy-loaded from src/views/<name>/index.vue. The bare path redirects to /user. Every
 * resource child route carries `meta.auth = true` — they are framework pages that require a session,
 * so an unauthenticated visit is redirected to /login by the auth guard (T2.3-AC1).
 *
 * `/login` is registered OUTSIDE LayoutFramework (a top-level sibling route) so it renders on the bare
 * outside shell (DgAdminOutside) with no aside/header (add-admin-chassis P2·T2.2). `/login` and the
 * catch-all 404 are PUBLIC (no `meta.auth`).
 *
 * router-as-effect (T2.3, design §F P2): the navigation guards (auth redirect / title / NProgress /
 * afterEach tabs.openTab) are installed via `installGuards` below — vue-router stays the engine, the
 * chassis actors drive / are fed by it. 404 = the `/:pathMatch(.*)*` catch-all on the outside shell.
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import LayoutFramework from '../layout/LayoutFramework.vue';
import NotFound from '../views/404/index.vue';
import Forbidden from '../views/403/index.vue';
import { leafResources, type ResourceNode } from './resources';
import { installGuards } from './guards';

function toRoute(node: ResourceNode): RouteRecordRaw {
  // only LEAF resources reach here (categories are filtered out by leafResources), so `component` is set.
  const name = node.component as string;
  return {
    path: node.path,
    name,
    // lazy view: src/views/<name>/index.vue. We MAP the import so the resolved component carries an
    // explicit `name` === the route name (P4·T4.1 keep-alive contract). WHY this is required: every view
    // is `views/<name>/index.vue` and uses `<script setup>` with no `name:` — @vitejs/plugin-vue then
    // infers the component name from the FILENAME, i.e. `index` for ALL of them (a useless collision for
    // keep-alive). Vue's `<keep-alive :include>` matches by COMPONENT name; the tabs actor's `keepAlive`
    // list is built from ROUTE names (= `node.component`, e.g. `user`). Stamping `comp.name = name` on the
    // resolved module's default export aligns the two, so `:include="keepAlive"` caches/evicts the right
    // view — and closing a tab (which drops its name from keepAlive) actually drops its cached instance.
    component: () =>
      import(`../views/${name}/index.vue`).then((m) => {
        const comp = (m.default ?? m) as Record<string, unknown>;
        // stamp the route name as the component name (idempotent; never overwrite an explicit one).
        if (comp && !comp.name) comp.name = name;
        return m;
      }),
    // framework resource pages require a session (auth guard redirects anonymous visits to /login). The
    // resource's `permission` code (if any) is carried onto the route meta so the PERMISSION guard
    // (router/guards.ts → resolveRoutePermission) can block a DIRECT visit / deep link to a page the user
    // lacks the code for — the route-level analog of projectMenu hiding it from the sidebar (T5.2). A
    // resource with no `permission` carries `meta.permission = undefined` ⇒ ungated (always reachable).
    meta: { title: node.title, auth: true, permission: node.permission },
  };
}

// routes stay FLAT: walk the (now multi-level) resource TREE down to its leaf pages and map each leaf to
// a route. Categories are menu-only (no `component`) → they produce no route (router/index.ts §). The menu
// nesting is reconstructed for the SIDEBAR by `projectMenu` over the route descriptors in LayoutFramework.
const childRoutes: RouteRecordRaw[] = leafResources().map(toRoute);

const routes: RouteRecordRaw[] = [
  // login lives OUTSIDE the LayoutFramework chrome (renders on DgAdminOutside). Public, lazy-loaded.
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/login/index.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: LayoutFramework,
    redirect: '/user',
    children: childRoutes,
  },
  // 403 Forbidden → the permission guard's redirect target for a direct visit to a route whose
  // meta.permission the user does not hold (T5.2). Renders on the outside shell (no aside/header), like
  // login / 404. PUBLIC (no meta.auth) so the redirect always lands — and no meta.permission so it never
  // re-triggers the permission guard (which would loop). Statically imported (never via the dynamic glob).
  {
    path: '/403',
    name: 'forbidden',
    component: Forbidden,
    meta: { title: '403' },
  },
  // catch-all 404 → NotFound on the outside shell. Public. Statically imported (NOT via the dynamic
  // `../views/${name}/index.vue` glob, so it never collides with the lazy resource-view loader).
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFound,
    meta: { title: '404' },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// router-as-effect: wire the chassis guards (auth gate / title / NProgress / tabs.openTab回流).
installGuards(router);

export default router;
