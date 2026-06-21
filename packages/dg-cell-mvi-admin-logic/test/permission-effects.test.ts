/**
 * admin.rbac · suite `perm` (P5·T5.1) — the permission actor's REMOTE-LOAD effect, exercised through the
 * store's closed feedback loop with an INJECTED HttpPort (DEPA Effect 维: fn(runtime,input,config)).
 *
 * Validation strategy (behavior_deltas/admin.rbac/delta.xml `permission-model`: loadFromRemote/持有/clear):
 *   - inject a FAKE HttpPort (a stub implementing the contract `HttpPort` — records the request, returns
 *     canned codes). Neither axios nor a real backend is touched — logic depends only on the interface.
 *   - dispatch loadPermissions() → http received the codes request → codes land in permission state AND
 *     the cross-actor `permissionLoaded` message is published (the回流 the effect returns).
 *   - FAILURE path → http rejects → codes are NOT mutated (a failed load never blanks the menu).
 *   - the response is NORMALIZED: a flat string[] OR a permission TREE both yield the flat codes[].
 *   - no port → pure state machine (the emitted load request is dropped by the no-op runner).
 *
 * Effects are async (the runner awaits handlers then re-dispatches); a microtask flush settles the loop.
 */
import { describe, it, expect } from 'vitest';

import { createPermissionStore, createPermissionEffects } from '../src/index';
import {
  loadPermissions,
  setCodes,
  clearCodes,
  PERMISSION_EVENT,
  PERMISSION_EFFECT,
  DOMAIN_MESSAGE,
  loadPermissionsEffect,
  createInitialPermissionState,
} from 'dg-cell-mvi-admin-contract';
import type { HttpPort, HttpRequestConfig } from 'dg-cell-mvi-admin-contract';
import type { EffectRuntime } from 'dg-cell-mvi-core';
import type { PermissionState } from 'dg-cell-mvi-admin-contract';

// a microtask flush: the effect loop is async (handler → re-dispatch → handler). A few awaited ticks settle.
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

// a fake HttpPort: records every request; resolves the codes from a canned value, or rejects. ---
function createFakeHttp(opts: { codes?: unknown; reject?: boolean }) {
  const requests: HttpRequestConfig[] = [];
  const port: HttpPort = {
    async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
      requests.push(config);
      if (opts.reject) throw new Error('codes load failed');
      return (opts.codes ?? []) as unknown as T;
    },
  };
  return { port, requests };
}

