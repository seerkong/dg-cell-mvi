import { describe, it, expect, vi } from 'vitest';
import type { AxiosInstance } from 'axios';

import { createAxiosHttpPort } from '../src/http/axiosHttpPort';

/**
 * A minimal fake axios instance: records the last config passed to `request`, exposes a mutable
 * `defaults`, and resolves to a canned `{ data }` envelope — enough to exercise the port offline
 * (no network). Cast through `unknown` to `AxiosInstance` since we only implement the slice the port
 * touches (`request` + `defaults`).
 */
function makeFakeAxios(responseData: unknown) {
  const calls: any[] = [];
  const fake = {
    defaults: {} as Record<string, unknown>,
    request: (config: any) => {
      calls.push(config);
      return Promise.resolve({ data: responseData });
    },
  };
  return { fake: fake as unknown as AxiosInstance, calls };
}

/**
 * A fake axios instance whose `request` REJECTS with an axios-shaped error (`error.response.status`)
 * — used to exercise the HTTP-level 401 path (vs the envelope business-code path).
 */
function makeFailingAxios(status: number) {
  const calls: any[] = [];
  const fake = {
    defaults: {} as Record<string, unknown>,
    request: (config: any) => {
      calls.push(config);
      const err = Object.assign(new Error(`HTTP ${status}`), { response: { status } });
      return Promise.reject(err);
    },
  };
  return { fake: fake as unknown as AxiosInstance, calls };
}

describe('axiosHttpPort', () => {
  it('passes the request config through to the injected instance and returns response.data', async () => {
    const { fake, calls } = makeFakeAxios({ ok: true });
    const port = createAxiosHttpPort({ instance: fake });

    const result = await port.request<{ ok: boolean }>({
      url: '/users',
      method: 'get',
      params: { page: 1 },
    });

    expect(result).toEqual({ ok: true }); // .data is unwrapped
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/users', method: 'get', params: { page: 1 } });
  });

  it('applies the injected baseURL to the instance defaults', async () => {
    const { fake } = makeFakeAxios({});
    createAxiosHttpPort({ instance: fake, baseURL: 'https://api.example.com' });
    expect((fake.defaults as Record<string, unknown>).baseURL).toBe('https://api.example.com');
  });

  it('falls back to the env API base when no baseURL is given', async () => {
    // env.getApiBase() default is '/api' when VITE_APP_API is unset.
    const { fake } = makeFakeAxios({});
    createAxiosHttpPort({ instance: fake });
    expect((fake.defaults as Record<string, unknown>).baseURL).toBe('/api');
  });

  it('does not clobber a baseURL already set on an injected instance', async () => {
    const { fake } = makeFakeAxios({});
    (fake.defaults as Record<string, unknown>).baseURL = '/preset';
    createAxiosHttpPort({ instance: fake, baseURL: '/ignored' });
    expect((fake.defaults as Record<string, unknown>).baseURL).toBe('/preset');
  });

  it('get() and post() sugar delegate to request() with the right method/payload', async () => {
    const { fake, calls } = makeFakeAxios({ id: 7 });
    const port = createAxiosHttpPort({ instance: fake });

    await port.get!<{ id: number }>('/item', { q: 'x' });
    await port.post!<{ id: number }>('/item', { name: 'new' });

    expect(calls[0]).toMatchObject({ url: '/item', method: 'get', params: { q: 'x' } });
    expect(calls[1]).toMatchObject({ url: '/item', method: 'post', data: { name: 'new' } });
  });

  it('rejects when the underlying instance rejects (errors propagate to the effect handler)', async () => {
    const failing = {
      defaults: {} as Record<string, unknown>,
      request: () => Promise.reject(new Error('network down')),
    } as unknown as AxiosInstance;
    const port = createAxiosHttpPort({ instance: failing });
    await expect(port.request({ url: '/x' })).rejects.toThrow('network down');
  });
});

// ---------------------------------------------------------------------------
// P3 (T3.1): request auth-header injection, envelope unwrap, 401 → onUnauthorized callback.
// admin-support stays framework-neutral — token + logout arrive as injected callbacks; these tests
// verify the wrapper applies them deterministically against the offline fake instance.
// ---------------------------------------------------------------------------

describe('axiosHttpPort · auth header (getAuthToken)', () => {
  it('adds the Authorization header when getAuthToken returns a token', async () => {
    const { fake, calls } = makeFakeAxios({ code: 0, data: {} });
    const port = createAxiosHttpPort({ instance: fake, getAuthToken: () => 'tok-123' });
    await port.request({ url: '/me' });
    expect(calls[0].headers).toMatchObject({ Authorization: 'tok-123' });
  });

  it('omits the auth header when getAuthToken returns null/undefined/empty', async () => {
    for (const t of [null, undefined, ''] as const) {
      const { fake, calls } = makeFakeAxios({ code: 0, data: {} });
      const port = createAxiosHttpPort({ instance: fake, getAuthToken: () => t });
      await port.request({ url: '/me' });
      const headers = (calls[0].headers ?? {}) as Record<string, unknown>;
      expect(headers.Authorization).toBeUndefined();
    }
  });

  it('reads the token per request (token set after construction is still picked up)', async () => {
    let token: string | null = null;
    const { fake, calls } = makeFakeAxios({ code: 0, data: {} });
    const port = createAxiosHttpPort({ instance: fake, getAuthToken: () => token });
    await port.request({ url: '/a' }); // no token yet
    token = 'late-tok';
    await port.request({ url: '/b' }); // token now present
    expect((calls[0].headers ?? {}).Authorization).toBeUndefined();
    expect(calls[1].headers).toMatchObject({ Authorization: 'late-tok' });
  });

  it('supports a Bearer scheme and a custom header name', async () => {
    const { fake, calls } = makeFakeAxios({ code: 0, data: {} });
    const port = createAxiosHttpPort({
      instance: fake,
      getAuthToken: () => 'abc',
      authScheme: 'Bearer',
      authHeaderName: 'X-Token',
    });
    await port.request({ url: '/me' });
    expect(calls[0].headers).toMatchObject({ 'X-Token': 'Bearer abc' });
  });

  it('merges the auth header with per-request headers (does not clobber them)', async () => {
    const { fake, calls } = makeFakeAxios({ code: 0, data: {} });
    const port = createAxiosHttpPort({ instance: fake, getAuthToken: () => 'tok' });
    await port.request({ url: '/me', headers: { 'X-Trace': 'zzz' } });
    expect(calls[0].headers).toMatchObject({ Authorization: 'tok', 'X-Trace': 'zzz' });
  });
});

