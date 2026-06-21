/**
 * admin.shell-state · suite `projection` (投影非 store).
 *
 * Delta case `menu-projection`: given routes × permission, the menu is computed by
 * `projection(routes × permission)` — no single writer, not written back — and RECOMPUTES when
 * permission changes. We also cover hidden-stripping, multi-level trees, and breadcrumb derivation
 * (`projection(currentPath × menu)`), plus the rebuildability invariant (delete → recompute identical).
 */
import { describe, it, expect } from 'vitest';

import {
  projectMenu,
  projectBreadcrumb,
  hasPermission,
  resolveAuthRedirect,
  resolveRoutePermission,
} from '../src/index';
import type { RouteDescriptor } from 'dg-cell-mvi-admin-contract';

// A multi-level route tree exercising: permission gate, hidden, nesting, and ungated nodes.
const ROUTES: RouteDescriptor[] = [
  { name: 'dashboard', path: '/dashboard', meta: { title: 'Dashboard', icon: 'home' } },
  {
    name: 'system',
    path: '/system',
    meta: { title: 'System' },
    children: [
      { name: 'user', path: '/system/user', meta: { title: 'Users', permission: 'user:view' } },
      { name: 'role', path: '/system/role', meta: { title: 'Roles', permission: 'role:view' } },
      { name: 'secret', path: '/system/secret', meta: { title: 'Secret', hidden: true } },
    ],
  },
  { name: 'about', path: '/about', meta: { title: 'About', hidden: true } },
];

describe('projectMenu = projection(routes × permission)', () => {
  it('filters by meta.permission — nodes whose code the user lacks do not appear', () => {
    const menu = projectMenu(ROUTES, ['user:view']); // has user, lacks role
    const system = menu.find((m) => m.path === '/system');
    expect(system).toBeDefined();
    expect(system!.children.map((c) => c.path)).toEqual(['/system/user']); // role filtered out
  });

  it('ungated nodes are always present; with both codes both children show', () => {
    const menu = projectMenu(ROUTES, ['user:view', 'role:view']);
    expect(menu.map((m) => m.path)).toEqual(['/dashboard', '/system']); // /about hidden
    const system = menu.find((m) => m.path === '/system')!;
    expect(system.children.map((c) => c.path)).toEqual(['/system/user', '/system/role']);
  });

  it('drops meta.hidden nodes (top-level /about and nested /system/secret)', () => {
    const menu = projectMenu(ROUTES, ['user:view', 'role:view']);
    expect(menu.some((m) => m.path === '/about')).toBe(false);
    const system = menu.find((m) => m.path === '/system')!;
    expect(system.children.some((c) => c.path === '/system/secret')).toBe(false);
  });

  it('produces a multi-level tree; leaves carry children: []', () => {
    const menu = projectMenu(ROUTES, ['user:view']);
    const dash = menu.find((m) => m.path === '/dashboard')!;
    expect(dash.children).toEqual([]);
    expect(dash.title).toBe('Dashboard');
    expect(dash.icon).toBe('home');
  });

  // delta core: permission change → menu recomputes (determinism / rebuildability).
  it('RECOMPUTES when permission changes (more codes → more nodes)', () => {
    const before = projectMenu(ROUTES, []); // no perms
    const sysBefore = before.find((m) => m.path === '/system')!;
    expect(sysBefore.children).toEqual([]); // both gated children hidden

    const after = projectMenu(ROUTES, ['user:view', 'role:view']);
    const sysAfter = after.find((m) => m.path === '/system')!;
    expect(sysAfter.children.map((c) => c.path)).toEqual(['/system/user', '/system/role']);
  });

  it('REBUILDABLE + PURE: deterministic from inputs, never mutates routes', () => {
    const a = projectMenu(ROUTES, ['user:view']);
    const b = projectMenu(ROUTES, ['user:view']);
    expect(a).toEqual(b); // delete the menu, recompute → identical
    expect(a).not.toBe(b); // a fresh derivation each call (no shared writer/cache)
    // routes untouched by the projection
    expect(ROUTES[1].children!.map((c) => c.path)).toEqual([
      '/system/user',
      '/system/role',
      '/system/secret',
    ]);
  });
});

describe('projectBreadcrumb = projection(currentPath × menu)', () => {
  const menu = projectMenu(ROUTES, ['user:view', 'role:view']);

  it('derives the root→current chain through the menu tree', () => {
    const crumbs = projectBreadcrumb('/system/user', menu);
    expect(crumbs.map((c) => c.path)).toEqual(['/system', '/system/user']);
    expect(crumbs.map((c) => c.title)).toEqual(['System', 'Users']);
  });

  it('a top-level current yields a single crumb', () => {
    expect(projectBreadcrumb('/dashboard', menu).map((c) => c.path)).toEqual(['/dashboard']);
  });

  it('a path not in the visible menu (hidden/forbidden) yields []', () => {
    expect(projectBreadcrumb('/system/secret', menu)).toEqual([]); // secret is hidden
    expect(projectBreadcrumb('/nope', menu)).toEqual([]);
  });

  it('breadcrumb tracks the menu: losing a permission removes the crumb', () => {
    const restricted = projectMenu(ROUTES, ['user:view']); // no role
    expect(projectBreadcrumb('/system/role', restricted)).toEqual([]); // role gone from menu
    expect(projectBreadcrumb('/system/user', restricted).map((c) => c.path)).toEqual([
      '/system',
      '/system/user',
    ]);
  });
});

