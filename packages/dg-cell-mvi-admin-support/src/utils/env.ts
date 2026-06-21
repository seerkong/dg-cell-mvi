/**
 * dg-cell-mvi-admin-support · utils/env — typed accessors over Vite's `import.meta.env.VITE_APP_*`.
 *
 * Framework-neutral (no vue/el): the only ambient it reads is `import.meta.env`, the build-tool seam.
 * Mirrors the reference project's `util.env` (the reference admin) in spirit — `VITE_APP_API` etc. — but typed
 * and default-guarded so callers never get `undefined`. Everything else (baseURL for the HttpPort,
 * persistence prefixes for the StoragePort) is *injected*; this module is the one sanctioned reader of
 * the env so factories can default off it without each one touching `import.meta.env` directly.
 */

/** The shape of the env vars this chassis recognizes (all optional at runtime — defaults applied). */
interface AdminEnv {
  /** API base / prefix, e.g. `/api` (dev, proxied) or `https://host/api` (prod). */
  VITE_APP_API?: string;
  /** app title (document.title / login header). */
  VITE_APP_TITLE?: string;
  /** storage key namespace short-name (folds into the StoragePort prefix). */
  VITE_APP_STORAGE?: string;
  /** Vite's built-in mode ('development' | 'production' | …). */
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  [k: string]: unknown;
}

/**
 * Read the raw env bag. Sources, in precedence order:
 *   1. Vite's `import.meta.env` (the browser/build source of truth for `VITE_APP_*`).
 *   2. `process.env` (the node/SSR/test seam — `VITE_APP_*` keys only).
 * Guarded so the module imports cleanly anywhere (either ambient may be absent). In a real Vite build
 * `import.meta.env` is populated and wins; under a node test runner it's empty, so `process.env`
 * (which `vi.stubEnv` writes) supplies values, and otherwise the defaults take over.
 */
function readEnv(): AdminEnv {
  const bag: AdminEnv = {};
  // node/SSR/test layer first (lowest precedence).
  try {
    const pe =
      typeof process !== 'undefined'
        ? (process as unknown as { env?: Record<string, string | undefined> }).env
        : undefined;
    if (pe) {
      for (const k of Object.keys(pe)) {
        if (k.startsWith('VITE_APP_') || k === 'MODE') bag[k] = pe[k];
      }
    }
  } catch {
    /* no process — ignore. */
  }
  // Vite layer second (overrides node values).
  try {
    const ime = (import.meta as unknown as { env?: AdminEnv }).env;
    if (ime) Object.assign(bag, ime);
  } catch {
    /* no import.meta.env — ignore. */
  }
  return bag;
}

/** Generic typed getter for any `VITE_APP_*` key, with a caller-supplied default. */
export function getEnv<T = string>(key: string, defaultValue: T): T {
  const raw = readEnv()[`VITE_APP_${key}`];
  return (raw === undefined || raw === null ? defaultValue : (raw as unknown)) as T;
}

/** API base/prefix (`VITE_APP_API`), defaulting to `/api`. The HttpPort's default baseURL. */
export function getApiBase(): string {
  return getEnv<string>('API', '/api');
}

/** App title (`VITE_APP_TITLE`), defaulting to `'Admin'`. */
export function getAppTitle(): string {
  return getEnv<string>('TITLE', 'Admin');
}

/** Storage namespace short-name (`VITE_APP_STORAGE`), defaulting to `'admin'`. Folds into prefixes. */
export function getStorageNamespace(): string {
  return getEnv<string>('STORAGE', 'admin');
}

/** Current Vite mode string ('development' by default when unset). */
export function getMode(): string {
  return (readEnv().MODE as string | undefined) ?? 'development';
}

/** True in dev (Vite `DEV`, or MODE==='development' fallback). */
export function isDev(): boolean {
  const env = readEnv();
  return env.DEV === true || getMode() === 'development';
}

/** True in a production build (Vite `PROD`, or MODE==='production' fallback). */
export function isProd(): boolean {
  const env = readEnv();
  return env.PROD === true || getMode() === 'production';
}
