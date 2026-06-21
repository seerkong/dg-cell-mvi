/**
 * dg-cell-mvi-admin-element-plus · views/user/resource — the user resource's transport descriptor + seed.
 *
 * Single source of truth shared by the two sides of the HttpPort seam so they agree on the SAME urls:
 *   - the page (views/user/crud.tsx) → `createHttpCrudRequest(http, USER_RESOURCE)` builds the crud
 *     request callbacks that POST to these urls through the chassis HttpPort;
 *   - the DEV mock (chassis/stores.ts) → registers `{ ...USER_RESOURCE, seed: USER_SEED }` so mockHttpPort
 *     answers those same urls from an in-memory store (in prod the real backend answers them via axios).
 *
 * Keeping the urls in one module is what makes "mock vs real is just the injected port" true: neither side
 * hard-codes a divergent path. The seed is mock-only (the real backend owns the data); it lives here next
 * to the urls purely so the user resource is described in one place.
 */
import type { HttpCrudResource } from '../../common/httpCrudRequest';

/** The user CRUD endpoints (resolved against the HttpPort's baseURL, e.g. `/api`). POST verbs by default. */
export const USER_RESOURCE: HttpCrudResource = {
  listUrl: '/user/page',
  addUrl: '/user/add',
  editUrl: '/user/update',
  delUrl: '/user/delete',
};

/** Mock-only seed for the in-memory store the DEV mockHttpPort serves these urls from (56 rows). */
export const USER_SEED = Array.from({ length: 56 }, (_, i) => ({
  id: i + 1,
  username: 'user' + String(i + 1).padStart(2, '0'),
  nickName: '用户' + (i + 1),
  role: i % 3 === 0 ? '管理员' : i % 3 === 1 ? '编辑' : '访客',
  status: i % 2 === 0 ? '启用' : '禁用',
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 10:00:00',
}));