describe('hasPermission (pure resolve)', () => {
  it('ungated (no code) is always allowed; gated checks membership', () => {
    expect(hasPermission([], undefined)).toBe(true);
    expect(hasPermission([], '')).toBe(true);
    expect(hasPermission(['a'], 'a')).toBe(true);
    expect(hasPermission(['a'], 'b')).toBe(false);
  });
});

// behavior admin.rbac · suite `perm` case `menu-filter` (P5·T5.1/T5.3): the menu filters by the REAL
// remote-loaded codes the permission actor holds. This models the T5.3 chassis demo shape: 用户管理
// (`user:view`) and 角色管理 (`role:view`) are GRANTED (so they are reachable, functional RBAC assignment
// pages), while 系统设置 (`system:admin`) is WITHHELD — so 系统设置 is the item that disappears from the
// sidebar after login (the visible filter proof), without making role/user unreachable.
describe('menu filters by real permission codes (T5.1/T5.3 chassis shape)', () => {
  // a slice of the actual app resource tree (router/resources.ts), with the RBAC-gated leaves.
  const CHASSIS_ROUTES: RouteDescriptor[] = [
    {
      name: 'chassis-cat',
      path: '/cat/chassis',
      meta: { title: '底盘' },
      children: [
        { name: 'user', path: '/user', meta: { title: '用户管理', permission: 'user:view' } },
        { name: 'role', path: '/role', meta: { title: '角色管理', permission: 'role:view' } },
        { name: 'system', path: '/system', meta: { title: '系统设置', permission: 'system:admin' } },
        { name: 'demo', path: '/demo', meta: { title: '演示' } }, // ungated leaf
      ],
    },
  ];
  // exactly the dev mock's PARTIAL codes (chassis/mockHttpPort MOCK_PERMISSION_CODES): user/role granted,
  // system:admin (+ user:remove) withheld.
  const MOCK_CODES = ['user:view', 'user:add', 'user:edit', 'role:view', 'role:add', 'role:edit', 'role:delete'];

  it('anonymous (no codes loaded yet) hides ALL gated leaves, keeps the ungated one', () => {
    const menu = projectMenu(CHASSIS_ROUTES, []);
    const cat = menu.find((m) => m.path === '/cat/chassis')!;
    expect(cat.children.map((c) => c.path)).toEqual(['/demo']); // user + role + system all gated → hidden
  });

  it('after the mock load: 用户管理 + 角色管理 show (reachable/assignable), 系统设置 is FILTERED OUT (lacks system:admin)', () => {
    const menu = projectMenu(CHASSIS_ROUTES, MOCK_CODES);
    const cat = menu.find((m) => m.path === '/cat/chassis')!;
    expect(cat.children.map((c) => c.path)).toEqual(['/user', '/role', '/demo']); // /system removed — the filter proof
    expect(cat.children.some((c) => c.path === '/system')).toBe(false);
  });

  it('granting system:admin makes 系统设置 reappear (codes change ⇒ menu re-projects)', () => {
    const menu = projectMenu(CHASSIS_ROUTES, [...MOCK_CODES, 'system:admin']);
    const cat = menu.find((m) => m.path === '/cat/chassis')!;
    expect(cat.children.map((c) => c.path)).toEqual(['/user', '/role', '/system', '/demo']);
  });
});

// behavior admin.auth · suite `guard` case `auth-redirect`: the PURE half of the navigation guard —
// "未登录访问 meta.auth 路由 → 重定向 /login（带 redirect 由 app 守卫拼）". The redirect-query assembly
// + vue-router/NProgress/title live in the app guard (not here); this proves the decision logic.
describe('resolveAuthRedirect (pure auth gate, T2.3-AC1)', () => {
  it('auth-gated route + NO token → returns "/login" (redirect)', () => {
    expect(resolveAuthRedirect({ auth: true }, false)).toBe('/login');
  });

  it('auth-gated route + has token → returns null (allow / 放行)', () => {
    expect(resolveAuthRedirect({ auth: true }, true)).toBeNull();
  });

  it('public route (no auth flag) → returns null even without a token (放行)', () => {
    expect(resolveAuthRedirect({}, false)).toBeNull();
    expect(resolveAuthRedirect({ auth: false }, false)).toBeNull();
    expect(resolveAuthRedirect({ auth: undefined }, false)).toBeNull(); // e.g. the /login route meta
  });

  it('missing/empty meta is treated as public (no crash)', () => {
    expect(resolveAuthRedirect(undefined, false)).toBeNull();
    expect(resolveAuthRedirect(null, false)).toBeNull();
  });

  it('only the strict boolean true gates (truthy non-true does not require auth)', () => {
    // meta.auth is typed boolean; a stray truthy value must NOT be treated as a gate.
    expect(resolveAuthRedirect({ auth: 1 as unknown as boolean }, false)).toBeNull();
  });
});

