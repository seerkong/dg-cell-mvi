/**
 * admin.i18n-theme · suite `theme`/`settings` (P6·T6.2) — the settings actor's PERSIST + HYDRATE effects,
 * exercised end-to-end through the store's closed feedback loop with an INJECTED StoragePort (DEPA Effect
 * 维: fn(runtime,input,config)).
 *
 * Validation strategy (behavior_deltas/admin.i18n-theme/delta.xml case `dark`: "切到暗黑并持久化(刷新后保持)"):
 *   - inject an in-memory StoragePort (a Map behind the contract `StoragePort`), spied so we can assert
 *     what got persisted. localStorage is never touched — logic depends only on the port interface.
 *   - setTheme('dark') / setLocale('en') / setPrimaryColor('#f5222d') → the fact folds AND the preference
 *     blob is persisted (the storage shadow tracks the fact).
 *   - HYDRATE (the "刷新后保持" proof): a SECOND store created over the SAME storage seed restores the
 *     persisted theme/locale/primaryColor on init — i.e. after a reload the actor comes back with the
 *     chosen preferences (the assembly-root apply watch then re-applies them; that apply is the app's job).
 *   - corrupt/empty shadow → the store stays at the seeded defaults.
 *   - APPLY isolation: this effect ONLY touches storage (no DOM/vue) — admin-logic purity (decisions §6/§8).
 *
 * Effects are async (the runner awaits handlers then re-dispatches); a microtask flush settles the loop.
 */
import { describe, it, expect, vi } from 'vitest';

import { createSettingsStore } from '../src/index';
import { setTheme, setLocale, setPrimaryColor } from 'dg-cell-mvi-admin-contract';
import type { StoragePort } from 'dg-cell-mvi-admin-contract';

// a microtask flush: the effect loop is async (persist write; hydrate read → re-dispatch → re-persist).
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

// in-memory StoragePort (the contract value-typed seam; a Map, no localStorage). Spied to assert writes.
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
  return { port, map, setSpy: vi.spyOn(port, 'set') };
}

const KEY = 'admin:settings';

describe('admin.i18n-theme · settings persist/hydrate effects', () => {
  // ===========================================================================
  // PERSIST — every preference write shadows the blob.
  // ===========================================================================
  it('setTheme persists the preference snapshot (the storage shadow tracks the fact)', async () => {
    const storage = createTestStorage();
    const store = createSettingsStore({ storage: storage.port, persistKey: KEY });
    await flush(); // settle the init hydrate (no seed → no-op).

    store.dispatch(setTheme('dark'));
    // command is synchronous: the fact flips immediately.
    expect(store.state().theme).toBe('dark');
    await flush();

    // the preference blob was written under the key, carrying the new theme.
    expect(storage.setSpy).toHaveBeenCalledWith(KEY, expect.objectContaining({ theme: 'dark' }));
    expect(storage.port.get<{ theme: string }>(KEY)?.theme).toBe('dark');
  });

  it('setLocale + setPrimaryColor accumulate into one persisted blob', async () => {
    const storage = createTestStorage();
    const store = createSettingsStore({ storage: storage.port, persistKey: KEY });
    await flush();

    store.dispatch(setLocale('en'));
    store.dispatch(setPrimaryColor('#f5222d'));
    await flush();

    const blob = storage.port.get<{ theme: string; locale: string; primaryColor: string }>(KEY);
    // theme stays the seeded default; locale + primaryColor are the chosen values — all in ONE blob.
    expect(blob).toEqual({ theme: 'light', locale: 'en', primaryColor: '#f5222d' });
  });

  // ===========================================================================
  // HYDRATE (init) — the "刷新后保持" proof: a fresh store restores the persisted preferences.
  // ===========================================================================
  it('hydrate: a persisted {theme,locale,primaryColor} seeds a freshly-created store (refresh keeps it)', async () => {
    // simulate a prior session that chose dark + en + a custom color (already in storage).
    const storage = createTestStorage({
      [KEY]: { theme: 'dark', locale: 'en', primaryColor: '#13c2c2' },
    });

    // a NEW store over that SAME storage = the page after a reload.
    const store = createSettingsStore({ storage: storage.port, persistKey: KEY });
    await flush(); // creation dispatched hydrate(); the effect read storage + re-dispatched the fact writes.

    expect(store.state().theme).toBe('dark');
    expect(store.state().locale).toBe('en');
    expect(store.state().primaryColor).toBe('#13c2c2');
    expect(store.viewModel().primaryColor).toBe('#13c2c2');
  });

  it('hydrate: a partial blob restores only what is present (rest stays default)', async () => {
    const storage = createTestStorage({ [KEY]: { theme: 'dark' } }); // only theme persisted
    const store = createSettingsStore({ storage: storage.port, persistKey: KEY });
    await flush();
    expect(store.state().theme).toBe('dark');
    expect(store.state().locale).toBe('zh-CN'); // untouched default
    expect(store.state().primaryColor).toBeUndefined();
  });

  it('hydrate: an empty store stays at the seeded defaults', async () => {
    const storage = createTestStorage(); // nothing persisted
    const store = createSettingsStore({ storage: storage.port, persistKey: KEY });
    await flush();
    expect(store.state()).toEqual({ theme: 'light', locale: 'zh-CN' });
  });

  // ===========================================================================
  // purity / degradation: no storage → pure state machine (T1.2 behavior preserved)
  // ===========================================================================
  it('no storage → pure state machine: fact writes still work, emitted persist effects are dropped', () => {
    const store = createSettingsStore(); // no storage/effects
    store.dispatch(setTheme('dark'));
    store.dispatch(setLocale('en'));
    expect(store.state()).toEqual({ theme: 'dark', locale: 'en' });
    // dispatching with no wired effect does not throw (the persist request is dropped by the no-op runner).
    expect(() => store.dispatch(setPrimaryColor('#fff'))).not.toThrow();
  });
});
