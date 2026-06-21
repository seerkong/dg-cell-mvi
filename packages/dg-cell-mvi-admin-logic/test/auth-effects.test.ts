/**
 * admin.auth · suite `auth` (P2·T2.1) — the session actor's auth EFFECTS, exercised end-to-end through
 * the store's closed feedback loop with INJECTED ports (DEPA Effect 维: fn(runtime,input,config)).
 *
 * Validation strategy (behavior_deltas/admin.auth/delta.xml case `login` / `logout` + the failure rule):
 *   - inject a FAKE HttpPort (a stub implementing the contract `HttpPort` — records the request, returns
 *     a canned {token,userInfo}) + an in-memory StoragePort (a Map behind the contract `StoragePort`).
 *     Neither axios nor localStorage is touched — logic depends only on the port interfaces.
 *   - login(creds)  → http received the login request → token + userInfo land in session state → the
 *     token is persisted to storage. (delta case `login`)
 *   - logout()      → session state cleared + storage.remove was called. (delta case `logout`)
 *   - loadUserInfo()→ userInfo updated from the `mine` call.
 *   - hydrate       → a pre-seeded storage token surfaces as session.token on a freshly-created store.
 *   - FAILURE path  → http rejects → token is NOT mutated (status=error, error recorded). (delta rule)
 *
 * Effects are async (the runner awaits handlers then re-dispatches); a microtask flush settles the loop.
 */
import { describe, it, expect, vi } from 'vitest';

import { createSessionStore } from '../src/index';
import { login, logout, loadUserInfo, setToken } from 'dg-cell-mvi-admin-contract';
import type {
  HttpPort,
  HttpRequestConfig,
  StoragePort,
  LoginResponse,
  UserInfo,
} from 'dg-cell-mvi-admin-contract';

// --- a microtask flush: the effect loop is async (handler → re-dispatch → handler …). A few awaited
//     ticks settle the chains we test (login → setToken → persist; login → loadUserInfo → setUserInfo).
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

// --- in-memory StoragePort (the contract value-typed seam; a Map, no localStorage). Spied so we can
//     assert remove() was called and inspect what got persisted. ---
function createTestStorage(seed: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(seed));
  const port: StoragePort = {
    get: <T = unknown>(key: string): T | null => (map.has(key) ? (map.get(key) as T) : null),
    set: (key: string, value: unknown) => {
      map.set(key, value);
    },
    remove: (key: string) => {
      map.delete(key);
    },
  };
  return {
    port,
    map,
    setSpy: vi.spyOn(port, 'set'),
    removeSpy: vi.spyOn(port, 'remove'),
  };
}

// --- a fake HttpPort: records every request; resolves login/mine from a canned table, or rejects. ---
function createFakeHttp(opts: {
  loginRes?: LoginResponse;
  mineRes?: UserInfo;
  reject?: boolean;
}) {
  const requests: HttpRequestConfig[] = [];
  const port: HttpPort = {
    async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
      requests.push(config);
      if (opts.reject) throw new Error('invalid credentials');
      if (config.url.includes('login')) return (opts.loginRes ?? { token: '' }) as unknown as T;
      // anything else = the `mine` profile call.
      return (opts.mineRes ?? null) as unknown as T;
    },
  };
  return { port, requests };
}

const KEY = 'admin:token';

