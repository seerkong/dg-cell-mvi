/**
 * dg-cell-mvi-admin-logic · logic/menuProjection — the 6-级 derived projections (design §A/§9).
 *
 *   menu       = projection(routes × permissionCodes)
 *   breadcrumb = projection(currentPath × menu)
 *
 * These are PURE FUNCTIONS, not stores: no single writer, no reactive node, NEVER written back to the
 * 1-级 facts. Given the same (routes, codes) they always yield the same menu — so a menu can be
 * deleted and recomputed deterministically (the §9 discipline: "删了能重建"). When permission changes,
 * the caller simply re-invokes `projectMenu` — the result recomputes, proving determinism.
 *
 * Port of the reference crud's resource store `filterChildrenByPermission` — but extracted as a pure function
 * (the reference did it as a Pinia mutation that *rewrote* `frameworkMenus`; here it is derive-only).
 */
import type {
  RouteDescriptor,
  RouteMeta,
  MenuItem,
  BreadcrumbItem,
} from 'dg-cell-mvi-admin-contract';

/**
 * Pure membership test. An empty/undefined required `code` means "no permission gate" → always
 * allowed (matches the reference: nodes without `meta.permission` are kept regardless of codes).
 */
export function hasPermission(codes: string[], code?: string): boolean {
  if (!code) return true;
  return codes.includes(code);
}

/**
 * `resolveAuthRedirect(meta, hasToken)` — the PURE authentication decision for the router-as-effect
 * navigation guard (design §F P2: "守卫里的鉴权判断读 session store 投影"). This is the testable
 * logic; the guard *mechanism* (vue-router beforeEach / NProgress / document.title / building the
 * `?redirect=` query string) stays in the app router layer — this function touches neither vue-router
 * nor the DOM (admin-logic stays render/IO-free).
 *
 * Rule (port of the reference `to.meta?.auth → has token? next() : redirect /login`):
 *   - the destination is auth-gated (`meta.auth === true`) AND there is NO token → return `'/login'`
 *     (the bare login path; the app guard appends `?redirect=<encoded fullPath>` so the LoginView can
 *     bounce back). This is the auth-redirect *target*, not the full URL — keeping the redirect-query
 *     assembly in the app (where `to.fullPath` lives) preserves layer neutrality.
 *   - otherwise (public route, or gated but already holding a token) → return `null` (= "let it pass").
 *
 * `meta` is optional/loosely-typed because vue-router's `RouteMeta` is the live shape at the call site;
 * we only read the `auth` flag. `hasToken` is the session projection (`token !== ''`) the guard reads.
 *
 * @returns `'/login'` when the navigation must be redirected to the login page; `null` to allow it.
 */
export function resolveAuthRedirect(
  meta: { auth?: boolean } | undefined | null,
  hasToken: boolean,
): string | null {
  const requiresAuth = meta?.auth === true;
  if (requiresAuth && !hasToken) return '/login';
  return null;
}

/**
 * `resolveRoutePermission(meta, codes)` — the PURE route-level authorization decision for the
 * router-as-effect navigation guard (the permission sibling of `resolveAuthRedirect`). Where
 * `resolveAuthRedirect` answers "is the visitor logged in at all?", this answers "does the visitor hold
 * the code this route requires?" — the route-level analog of `projectMenu`'s `meta.permission` filter
 * (a forbidden route is hidden from the menu by `projectMenu`; this stops a DIRECT visit / deep link to
 * the same path). Pure: touches neither vue-router nor the DOM (admin-logic stays render/IO-free).
 *
 * Rule (mirrors `hasPermission`'s gate, lifted to a redirect target so the guard composes it exactly
 * like `resolveAuthRedirect`):
 *   - the destination is permission-gated (`meta.permission` is a non-empty code) AND the user does NOT
 *     hold it → return the `forbidden` target (default `'/403'`). The guard does `next('/403')`.
 *   - otherwise (ungated route, or gated but the code IS held) → return `null` (= "let it pass").
 *
 * The `forbidden` target is a parameter (default `'/403'`) so a consumer can redirect无权 visits to the
 * home page or a custom page instead — the DECISION stays here; the destination stays the caller's
 * choice (layer neutrality, same as `resolveAuthRedirect` keeping the `?redirect=` assembly in the app).
 *
 * @param meta the destination route meta (only `permission` is read); optional/loosely-typed because
 *             vue-router's live `RouteMeta` is the call-site shape.
 * @param codes the permission actor's currently-held codes (the guard reads `permissionStore.state().codes`).
 * @param forbidden the redirect target for an unauthorized visit (default `'/403'`).
 * @returns the redirect target when the visit must be blocked; `null` to allow it.
 */
export function resolveRoutePermission(
  meta: { permission?: string } | undefined | null,
  codes: string[],
  forbidden = '/403',
): string | null {
  const required = meta?.permission;
  if (hasPermission(codes, required)) return null;
  return forbidden;
}

function metaOf(route: RouteDescriptor): RouteMeta {
  return route.meta ?? {};
}

/** the visible title for a route (meta.title, falling back to name, then path). */
function titleOf(route: RouteDescriptor): string {
  const meta = metaOf(route);
  return meta.title ?? route.name ?? route.path;
}

/**
 * `menu = projection(routes × permissionCodes)`.
 *
 * Rules (port of the reference, made pure + recursive over the full tree):
 *   1. drop any node with `meta.hidden === true` (routable but not shown);
 *   2. drop any node whose `meta.permission` code the user does NOT hold;
 *   3. recurse into `children` (multi-level), filtering them the same way;
 *   4. leaves carry `children: []` (never undefined).
 *
 * Deterministic + pure: same inputs → same output; no mutation of `routes`.
 */
export function projectMenu(routes: RouteDescriptor[], permissionCodes: string[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const route of routes) {
    const meta = metaOf(route);
    if (meta.hidden === true) continue;
    if (!hasPermission(permissionCodes, meta.permission)) continue;
    const children = route.children?.length
      ? projectMenu(route.children, permissionCodes)
      : [];
    out.push({
      name: route.name,
      path: route.path,
      title: titleOf(route),
      icon: meta.icon,
      children,
    });
  }
  return out;
}

/**
 * `breadcrumb = projection(currentPath × menu)`: the root→current chain through the menu tree.
 *
 * Walks the (already permission-filtered) menu depth-first for the node whose `path === currentPath`,
 * accumulating the ancestor chain. Returns `[]` when the path is not in the visible menu (e.g. a
 * hidden/forbidden route has no breadcrumb). Pure: derives solely from its two inputs, writes nothing.
 */
export function projectBreadcrumb(currentPath: string, menu: MenuItem[]): BreadcrumbItem[] {
  function walk(nodes: MenuItem[], trail: BreadcrumbItem[]): BreadcrumbItem[] | null {
    for (const node of nodes) {
      const here: BreadcrumbItem = { path: node.path, title: node.title, icon: node.icon };
      const nextTrail = [...trail, here];
      if (node.path === currentPath) return nextTrail;
      if (node.children.length) {
        const found = walk(node.children, nextTrail);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(menu, []) ?? [];
}
