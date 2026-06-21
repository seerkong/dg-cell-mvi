/**
 * admin.shell-state · suite `chassis-assembly` — the DEPA layered end-to-end assembly proof, HEADLESS
 * (add-admin-chassis P1·T1.4 / AC1).
 *
 * This is the NON-DOM half of the T1.4 proof: that the chassis assembly chain stands up and responds
 * to commands WITHOUT any browser/Vue/Element. (The DOM half — `useAdminStore` → Element render → click
 * → re-render — is verified by the orchestrator in a real browser against `views/_chassis-proof`.)
 *
 * What it proves, layer by layer:
 *   - contract → logic : `createSessionStore()` (logic) is driven ONLY by the contract's command event
 *     creators (`setToken` / `setUserInfo` / `clearSession`); dispatch → reduce → projected viewModel.
 *   - Effect-维 port injection seam : a `StoragePort` (admin-contract signature) is INJECTED into the
 *     assembly and is functional (write→read round-trip). The store accepts an injected `effects` map at
 *     the same seam (`CreateSessionStoreDeps.effects`) — proven wireable here; the actual persist effect
 *     is P2. logic stays pure (contract+core only) — so the port is assembled in-test over a `Map`,
 *     byte-for-byte what `dg-cell-mvi-admin-support`'s `createMemoryStorage()` +
 *     `createLocalStorageStoragePort()` produce (the app/SessionProof wires those concrete impls; the
 *     browser run exercises that edge).
 *   - command response : after `setToken`, the projected viewModel reflects the token (+ derived
 *     `authenticated`); after `clearSession`, both are cleared. This is the same `viewModel` graph node
 *     that `useAdminStore` bridges to a Vue Ref, so "responds to commands" holds identically under DOM.
 */
import { describe, it, expect } from 'vitest';

import { createSessionStore } from '../src/index';
import { setToken, setUserInfo, clearSession } from 'dg-cell-mvi-admin-contract';
import type { StoragePort } from 'dg-cell-mvi-admin-contract';

/**
 * An in-test `StoragePort` over a `Map` — the SAME shape `admin-support`'s `createMemoryStorage()` +
 * `createLocalStorageStoragePort()` yield (best-effort get/set/remove, JSON values). Assembled here so
 * admin-logic's dependency surface stays `contract + core` (purity guard); the concrete support impls
 * are wired by the consumer (app/SessionProof), exercised by the browser run.
 */
function makeMemoryStoragePort(prefix = 'admin:'): StoragePort {
  const map = new Map<string, string>();
  const k = (key: string) => `${prefix}${key}`;
  return {
    get<T = unknown>(key: string): T | null {
      const raw = map.get(k(key));
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    set(key: string, value: unknown): void {
      map.set(k(key), JSON.stringify(value));
    },
    remove(key: string): void {
      map.delete(k(key));
    },
  };
}

describe('DEPA chassis assembly (T1.4 · headless): contract → logic + injected StoragePort', () => {
  it('the injected StoragePort is functional (Effect-维 seam round-trips)', () => {
    const storage = makeMemoryStoragePort('admin:');
    expect(storage.get('token')).toBeNull();
    storage.set('token', 'jwt-persisted');
    expect(storage.get<string>('token')).toBe('jwt-persisted');
    storage.remove('token');
    expect(storage.get('token')).toBeNull();
  });

  it('assembly responds to commands: setToken → viewModel reflects token (+ authenticated)', () => {
    // --- assemble: logic store + injected support port (the consumer/装配 shape, minus DOM) ---
    const storage = makeMemoryStoragePort('admin:');
    const store = createSessionStore(/* P2: { effects: persist(storage) } */);

    // initial projected viewModel
    expect(store.viewModel().token).toBe('');
    expect(store.viewModel().authenticated).toBe(false);

    // --- command response: a contract command drives the logic reduce → projected viewModel ---
    store.dispatch(setToken('jwt-123'));
    expect(store.viewModel().token).toBe('jwt-123');
    expect(store.viewModel().authenticated).toBe(true); // derived in projectSession

    store.dispatch(setUserInfo({ id: 1, username: 'alice' }));
    expect(store.viewModel().userInfo).toEqual({ id: 1, username: 'alice' });

    // the port stands ready to shadow the fact (the persist effect itself is P2)
    storage.set('token', store.viewModel().token);
    expect(storage.get<string>('token')).toBe('jwt-123');

    store.dispose();
  });

  it('assembly responds to commands: clearSession → viewModel cleared', () => {
    const store = createSessionStore();
    store.dispatch(setToken('jwt-xyz'));
    store.dispatch(setUserInfo({ id: 2, username: 'bob' }));
    expect(store.viewModel().authenticated).toBe(true);

    store.dispatch(clearSession());
    expect(store.viewModel().token).toBe('');
    expect(store.viewModel().userInfo).toBeNull();
    expect(store.viewModel().authenticated).toBe(false);

    store.dispose();
  });
});
