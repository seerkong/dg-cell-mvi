/**
 * dg-cell-mvi-admin-element-plus · chassis/mockHttpPort — a DEV-only in-process HttpPort impl.
 *
 * DEPA Effect 维 (design §C/§E): the auth flow's AND the crud data flow's only IO surface is the injected
 * `HttpPort`. To run BOTH end-to-end in the demo WITHOUT a backend, we swap the *port implementation* (a
 * mock) rather than touching any logic — admin-logic/admin-support and the crud package stay pure (they
 * depend only on the port interface / their request callbacks). This mock lives in the APP layer (the
 * 消费方/装配根) where the concrete port is chosen.
 *
 * What it answers:
 *   - POST `/login`                       → `{ token, userInfo }` (token = a fake JWT; profile inline).
 *   - GET/POST `/sys/authority/user/mine` → the same `userInfo` (the `mine`/loadUserInfo fallback path).
 *   - the registered CRUD resources (T3.2)→ list/add/edit/del over a per-resource in-memory store
 *     (reuses mockService.buildMock), wrapped in the `{ code:0, data }` envelope so the axios-style
 *     unwrap contract (T3.1) holds identically under the mock. The list response's `data` is the raw page
 *     res `{ records, total, limit, offset }` that commonCrudOptions.transformRes expects.
 *   - anything else                       → resolves `undefined` (never rejects, so a stray call can't
 *                                           strand a flow).
 *
 * All responses go through the SAME envelope the axios port unwraps, so a page that talks to this mock
 * via the HttpPort sees exactly what it would see from a real backend behind the axios port: the bare
 * `data`. mock vs real is decided purely by which impl chassis/stores.ts injects (DEV → this; else axios).
 *
 * SCOPE: the dev mock that makes auth + the migrated data page(s) demonstrable. Pages NOT migrated to the
 * HttpPort keep using their own mockService directly (independent of this transport).
 */
import type { HttpPort, HttpRequestConfig, LoginResponse, UserInfo } from 'dg-cell-mvi-admin-contract';

import { buildMock, type MockListReq, type MockService } from '../api/mockService';

/**
 * DEV-only path that simulates a 401 from the backend so the 401→logout flow is observable in the browser
 * WITHOUT a real server (the auth/crud mocks above never 401). Hitting this url makes the mock play exactly
 * what the axios port does on a real auth failure: invoke `onUnauthorized` (the app wires it to logout) and
 * then reject — see axiosHttpPort.failUnauthorizedFromCode (`onUnauthorized()` then `throw`). The page that
 * triggers it (SessionProof) swallows the rejection; the logout dispatch then trips the nav guard. Used only
 * by the dev "模拟 401" button; a real backend's 401 reaches the SAME `onUnauthorized` via the axios port.
 */
export const DEBUG_UNAUTHORIZED_URL = '/debug/401';

/** The canned profile the mock returns for both the inline-login userInfo and the `mine` call. */
const MOCK_USER: UserInfo = {
  id: 1,
  username: 'admin',
  nickname: '演示管理员',
  avatar: '',
  roles: ['admin'],
};

/**
 * The canned permission codes the mock returns from the `permissions` endpoint (T5.1/T5.3). A DELIBERATELY
 * PARTIAL set, curated so ALL FIVE browser-observable RBAC outcomes show at once and DON'T contradict each
 * other (T5.3: role/user must be REACHABLE to be assignable, yet something must still demo the gate):
 *
 *   GRANTED (so the page is reachable + can assign / its permitted buttons show):
 *     - user:view / user:add / user:edit  → 用户管理 menu shows; 用户页 add+edit buttons show.
 *     - role:view / role:add / role:edit / role:delete → 角色管理 menu shows + reachable (so a role's
 *       permissions can be assigned); 角色页 add+edit+delete buttons all show.
 *
 *   WITHHELD (the deliberate gaps — each drives ONE visible RBAC proof):
 *     - `user:remove`   → 用户页 行删除按钮 is HIDDEN (delta admin.rbac case `crud-button` — a global-store
 *                         button-permission gate; the role page's delete shows, so the contrast is clear).
 *     - `system:admin`  → 系统设置 (/system) is FILTERED OUT of the menu AND a direct visit is redirected to
 *                         /403 (delta `menu-filter` + route-guard). This is the dedicated gated item, kept
 *                         separate from role/user precisely so role/user can be reachable+assignable while
 *                         a DIFFERENT page still proves the menu/route gate.
 *
 * That makes role/user functional RBAC pages (reachable, assignable) WITHOUT losing the gate demo. Flip /
 * extend this list (e.g. add `system:admin`) to watch the menu + route gate recompute live. The role page
 * can also GRANT `system:admin` to a role (assignment demo) — orthogonal to what THIS user currently holds.
 */
