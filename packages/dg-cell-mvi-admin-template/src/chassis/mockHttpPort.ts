/**
 * dg-cell-mvi-admin-template · chassis/mockHttpPort — a DEV-only in-process HttpPort impl.
 *
 * DEPA Effect 维: the auth flow's AND the crud data flow's only IO surface is the injected `HttpPort`. To
 * run BOTH end-to-end WITHOUT a backend, we swap the *port implementation* (this mock) rather than touching
 * any logic — admin-logic/admin-support and the crud package stay pure. This mock lives in the APP layer
 * (the 消费方/装配根) where the concrete port is chosen.
 *
 * What it answers:
 *   - POST `/login`                       → `{ token, userInfo }` (token = a fake JWT; any credentials pass).
 *   - GET/POST `…/mine`                   → the same `userInfo` (the loadUserInfo fallback path).
 *   - GET `…/permissions`                 → the demo permission codes (drives menu/route/button gating).
 *   - the registered CRUD resources       → list/add/edit/del over a per-resource in-memory store,
 *                                           wrapped in the `{ code:0, data }` envelope so the axios-style
 *                                           unwrap contract holds identically under the mock.
 *   - `…/debug/401`                       → simulate a backend 401 (drives the 401→logout flow in dev).
 *   - anything else                       → resolves `undefined` (never rejects).
 *
 * mock vs real is decided purely by which impl chassis/stores.ts injects (DEV → this; else axios). When you
 * point the app at a real backend (VITE_APP_MOCK=false), delete this file + the mock branch in stores.ts.
 */
import type { HttpPort, HttpRequestConfig, LoginResponse, UserInfo } from 'dg-cell-mvi-admin-contract';

import { buildMock, type MockListReq, type MockService } from '../api/mockService';

/** DEV-only path that simulates a backend 401 so the 401→logout flow is observable without a server. */
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
 * The canned permission codes the mock returns from the `permissions` endpoint. A DELIBERATELY PARTIAL set
 * so the RBAC wiring is observable out of the box:
 *   - `product:view` / `product:add` / `product:edit` → granted (商品管理 menu shows; add+edit buttons show).
 *   - `product:remove` → WITHHELD → the product page's row DELETE button is hidden after login.
 * Add `product:remove` to watch the delete button appear; gate a new page on a code you DON'T list here to
 * watch the menu filter it out + a direct visit redirect to /403.
 */
const MOCK_PERMISSION_CODES: string[] = ['product:view', 'product:add', 'product:edit'];

/**
 * One CRUD resource served by the mock: its URL endpoints + a seed dataset. The mock builds a private
 * in-memory store (buildMock) per resource and routes a request to it by matching the request url's path
 * tail against these endpoints. `idField` (default `id`) is how add/edit/del find the row's key.
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
  /** CRUD resources to serve over the in-memory mock. */
  resources?: MockCrudResource[];
  /**
   * RESPONSE seam: invoked when the mock simulates an auth failure (the `DEBUG_UNAUTHORIZED_URL` path).
   * The app wires this to the SAME `onUnauthorized` it gives the axios port (→ dispatch logout).
   */
  onUnauthorized?: (ctx?: { config: HttpRequestConfig }) => void;
}

/**
 * Build the DEV mock `HttpPort`. Same `request<T>(config)` contract as the axios impl, so it drops into the
 * same injection seam (createSessionStore({ http }) and any createHttpCrudRequest(http, …)).
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

      // --- debug 401 (DEV verification trigger): call onUnauthorized (app → logout), then reject. ---
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

      // --- permissions: the codes the permission actor loads after login (chassis bridges authenticated →
      //     loadPermissions). Returns the BARE codes array (the mock plays "backend + unwrap").
      if (path.endsWith('/permissions')) {
        return [...MOCK_PERMISSION_CODES] as unknown as T;
      }

      // --- crud resources: route to the matching in-memory store, return the unwrapped data.
      const crud = await tryCrud(path, config);
      if (crud !== null) {
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