// behavior admin.rbac · suite `perm` (route-level gate, P5·T5.2): the PURE half of the route-permission
// guard — "直接访问 meta.permission 未持有的路由 → 拦截/重定向 /403". The redirect MECHANISM (vue-router
// next('/403')) lives in the app guard; this proves the decision. Sibling of resolveAuthRedirect (auth
// vs authorization), shaped identically (redirect target | null) so the guard composes them uniformly.
describe('resolveRoutePermission (pure route-level authorization gate, T5.2)', () => {
  it('gated route the user does NOT hold → returns "/403" (block)', () => {
    expect(resolveRoutePermission({ permission: 'role:view' }, ['user:view'])).toBe('/403');
    expect(resolveRoutePermission({ permission: 'role:view' }, [])).toBe('/403');
  });

  it('gated route the user DOES hold → returns null (allow / 放行)', () => {
    expect(resolveRoutePermission({ permission: 'user:view' }, ['user:view'])).toBeNull();
    expect(resolveRoutePermission({ permission: 'role:view' }, ['user:view', 'role:view'])).toBeNull();
  });

  it('ungated route (no permission code) → returns null even with no codes (放行)', () => {
    expect(resolveRoutePermission({}, [])).toBeNull();
    expect(resolveRoutePermission({ permission: '' }, [])).toBeNull(); // empty code = no gate
    expect(resolveRoutePermission({ permission: undefined }, [])).toBeNull();
  });

  it('missing/empty meta is treated as ungated (no crash)', () => {
    expect(resolveRoutePermission(undefined, ['x'])).toBeNull();
    expect(resolveRoutePermission(null, [])).toBeNull();
  });

  it('the forbidden target is overridable (block → home instead of /403)', () => {
    expect(resolveRoutePermission({ permission: 'role:view' }, [], '/')).toBe('/');
    // a held code still passes regardless of the override target.
    expect(resolveRoutePermission({ permission: 'role:view' }, ['role:view'], '/')).toBeNull();
  });

  it('matches the menu filter: a code that hides the menu item also blocks the direct route', () => {
    // exactly the T5.3 chassis demo shape — the dev mock grants user/role but WITHHOLDS system:admin, so
    // 系统设置 is filtered from the menu (projectMenu) AND a direct visit to /system is blocked here with
    // the same codes, while /user and /role (reachable, assignable pages) pass.
    const MOCK_CODES = ['user:view', 'user:add', 'user:edit', 'role:view', 'role:add', 'role:edit', 'role:delete'];
    expect(resolveRoutePermission({ permission: 'user:view' }, MOCK_CODES)).toBeNull(); // /user passes
    expect(resolveRoutePermission({ permission: 'role:view' }, MOCK_CODES)).toBeNull(); // /role passes (assignable)
    expect(resolveRoutePermission({ permission: 'system:admin' }, MOCK_CODES)).toBe('/403'); // /system blocked
  });
});

// behavior admin.rbac · the LOAD-RACE gate (load-race fix): the app permission guard does NOT call
// resolveRoutePermission unconditionally — it gates on `permission.loaded` first
// (`loaded && resolveRoutePermission(meta, codes)`), so a navigation whose codes have not loaded yet is
// 放行ed instead of误判ed /403. resolveRoutePermission itself stays PURE/unchanged (it knows nothing about
// loading — it always judges by codes); the `loaded` precondition lives in the guard. This locks the exact
// composed predicate the guard applies, unit-testable without the vue-router shell (which couples DOM/
// nprogress/the chassis singletons — kept out of admin-logic). Mirrors how the guard reads it.
describe('guard load-race gate: only enforce resolveRoutePermission once codes are loaded', () => {
  // the precise predicate guards.ts applies inside beforeEach (loaded ⇒ judge by codes; else 放行).
  const gate = (loaded: boolean, meta: { permission?: string }, codes: string[]) =>
    loaded ? resolveRoutePermission(meta, codes) : null;

  it('NOT loaded → never blocks, even for a gated route the user will turn out to lack (no误跳 /403)', () => {
    // the race: guard fires before codes arrive (codes === [] because not-loaded, not because empty result).
    expect(gate(false, { permission: 'user:view' }, [])).toBeNull(); // would-be /403, but放行ed while loading
    expect(gate(false, { permission: 'system:admin' }, [])).toBeNull();
  });

  it('loaded → enforces exactly as resolveRoutePermission (held passes, missing → /403)', () => {
    expect(gate(true, { permission: 'user:view' }, ['user:view'])).toBeNull(); // held → pass
    expect(gate(true, { permission: 'system:admin' }, ['user:view'])).toBe('/403'); // missing → block
  });

  it('loaded + ungated route → passes regardless (and /403 itself is ungated ⇒ no补跳 loop)', () => {
    expect(gate(true, {}, [])).toBeNull(); // e.g. /403 (no meta.permission) → the post-load re-check is a no-op there
  });
});