const MOCK_PERMISSION_CODES: string[] = [
  // user: view + add + edit granted; user:remove WITHHELD (用户页 删除按钮 hidden — the crud-button proof).
  'user:view',
  'user:add',
  'user:edit',
  // role: fully granted (view→reachable+assignable; add/edit/delete buttons all show on 角色页).
  'role:view',
  'role:add',
  'role:edit',
  'role:delete',
  // NOTE: `user:remove` intentionally ABSENT → 用户页 行删除按钮 hidden (button-permission demo).
  // NOTE: `system:admin` intentionally ABSENT → 系统设置 menu filtered out + /system 直接访问 → /403
  //       (the dedicated gated menu/route demo, separate from role/user so those stay reachable).
];

/**
 * One CRUD resource served by the mock: its URL endpoints + a seed dataset. The mock builds a private
 * in-memory store (buildMock) per resource and routes a request to it by matching the request url's path
 * tail against these endpoints. `idField` (default `id`) is how add/edit/del find the row's key in the
 * request body (matching httpCrudRequest's del/edit body shape).
 */
export interface MockCrudResource {
  listUrl: string;
  addUrl?: string;
  editUrl?: string;
  delUrl?: string;
  /** seed rows for this resource's in-memory store. */
  seed: any[];
  /** primary-key field used to locate rows on edit/delete. Default `'id'`. */
  idField?: string;
}

/** The standard success envelope wrapper — mirrors the `{ code:0, msg, data }` contract the port unwraps. */
function envelope<T>(data: T): { code: number; msg: string; data: T } {
  return { code: 0, msg: 'ok', data };
}

/** Normalize a request url to its path tail (drop querystring) so baseURL prefixes don't defeat matching. */
function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}

/** Does this request's url end with the given endpoint path? (endpoint omitted ⇒ never matches.) */
function urlMatches(reqPath: string, endpoint?: string): boolean {
  if (!endpoint) return false;
  return reqPath.endsWith(endpoint);
}

interface RegisteredResource {
  res: MockCrudResource;
  service: MockService;
  idField: string;
}

export interface CreateMockHttpPortOptions {
  /** artificial latency per request in ms (makes spinners observable). Default 200. */
  delayMs?: number;
  /** CRUD resources to serve over the in-memory mock (T3.2). Omit for auth-only (the P2 behavior). */
  resources?: MockCrudResource[];
  /**
   * RESPONSE seam: invoked when the mock simulates an auth failure (the `DEBUG_UNAUTHORIZED_URL` path).
   * The app wires this to the SAME `onUnauthorized` it gives the axios port (→ dispatch logout), so the
   * dev 401 trigger drives the real logout flow. Mirrors `CreateAxiosHttpPortOptions.onUnauthorized`.
   * Omitted ⇒ the debug path still rejects, but no logout side effect fires.
   */
  onUnauthorized?: (ctx?: { config: HttpRequestConfig }) => void;
}

/**
 * Build the DEV mock `HttpPort`. Same `request<T>(config)` contract as the axios impl, so it drops into
 * the same injection seam (createSessionStore({ http }) and any createHttpCrudRequest(http, …)). A small
 * artificial delay makes loading states observable without being slow.
 *
 * @param opts.delayMs   artificial latency per request in ms (default 200).
 * @param opts.resources CRUD resources to serve (each gets its own in-memory buildMock store).
 */