describe('admin.auth · auth effects (login/logout/loadUserInfo/persist/hydrate)', () => {
  // ===========================================================================
  // delta case `login`
  // ===========================================================================
  it('login: http gets the login request, token+userInfo land in state, token is persisted', async () => {
    const http = createFakeHttp({
      loginRes: { token: 'jwt-abc', userInfo: { id: 1, username: 'alice' } },
    });
    const storage = createTestStorage();
    const store = createSessionStore({ http: http.port, storage: storage.port, persistKey: KEY });

    store.dispatch(login({ username: 'alice', password: 'pw' }));
    // command is synchronous: status flips to authenticating + loading before any IO resolves.
    expect(store.state().status).toBe('authenticating');
    expect(store.state().loading).toBe(true);

    await flush();

    // (a) http received the login request with the credentials as the body.
    const loginReq = http.requests.find((r) => r.url.includes('login'));
    expect(loginReq).toBeDefined();
    expect(loginReq?.method).toBe('post');
    expect(loginReq?.data).toEqual({ username: 'alice', password: 'pw' });

    // (b) token + userInfo (inline in the login response) folded into session state.
    expect(store.state().token).toBe('jwt-abc');
    expect(store.state().userInfo).toEqual({ id: 1, username: 'alice' });
    expect(store.state().status).toBe('authenticated');
    expect(store.state().loading).toBe(false);
    expect(store.viewModel().authenticated).toBe(true);

    // (c) the token was persisted to storage (the shadow).
    expect(storage.setSpy).toHaveBeenCalledWith(KEY, 'jwt-abc');
    expect(storage.port.get(KEY)).toBe('jwt-abc');
  });

  it('login: when the response omits userInfo, the `mine` call loads the profile', async () => {
    const http = createFakeHttp({
      loginRes: { token: 'jwt-xyz' }, // no inline userInfo
      mineRes: { id: 9, username: 'bob', nickname: 'Bob' },
    });
    const storage = createTestStorage();
    const store = createSessionStore({ http: http.port, storage: storage.port, persistKey: KEY });

    store.dispatch(login({ username: 'bob', password: 'pw' }));
    await flush();

    // both the login AND the follow-up mine call happened.
    expect(http.requests.some((r) => r.url.includes('login'))).toBe(true);
    expect(http.requests.some((r) => r.url.includes('mine'))).toBe(true);
    expect(store.state().token).toBe('jwt-xyz');
    expect(store.state().userInfo).toEqual({ id: 9, username: 'bob', nickname: 'Bob' });
  });

  // ===========================================================================
  // delta case `logout`
  // ===========================================================================
  it('logout: session state is cleared and the token shadow is removed', async () => {
    const http = createFakeHttp({ loginRes: { token: 'jwt-abc', userInfo: { id: 1 } } });
    const storage = createTestStorage();
    const store = createSessionStore({ http: http.port, storage: storage.port, persistKey: KEY });

    // arrive logged-in.
    store.dispatch(login({ username: 'alice', password: 'pw' }));
    await flush();
    expect(store.state().token).toBe('jwt-abc');
    storage.removeSpy.mockClear();

    store.dispatch(logout());
    await flush();

    // state cleared back to anonymous.
    expect(store.state().token).toBe('');
    expect(store.state().userInfo).toBeNull();
    expect(store.state().status).toBe('anonymous');
    expect(store.viewModel().authenticated).toBe(false);
    // storage.remove was called for the token key (persistence cleared).
    expect(storage.removeSpy).toHaveBeenCalledWith(KEY);
    expect(storage.port.get(KEY)).toBeNull();
  });

  // ===========================================================================
  // loadUserInfo
  // ===========================================================================
  it('loadUserInfo: userInfo is updated from the mine call', async () => {
    const http = createFakeHttp({ mineRes: { id: 5, username: 'carol' } });
    const store = createSessionStore({ http: http.port, storage: createTestStorage().port, persistKey: KEY });

    store.dispatch(loadUserInfo());
    await flush();

    expect(http.requests.some((r) => r.url.includes('mine'))).toBe(true);
    expect(store.state().userInfo).toEqual({ id: 5, username: 'carol' });
    expect(store.state().loading).toBe(false);
  });

  // ===========================================================================
  // hydrate (init): a pre-seeded storage token surfaces on store creation
  // ===========================================================================
  it('hydrate: a token already in storage seeds session.token on a new store', async () => {
    const http = createFakeHttp({});
    const storage = createTestStorage({ [KEY]: 'persisted-jwt' });
    const store = createSessionStore({ http: http.port, storage: storage.port, persistKey: KEY });

    // creation dispatched hydrate(); the hydrate effect read storage and re-dispatched setToken.
    await flush();
    expect(store.state().token).toBe('persisted-jwt');
    expect(store.viewModel().authenticated).toBe(true);
  });

  it('hydrate: no token in storage leaves the store anonymous', async () => {
    const storage = createTestStorage(); // empty
    const store = createSessionStore({ storage: storage.port, persistKey: KEY });
    await flush();
    expect(store.state().token).toBe('');
    expect(store.state().status).toBe('anonymous');
  });

  // ===========================================================================
  // FAILURE path (delta rule: a failed login must NOT mutate the token)
  // ===========================================================================
  it('login failure: http rejects → token untouched, status=error, error recorded', async () => {
    const http = createFakeHttp({ reject: true });
    const storage = createTestStorage();
    const store = createSessionStore({ http: http.port, storage: storage.port, persistKey: KEY });

    store.dispatch(login({ username: 'alice', password: 'wrong' }));
    await flush();

    expect(store.state().token).toBe(''); // NOT mutated
    expect(store.state().userInfo).toBeNull();
    expect(store.state().status).toBe('error');
    expect(store.state().error).toBe('invalid credentials');
    expect(store.state().loading).toBe(false);
    expect(store.viewModel().authenticated).toBe(false);
    // nothing was persisted (no token write happened).
    expect(storage.port.get(KEY)).toBeNull();
  });

  it('login failure then a successful retry recovers (error cleared, token set)', async () => {
    // a port that rejects the first call, succeeds after.
    let calls = 0;
    const port: HttpPort = {
      async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
        if (config.url.includes('login')) {
          calls += 1;
          if (calls === 1) throw new Error('bad');
          return { token: 'jwt-2', userInfo: { id: 1 } } as unknown as T;
        }
        return null as unknown as T;
      },
    };
    const store = createSessionStore({ http: port, storage: createTestStorage().port, persistKey: KEY });

    store.dispatch(login({ username: 'a', password: 'x' }));
    await flush();
    expect(store.state().status).toBe('error');

    store.dispatch(login({ username: 'a', password: 'right' }));
    // retry command clears the error synchronously (status back to authenticating).
    expect(store.state().error).toBe('');
    expect(store.state().status).toBe('authenticating');
    await flush();
    expect(store.state().token).toBe('jwt-2');
    expect(store.state().status).toBe('authenticated');
  });

  // ===========================================================================
  // purity / degradation: no ports → pure state machine (P1 behavior preserved)
  // ===========================================================================
  it('no ports → pure state machine: direct fact writes still work, emitted effects are dropped', () => {
    const store = createSessionStore(); // no http/storage/effects
    store.dispatch(setToken('manual'));
    expect(store.state().token).toBe('manual');
    expect(store.state().status).toBe('authenticated');
    // dispatching an auth command does not throw (effect requests are dropped by the no-op runner).
    expect(() => store.dispatch(login({ username: 'a', password: 'b' }))).not.toThrow();
  });
});
