/**
 * Unit tests for the crud↔HttpPort bridge (src/common/httpCrudRequest.ts) — T3.2.
 *
 * The bridge is framework-neutral and takes an INJECTED HttpPort, so we drive it with a FAKE port that
 * records every `request()` call and returns a canned envelope-unwrapped payload. We assert:
 *   - each crud callback hits the right url + verb and carries the right body/params;
 *   - pageRequest returns the raw page res UNTOUCHED (transformRes is commonCrudOptions' job, not the
 *     bridge's) — and a full round-trip through commonCrudOptions.transformQuery/transformRes preserves
 *     the limit/offset contract end-to-end via the bridge;
 *   - editRequest stamps the row id onto the form body; delRequest sends the id; verb/idField/delBy
 *     overrides are honored.
 *
 * No vue/element/DOM: the bridge imports only admin-contract TYPES (erased at runtime). commonOptions is
 * a plain object whose only import is `import type` from element-plus (also erased), so importing it here
 * is runtime-free.
 */
import { describe, it, expect, vi } from 'vitest';

import type { HttpPort, HttpRequestConfig } from 'dg-cell-mvi-admin-contract';

import { createHttpCrudRequest } from '../src/common/httpCrudRequest';
import commonOptions from '../src/common/commonCrudOptions';

/** A fake HttpPort that records calls and resolves a per-call canned value (defaults to `{}`). */
function makeFakeHttp(resolved: unknown = {}): {
  http: HttpPort;
  calls: HttpRequestConfig[];
} {
  const calls: HttpRequestConfig[] = [];
  const http: HttpPort = {
    request: vi.fn(async (config: HttpRequestConfig) => {
      calls.push(config);
      return resolved as never;
    }),
  };
  return { http, calls };
}

const RESOURCE = {
  listUrl: '/user/page',
  addUrl: '/user/add',
  editUrl: '/user/update',
  delUrl: '/user/delete',
};

describe('createHttpCrudRequest', () => {
  it('pageRequest POSTs the (already-transformed) query as the body to listUrl', async () => {
    const { http, calls } = makeFakeHttp({ records: [{ id: 1 }], total: 1, limit: 10, offset: 0 });
    const req = createHttpCrudRequest(http, RESOURCE);

    const query = { page: { limit: 10, offset: 0 }, query: { username: 'a' }, sort: {} };
    const res = await req.pageRequest(query);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/user/page', method: 'post', data: query });
    // params must NOT be set for a POST list (the body carries the query).
    expect(calls[0].params).toBeUndefined();
    // the bridge returns the port's unwrapped payload VERBATIM (no transform here).
    expect(res).toEqual({ records: [{ id: 1 }], total: 1, limit: 10, offset: 0 });
  });

  it('round-trips the limit/offset contract through commonCrudOptions transformQuery/transformRes', async () => {
    // page 2, size 10 → transformQuery → {page:{limit:10,offset:10},...}. The fake backend echoes a page
    // res; transformRes maps it back to {currentPage,pageSize,records,total}. The bridge is the only hop
    // between them, so a correct round-trip proves the bridge preserves the contract shape.
    const transformQuery = commonOptions.request!.transformQuery!;
    const transformRes = commonOptions.request!.transformRes!;

    const pageRes = { records: [{ id: 11 }, { id: 12 }], total: 56, limit: 10, offset: 10 };
    const { http, calls } = makeFakeHttp(pageRes);
    const req = createHttpCrudRequest(http, RESOURCE);

    const transformed = transformQuery({
      page: { currentPage: 2, pageSize: 10 },
      form: { role: '管理员' },
      sort: {},
    } as never);
    // transformQuery produced the backend's limit/offset request shape…
    expect(transformed).toMatchObject({ page: { limit: 10, offset: 10 }, query: { role: '管理员' } });

    const raw = await req.pageRequest(transformed);
    expect(calls[0].data).toEqual(transformed); // the bridge forwarded it verbatim as the body.

    const mapped = transformRes({ res: raw, query: transformed });
    expect(mapped).toEqual({ currentPage: 2, pageSize: 10, records: pageRes.records, total: 56 });
  });

  it('pageRequest uses params (not body) when listMethod is get', async () => {
    const { http, calls } = makeFakeHttp({ records: [], total: 0, limit: 10, offset: 0 });
    const req = createHttpCrudRequest(http, { ...RESOURCE, listMethod: 'get' });

    const query = { page: { limit: 10, offset: 0 }, query: {}, sort: {} };
    await req.pageRequest(query);

    expect(calls[0]).toMatchObject({ url: '/user/page', method: 'get', params: query });
    expect(calls[0].data).toBeUndefined();
  });

  it('addRequest POSTs the form to addUrl', async () => {
    const { http, calls } = makeFakeHttp({ id: 99 });
    const req = createHttpCrudRequest(http, RESOURCE);

    const form = { username: 'new', nickName: 'N' };
    const res = await req.addRequest({ form });

    expect(calls[0]).toMatchObject({ url: '/user/add', method: 'post', data: form });
    expect(res).toEqual({ id: 99 });
  });

  it('editRequest stamps the row id onto the form body and POSTs to editUrl', async () => {
    const { http, calls } = makeFakeHttp({ ok: true });
    const req = createHttpCrudRequest(http, RESOURCE);

    // form has no id; the row carries the key — the bridge must merge it in so the backend updates row 7.
    await req.editRequest({ form: { username: 'edited' }, row: { id: 7, username: 'old' } });

    expect(calls[0]).toMatchObject({
      url: '/user/update',
      method: 'post',
      data: { username: 'edited', id: 7 },
    });
  });

  it('delRequest sends the row id in the body (default delBy) to delUrl', async () => {
    const { http, calls } = makeFakeHttp(null);
    const req = createHttpCrudRequest(http, RESOURCE);

    await req.delRequest({ row: { id: 42 } });

    expect(calls[0]).toMatchObject({ url: '/user/delete', method: 'post', data: { id: 42 } });
    expect(calls[0].params).toBeUndefined();
  });

  it('honors idField + delBy:params + verb overrides', async () => {
    const { http, calls } = makeFakeHttp(null);
    const req = createHttpCrudRequest(http, {
      listUrl: '/r/list',
      editUrl: '/r/edit',
      delUrl: '/r/del',
      idField: 'uuid',
      delBy: 'params',
      editMethod: 'put',
      delMethod: 'delete',
    });

    await req.editRequest({ form: { name: 'x' }, row: { uuid: 'abc' } });
    expect(calls[0]).toMatchObject({ url: '/r/edit', method: 'put', data: { name: 'x', uuid: 'abc' } });

    await req.delRequest({ row: { uuid: 'abc' } });
    expect(calls[1]).toMatchObject({ url: '/r/del', method: 'delete', params: { uuid: 'abc' } });
    expect(calls[1].data).toBeUndefined();
  });

  it('rejects a write when its url is not configured (read-only resource)', async () => {
    const { http } = makeFakeHttp();
    const req = createHttpCrudRequest(http, { listUrl: '/ro/list' }); // no add/edit/del urls

    await expect(req.addRequest({ form: {} })).rejects.toThrow(/addUrl/);
    await expect(req.editRequest({ form: {}, row: { id: 1 } })).rejects.toThrow(/editUrl/);
    await expect(req.delRequest({ row: { id: 1 } })).rejects.toThrow(/delUrl/);
  });
});