export function createMockHttpPort(opts: CreateMockHttpPortOptions = {}): HttpPort {
  const delayMs = opts.delayMs ?? 200;
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

  // Build one in-memory store per resource up front (so data persists across requests for the session).
  const registered: RegisteredResource[] = (opts.resources ?? []).map((res) => ({
    res,
    service: buildMock(res.listUrl, res.seed),
    idField: res.idField ?? 'id',
  }));

  /** Try to answer a CRUD request from the registered resources. Returns the envelope, or `null` to skip. */
  async function tryCrud(path: string, config: HttpRequestConfig): Promise<unknown | null> {
    for (const r of registered) {
      const { res, service, idField } = r;
      const body = (config.data ?? {}) as Record<string, any>;
      const params = (config.params ?? {}) as Record<string, any>;

      if (urlMatches(path, res.listUrl)) {
        // the body (POST) or params (GET) is the transformed page query {page:{limit,offset},query,sort}.
        const listReq = (config.data ?? config.params ?? {}) as MockListReq;
        const pageRes = await service.GetList(listReq);
        return envelope(pageRes); // data = { records, total, limit, offset } → transformRes maps it.
      }
      if (urlMatches(path, res.addUrl)) {
        return envelope(await service.AddObj(body));
      }
      if (urlMatches(path, res.editUrl)) {
        return envelope(await service.UpdateObj(body));
      }
      if (urlMatches(path, res.delUrl)) {
        // httpCrudRequest sends the id in the body (default) or params; accept either.
        const id = body[idField] ?? params[idField];
        return envelope(await service.DelObj(id));
      }
    }
    return null;
  }

  const port: HttpPort = {
    async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
      await wait();
      const path = pathOf(config.url);

      // --- debug 401 (DEV verification trigger): simulate a backend auth failure. Play exactly what the
      // axios port does on a real 401 envelope/status — call onUnauthorized (app → logout), then reject —
      // so the dev "模拟 401" button drives the real 401→logout flow with no backend. Checked FIRST.
      if (path.endsWith(DEBUG_UNAUTHORIZED_URL)) {
        opts.onUnauthorized?.({ config });
        throw new Error('Unauthorized (mock /debug/401)');
      }

      // --- login: return a fake token + the profile inline (the auth effect sets both, publishes loggedIn).
      if (path.endsWith('/login')) {
        const res: LoginResponse = { token: `mock-jwt-${Date.now()}`, userInfo: MOCK_USER };
        return res as unknown as T;
      }

      // --- mine: the loadUserInfo fallback (when a backend returns no inline profile). Returns the user.
      if (path.endsWith('/mine')) {
        return MOCK_USER as unknown as T;
      }

      // --- permissions (T5.1): the codes the permission actor loads after login (chassis bridges
      // authenticated → loadPermissions). Returns the BARE codes array — the mock plays "backend + unwrap",
      // exactly as the axios port's envelope-unwrap would yield, so createPermissionEffects gets a flat list.
      // A real backend may return a permission TREE here; createPermissionEffects.flattenCodes handles both.
      if (path.endsWith('/permissions')) {
        return [...MOCK_PERMISSION_CODES] as unknown as T;
      }

      // --- crud resources (T3.2): route to the matching in-memory store, return the unwrapped data.
      const crud = await tryCrud(path, config);
      if (crud !== null) {
        // tryCrud returns the FULL envelope; resolve its `data` so request<T> yields the bare payload,
        // exactly as the axios port's unwrap would (the mock plays the role of "backend + unwrap").
        return (crud as { data: unknown }).data as T;
      }

      // --- everything else: no transport meaning in the demo → resolve empty (never reject).
      return undefined as unknown as T;
    },
    get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
      return port.request<T>({ url, method: 'get', params });
    },
    post<T = unknown>(url: string, data?: unknown): Promise<T> {
      return port.request<T>({ url, method: 'post', data });
    },
  };
  return port;
}
