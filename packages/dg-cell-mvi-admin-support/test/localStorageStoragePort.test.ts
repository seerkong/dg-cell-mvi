import { describe, it, expect } from 'vitest';

import {
  createLocalStorageStoragePort,
  createMemoryStorage,
  type StorageBackend,
} from '../src/storage/localStorageStoragePort';

describe('localStorageStoragePort', () => {
  it('round-trips a JSON value through an injected in-memory backend', () => {
    const backend = createMemoryStorage();
    const port = createLocalStorageStoragePort({ backend });

    port.set('user', { id: 1, name: 'ada' });
    expect(port.get<{ id: number; name: string }>('user')).toEqual({ id: 1, name: 'ada' });

    // primitives and arrays round-trip too.
    port.set('codes', ['a', 'b']);
    expect(port.get<string[]>('codes')).toEqual(['a', 'b']);
    port.set('n', 42);
    expect(port.get<number>('n')).toBe(42);
  });

  it('returns null for a missing key and after remove()', () => {
    const port = createLocalStorageStoragePort({ backend: createMemoryStorage() });
    expect(port.get('absent')).toBeNull();

    port.set('k', 'v');
    expect(port.get('k')).toBe('v');
    port.remove('k');
    expect(port.get('k')).toBeNull();
  });

  it('applies the key prefix to the underlying backend', () => {
    const backend = createMemoryStorage();
    const port = createLocalStorageStoragePort({ backend, prefix: 'admin:' });

    port.set('token', 'abc');
    // the value is stored under the prefixed key…
    expect(backend.getItem('admin:token')).toBe(JSON.stringify('abc'));
    // …and is NOT visible under the bare key.
    expect(backend.getItem('token')).toBeNull();
    // round-trip through the port resolves the prefix transparently.
    expect(port.get<string>('token')).toBe('abc');
  });

  it('returns null on corrupt JSON instead of throwing (best-effort read)', () => {
    const backend = createMemoryStorage();
    backend.setItem('bad', '{not json');
    const port = createLocalStorageStoragePort({ backend });
    expect(port.get('bad')).toBeNull();
  });

  it('swallows backend write failures (persistence must never break the caller)', () => {
    const throwing: StorageBackend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    const port = createLocalStorageStoragePort({ backend: throwing });
    expect(() => port.set('k', 'v')).not.toThrow();
    expect(() => port.remove('k')).not.toThrow();
  });

  it('degrades to safe no-ops when no backend is available', () => {
    // no backend injected AND no globalThis.localStorage in the node test env → no-op port.
    const hadLocalStorage = 'localStorage' in globalThis;
    const port = createLocalStorageStoragePort();
    if (!hadLocalStorage) {
      expect(() => port.set('k', 'v')).not.toThrow();
      expect(port.get('k')).toBeNull();
      expect(() => port.remove('k')).not.toThrow();
    } else {
      // if the env does expose localStorage, the port simply works against it.
      port.set('__t', 1);
      expect(port.get<number>('__t')).toBe(1);
      port.remove('__t');
    }
  });
});
