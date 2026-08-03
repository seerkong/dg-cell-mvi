/**
 * dg-cell-mvi-admin-support · storage/localStorageStoragePort — the StoragePort impl over Web Storage.
 *
 * A `localStorage`-backed `StoragePort` (admin-contract). Per DEPA design §A, storage is a *shadow* of
 * authoritative facts (token / per-user tabs / settings), never a source — persistence is best-effort:
 * reads never throw (missing/corrupt → `null`), writes swallow quota/serialization errors (mirrors
 * crud's `columnsFilterEffects` discipline: "must never break the loop").
 *
 * Injection seams (the testability/SSR point — nothing is read from an implicit global except via
 * `opts.backend`'s default):
 *   - `opts.backend`  — the Web Storage impl; defaults to `globalThis.localStorage`. Pass a fake
 *                       (e.g. `createMemoryStorage()` below, or jsdom's localStorage) in tests / SSR.
 *   - `opts.prefix`   — an optional key namespace prepended to every key (default: none). Keeps a
 *                       chassis's keys from colliding with other code on the same origin.
 */
import type { StoragePort } from 'dg-cell-mvi-admin-contract';

/** The minimal Web Storage subset the port needs (the `getItem`/`setItem`/`removeItem` triple). */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CreateLocalStorageStoragePortOptions {
  /** the underlying Web Storage; defaults to `globalThis.localStorage`. */
  backend?: StorageBackend;
  /** optional key prefix (namespace), e.g. `'admin:'`. Default: `''` (no prefix). */
  prefix?: string;
}

/**
 * An in-memory `StorageBackend` (a `Map` behind the Web Storage `getItem`/`setItem`/`removeItem`
 * subset). Useful for tests and SSR where no real `localStorage` exists — inject via `opts.backend`.
 */
export function createMemoryStorage(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** Resolve the default backend lazily so importing under node (no `localStorage`) never throws. */
function resolveDefaultBackend(): StorageBackend | undefined {
  if (typeof window === 'undefined') return undefined;
  const g = globalThis as unknown as { localStorage?: StorageBackend };
  return g.localStorage;
}

/**
 * Build a `StoragePort` over `localStorage` (or an injected backend). When no backend is available
 * (node without a fake), every method is a safe no-op (`get` → `null`) so the chassis degrades
 * gracefully rather than crashing — persistence is a shadow, not a requirement.
 */
export function createLocalStorageStoragePort(
  opts: CreateLocalStorageStoragePortOptions = {},
): StoragePort {
  const backend = opts.backend ?? resolveDefaultBackend();
  const prefix = opts.prefix ?? '';
  const withPrefix = (key: string) => `${prefix}${key}`;

  return {
    get<T = unknown>(key: string): T | null {
      if (!backend) return null;
      try {
        const raw = backend.getItem(withPrefix(key));
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw) as T;
      } catch {
        // missing key / corrupt JSON → null (best-effort read, never throws).
        return null;
      }
    },
    set(key: string, value: unknown): void {
      if (!backend) return;
      try {
        backend.setItem(withPrefix(key), JSON.stringify(value));
      } catch {
        // quota / circular-serialization failure must not break the caller.
      }
    },
    remove(key: string): void {
      if (!backend) return;
      try {
        backend.removeItem(withPrefix(key));
      } catch {
        // best-effort.
      }
    },
  };
}