describe('axiosHttpPort · envelope unwrap', () => {
  it('unwraps { code: 0, data } to data by default', async () => {
    const { fake } = makeFakeAxios({ code: 0, msg: 'ok', data: { id: 5, name: 'row' } });
    const port = createAxiosHttpPort({ instance: fake });
    const result = await port.request<{ id: number; name: string }>({ url: '/item/5' });
    expect(result).toEqual({ id: 5, name: 'row' });
  });

  it('rejects with the server msg on a business-failure code', async () => {
    const { fake } = makeFakeAxios({ code: 1001, msg: 'name taken', data: null });
    const port = createAxiosHttpPort({ instance: fake });
    await expect(port.request({ url: '/item', method: 'post' })).rejects.toThrow('name taken');
  });

  it('returns the raw envelope when per-request config.unwrap === false', async () => {
    const envelope = { code: 0, msg: 'ok', data: { id: 9 } };
    const { fake } = makeFakeAxios(envelope);
    const port = createAxiosHttpPort({ instance: fake });
    const result = await port.request({ url: '/item/9', unwrap: false });
    expect(result).toEqual(envelope); // full { code, msg, data }, not just data
  });

  it('returns the raw body when the port is built with unwrap: false', async () => {
    const envelope = { code: 0, data: { id: 1 } };
    const { fake } = makeFakeAxios(envelope);
    const port = createAxiosHttpPort({ instance: fake, unwrap: false });
    expect(await port.request({ url: '/x' })).toEqual(envelope);
  });

  it('supports a custom unwrap function', async () => {
    const { fake } = makeFakeAxios({ code: 0, data: { id: 2 }, extra: 'kept' });
    const port = createAxiosHttpPort({
      instance: fake,
      unwrap: (env: any) => ({ ...env.data, extra: env.extra }),
    });
    expect(await port.request({ url: '/x' })).toEqual({ id: 2, extra: 'kept' });
  });

  it('passes a non-envelope body through untouched (no code key)', async () => {
    const { fake } = makeFakeAxios([{ a: 1 }, { a: 2 }]); // a bare array, no { code }
    const port = createAxiosHttpPort({ instance: fake });
    expect(await port.request({ url: '/list' })).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('honors configurable envelope keys + success code', async () => {
    const { fake } = makeFakeAxios({ status: 200, message: 'fine', result: { ok: true } });
    const port = createAxiosHttpPort({
      instance: fake,
      envelope: { codeKey: 'status', dataKey: 'result', msgKey: 'message', successCode: 200 },
    });
    expect(await port.request({ url: '/x' })).toEqual({ ok: true });
  });
});

describe('axiosHttpPort · 401 → onUnauthorized', () => {
  it('calls onUnauthorized and rejects on an HTTP 401', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFailingAxios(401);
    const port = createAxiosHttpPort({ instance: fake, onUnauthorized });
    await expect(port.request({ url: '/secure' })).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onUnauthorized for a non-401 HTTP error', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFailingAxios(500);
    const port = createAxiosHttpPort({ instance: fake, onUnauthorized });
    await expect(port.request({ url: '/x' })).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('calls onUnauthorized and rejects on the unauthorized business code (401 in envelope)', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFakeAxios({ code: 401, msg: 'token expired', data: null });
    const port = createAxiosHttpPort({ instance: fake, onUnauthorized });
    await expect(port.request({ url: '/me' })).rejects.toThrow('token expired');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('detects an auth-code 401 even when the request opts out of unwrapping', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFakeAxios({ code: 401, msg: 'expired', data: null });
    const port = createAxiosHttpPort({ instance: fake, onUnauthorized });
    await expect(port.request({ url: '/me', unwrap: false })).rejects.toThrow('expired');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('supports configurable unauthorizedCodes (custom auth-failure code)', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFakeAxios({ code: 40100, msg: 'session gone', data: null });
    const port = createAxiosHttpPort({
      instance: fake,
      onUnauthorized,
      envelope: { unauthorizedCodes: [40100] },
    });
    await expect(port.request({ url: '/me' })).rejects.toThrow('session gone');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('passes the failing request config to onUnauthorized (app can inspect/route on it)', async () => {
    const onUnauthorized = vi.fn();
    const { fake } = makeFakeAxios({ code: 401, msg: 'no', data: null });
    const port = createAxiosHttpPort({ instance: fake, onUnauthorized });
    await expect(port.request({ url: '/secure', method: 'get' })).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledWith({ config: expect.objectContaining({ url: '/secure' }) });
  });
});