describe('admin.rbac · permission load effect (loadFromRemote → codes + permissionLoaded)', () => {
  // ===========================================================================
  // delta `permission-model`: loadFromRemote → 持有 codes
  // ===========================================================================
  it('loadPermissions: http gets the codes request, codes land in state', async () => {
    const http = createFakeHttp({ codes: ['user:view', 'role:view'] });
    const store = createPermissionStore({ http: http.port });

    // before the load resolves the actor is NOT loaded — this is the flag the guard reads to avoid误跳 /403
    // during the async window (load-race fix). codes === [] here is "not loaded yet", not "holds nothing".
    expect(store.state().loaded).toBe(false);

    store.dispatch(loadPermissions());
    await flush();

    // (a) http received the codes request (default endpoint + post method).
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0].url).toContain('permissions');
    expect(http.requests[0].method).toBe('post');

    // (b) the codes folded into permission state (the setCodes回流).
    expect(store.state().codes).toEqual(['user:view', 'role:view']);
    expect(store.viewModel().codes).toEqual(['user:view', 'role:view']);
    // (c) the load RESOLVED → loaded flips true: the guard may now enforce meta.permission for real.
    expect(store.state().loaded).toBe(true);
    expect(store.viewModel().loaded).toBe(true);
  });

  it('custom codesUrl/codesMethod config is honored', async () => {
    const http = createFakeHttp({ codes: ['a'] });
    const store = createPermissionStore({
      http: http.port,
      config: { codesUrl: '/my/perms', codesMethod: 'get' },
    });
    store.dispatch(loadPermissions());
    await flush();
    expect(http.requests[0].url).toBe('/my/perms');
    expect(http.requests[0].method).toBe('get');
    expect(store.state().codes).toEqual(['a']);
  });

  // ===========================================================================
  // the cross-actor message: permissionLoaded is published on success (effect回流)
  // ===========================================================================
  it('the handler回流s BOTH setCodes (fact write) AND permissionLoaded (cross-actor message)', async () => {
    // assert the effect handler's RETURN directly — the two events it feeds back into the loop.
    const http = createFakeHttp({ codes: ['user:view'] });
    const effects = createPermissionEffects({ http: http.port });
    // the effects map is keyed by the effect-REQUEST type (`permission/load`), not the command type.
    const handler = effects[PERMISSION_EFFECT.loadPermissions];
    expect(handler).toBeDefined();

    const ctx = {
      event: loadPermissions(),
      state: createInitialPermissionState(),
      dispatch: () => {},
    } as unknown as EffectRuntime<PermissionState>;
    const result = await handler(ctx, loadPermissionsEffect());

    expect(Array.isArray(result)).toBe(true);
    const events = result as ReturnType<typeof setCodes>[];
    // [0] = setCodes (writes the fact), [1] = permissionLoaded (announces it across actors).
    expect(events[0].type).toBe(PERMISSION_EVENT.setCodes);
    expect(events[0].payload).toEqual({ codes: ['user:view'] });
    expect(events[1].type).toBe(DOMAIN_MESSAGE.permissionLoaded);
    expect(events[1].payload).toEqual({ codes: ['user:view'] });
  });

  // ===========================================================================
  // response NORMALIZATION: flat array OR a permission/resource tree → flat codes[]
  // ===========================================================================
  it('normalizes a flat string[] (deduped, blanks dropped)', async () => {
    const http = createFakeHttp({ codes: ['a', 'a', '', 'b', null] });
    const store = createPermissionStore({ http: http.port });
    store.dispatch(loadPermissions());
    await flush();
    expect(store.state().codes).toEqual(['a', 'b']); // dupes + empty + null removed
  });

  it('flattens a permission TREE by collecting every node.permission recursively (ref formatPermissions)', async () => {
    const tree = [
      { permission: 'sys:view', children: [{ permission: 'user:view' }, { permission: 'role:view' }] },
      { permission: 'biz:view', children: [] },
      { title: 'no-code-node', children: [{ permission: 'deep:view' }] }, // node without its own code
    ];
    const http = createFakeHttp({ codes: tree });
    const store = createPermissionStore({ http: http.port });
    store.dispatch(loadPermissions());
    await flush();
    expect(store.state().codes).toEqual(['sys:view', 'user:view', 'role:view', 'biz:view', 'deep:view']);
  });

  it('a null/garbage response yields [] (safe empty, no throw)', async () => {
    const http = createFakeHttp({ codes: null });
    const store = createPermissionStore({ http: http.port });
    store.dispatch(loadPermissions());
    await flush();
    expect(store.state().codes).toEqual([]);
  });

  // ===========================================================================
  // FAILURE path (delta rule: a failed load must NOT blank the menu → codes untouched)
  // ===========================================================================
  it('load failure: http rejects → codes are left untouched (no回流, menu not blanked)', async () => {
    const http = createFakeHttp({ reject: true });
    const store = createPermissionStore({ http: http.port });

    // seed some existing codes first (a prior successful load), then a failing re-load.
    store.dispatch(setCodes(['existing:code']));
    expect(store.state().codes).toEqual(['existing:code']);

    store.dispatch(loadPermissions());
    await flush();

    // the failing load did NOT wipe or change the codes — they stand.
    expect(store.state().codes).toEqual(['existing:code']);
  });

  // ===========================================================================
  // clear (delta: clear on logout — the chassis dispatches this when authenticated→false)
  // ===========================================================================
  it('clearCodes empties the fact (the logout half of the chassis coordination)', async () => {
    const http = createFakeHttp({ codes: ['user:view'] });
    const store = createPermissionStore({ http: http.port });
    store.dispatch(loadPermissions());
    await flush();
    expect(store.state().codes).toEqual(['user:view']);
    expect(store.state().loaded).toBe(true);

    store.dispatch(clearCodes());
    expect(store.state().codes).toEqual([]);
    // logout re-arms the load-race gate: loaded back to false so the next login does not gate on stale state.
    expect(store.state().loaded).toBe(false);
  });

  // ===========================================================================
  // purity / degradation: no port → pure state machine (P1 behavior preserved)
  // ===========================================================================
  it('no port → pure state machine: setCodes still works, the emitted load request is dropped', () => {
    const store = createPermissionStore(); // no http/effects
    store.dispatch(setCodes(['manual:code']));
    expect(store.state().codes).toEqual(['manual:code']);
    // dispatching the load command does not throw (the effect request is dropped by the no-op runner).
    expect(() => store.dispatch(loadPermissions())).not.toThrow();
    expect(store.state().codes).toEqual(['manual:code']); // unchanged (no transport to load from)
  });
});
