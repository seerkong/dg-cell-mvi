/**
 * dg-cell-mvi-admin-contract · projection — types for the 6-级 derived projections (design §A/§9).
 *
 *   menu       = projection(routes × permissionCodes)
 *   breadcrumb = projection(currentRoute × menu)
 *
 * These are DERIVED facts: **no store, no single writer, never written back to the 1-级 facts**. They
 * are produced by PURE functions (declared here as signatures, implemented in admin-logic). Deleting a
 * menu is meaningless — it is recomputed deterministically from routes + permission. This file owns
 * the input/output shapes + the function *type* contracts only.
 */

// ---------------------------------------------------------------------------
// projection INPUT — the route description (3-级 control-plane fact, supplied by the router layer)
// ---------------------------------------------------------------------------

/**
 * Route meta a menu/breadcrumb projection reads. `permission` gates visibility (a code the user must
 * hold); `hidden` excludes the route from the menu entirely; `title`/`icon` drive rendering.
 */
export interface RouteMeta {
  title?: string;
  icon?: string;
  /**
   * authentication gate (read by the router-as-effect auth guard, design §F P2). When `true`, an
   * unauthenticated visit is redirected to `/login?redirect=<原路径>`. Distinct from `permission`:
   * `auth` is "must be logged in at all"; `permission` is "must hold this code". A route with no
   * `auth` (and no `permission`) is public.
   */
  auth?: boolean;
  /** required permission code; if set and absent from the user's codes, the node is filtered out. */
  permission?: string;
  /** exclude from the menu (still routable, just not shown). */
  hidden?: boolean;
  /** affix/pin to the tab bar — read by the tabs layer, carried through projections opaquely. */
  affix?: boolean;
  [k: string]: unknown;
}

/**
 * A route node (the projection's source of truth for structure). A multi-level tree mirrors
 * vue-router's nested `children`. `name` keys keep-alive; `path` is the navigable address.
 */
export interface RouteDescriptor {
  name?: string;
  path: string;
  meta?: RouteMeta;
  children?: RouteDescriptor[];
}

// ---------------------------------------------------------------------------
// projection OUTPUT — menu (6-级 derived_projection)
// ---------------------------------------------------------------------------

/** A rendered menu node — a permission-filtered, hidden-stripped view of the route tree. */
export interface MenuItem {
  /** the route name (if any) — stable key. */
  name?: string;
  /** navigable path. */
  path: string;
  title: string;
  icon?: string;
  /** child menu nodes (empty array when none — leaves carry `[]`, never `undefined`). */
  children: MenuItem[];
}

// ---------------------------------------------------------------------------
// projection OUTPUT — breadcrumb (6-级 derived_projection)
// ---------------------------------------------------------------------------

/** A breadcrumb segment — the path from the menu root to the current route. */
export interface BreadcrumbItem {
  path: string;
  title: string;
  icon?: string;
}

// ---------------------------------------------------------------------------
// projection function CONTRACTS (pure; implemented in admin-logic)
// ---------------------------------------------------------------------------

/** `menu = projection(routes × permissionCodes)`: filter by `meta.permission` + drop `meta.hidden`, keep tree. */
export type ProjectMenu = (routes: RouteDescriptor[], permissionCodes: string[]) => MenuItem[];

/** `breadcrumb = projection(currentPath × menu)`: the root→current chain through the menu tree. */
export type ProjectBreadcrumb = (currentPath: string, menu: MenuItem[]) => BreadcrumbItem[];

/** `hasPermission(codes, code)`: pure membership test; an empty/undefined required code = always allowed. */
export type HasPermission = (codes: string[], code?: string) => boolean;
