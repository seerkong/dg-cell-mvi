/**
 * dg-cell-mvi-admin-template · views/product/resource — the example resource's transport descriptor + seed.
 *
 * Single source of truth shared by the two sides of the HttpPort seam so they agree on the SAME urls:
 *   - the page (views/product/crud.tsx) → `createHttpCrudRequest(http, PRODUCT_RESOURCE)` builds the crud
 *     request callbacks that POST to these urls through the chassis HttpPort;
 *   - the DEV mock (chassis/stores.ts) → registers `{ ...PRODUCT_RESOURCE, seed: PRODUCT_SEED }` so
 *     mockHttpPort answers those same urls from an in-memory store (in prod the real backend answers them).
 *
 * Keeping the urls in one module is what makes "mock vs real is just the injected port" true: neither side
 * hard-codes a divergent path. The seed is mock-only (a real backend owns the data).
 *
 * ── Adding YOUR OWN CRUD page: copy this folder (resource.ts + crud.tsx + index.vue), rename `product` →
 *    your entity, point the urls at your backend, register the resource in src/router/resources.ts, and
 *    (for the dev mock) register it in src/chassis/stores.ts. See the project README "Add a CRUD page".
 */
import type { HttpCrudResource } from '../../common/httpCrudRequest';

/** The example CRUD endpoints (resolved against the HttpPort's baseURL, e.g. `/api`). POST verbs by default. */
export const PRODUCT_RESOURCE: HttpCrudResource = {
  listUrl: '/product/page',
  addUrl: '/product/add',
  editUrl: '/product/update',
  delUrl: '/product/delete',
};

/** Mock-only seed for the in-memory store the DEV mockHttpPort serves these urls from. */
export const PRODUCT_SEED = Array.from({ length: 36 }, (_, i) => ({
  id: i + 1,
  name: 'Product ' + String(i + 1).padStart(2, '0'),
  category: i % 3 === 0 ? 'hardware' : i % 3 === 1 ? 'software' : 'service',
  price: (i + 1) * 10,
  status: i % 2 === 0 ? 'on' : 'off',
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 10:00:00',
}));
