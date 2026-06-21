/**
 * dg-cell-mvi-admin-template · router — hash-history router built from the resource tree.
 *
 * Every LEAF resource becomes a child route under LayoutFramework (so they share the aside/header chrome),
 * its component lazy-loaded from src/views/<name>/index.vue. The bare path redirects to /product (the
 * example page). Every resource child route carries `meta.auth = true` — they require a session, so an
 * unauthenticated visit is redirected to /login by the auth guard.
 *
 * `/login` is registered OUTSIDE LayoutFramework (a top-level sibling route) so it renders on the bare
 * outside shell (DgAdminOutside) with no aside/header. `/login`, `/403`, and the catch-all 404 are PUBLIC
 * (no `meta.auth`).
 *
 * router-as-effect: the navigation guards (auth redirect / permission gate / title / NProgress / afterEach
 * tabs.openTab) are installed via `installGuards` below — vue-router stays the engine, the chassis actors
 * drive / are fed by it.
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
    // explicit `name` === the route name (the keep-alive contract). Every view is `views/<name>/index.vue`
    // with `<script setup>` and no `name:`, so @vitejs/plugin-vue infers the name from the FILENAME
    // (`index` for ALL of them — a collision for keep-alive). Vue's `<keep-alive :include>` matches by
    // COMPONENT name; the tabs actor's `keepAlive` list is built from ROUTE names. Stamping `comp.name =
    // name` aligns the two so the right view is cached/evicted.
    component: () =>
      import(`../views/${name}/index.vue`).then((m) => {
        const comp = (m.default ?? m) as Record<string, unknown>;
        if (comp && !comp.name) comp.name = name;
        return m;
      }),
    // framework resource pages require a session. The resource's `permission` code (if any) is carried onto
    // the route meta so the PERMISSION guard can block a DIRECT visit / deep link to a page the user lacks
    // the code for — the route-level analog of projectMenu hiding it from the sidebar.
    meta: { title: node.title, auth: true, permission: node.permission },
  };
}

// routes stay FLAT: walk the (possibly multi-level) resource TREE down to its leaf pages and map each leaf
// to a route. Categories are menu-only (no `component`) → they produce no route. The menu nesting is
// reconstructed for the SIDEBAR by `projectMenu` over the route descriptors in LayoutFramework.
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
    redirect: '/product',
    children: childRoutes,
  },
  // 403 Forbidden → the permission guard's redirect target. Renders on the outside shell. PUBLIC (no
  // meta.auth) so the redirect always lands — and no meta.permission so it never re-triggers the gate.
  {
    path: '/403',
    name: 'forbidden',
    component: Forbidden,
    meta: { title: '403' },
  },
  // catch-all 404 → NotFound on the outside shell. Public. Statically imported (NOT via the dynamic glob).
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

// router-as-effect: wire the chassis guards (auth gate / permission gate / title / NProgress / tabs.openTab).
installGuards(router);

export default router;
