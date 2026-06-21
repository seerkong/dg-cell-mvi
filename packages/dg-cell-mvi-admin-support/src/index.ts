/**
 * dg-cell-mvi-admin-support — DEPA admin chassis framework-neutral *support* implementations.
 *
 * Per design.md «DEPA 重构» §E: concrete, framework-neutral port implementations live here — an
 * axios-backed `HttpPort` and a localStorage-backed `StoragePort` — plus framework-neutral utils
 * (env accessors, mitt event bus). Depends ONLY on dg-cell-mvi-admin-contract (the port signatures)
 * + axios/mitt; logic injects these at runtime (Effect-维 seam). This package is framework-neutral —
 * no UI-framework deps. Vue-coupled support (RouterPort=vue-router, I18nPort=vue-i18n) and the EP
 * ThemePort live in the render packages instead.
 *
 * SCOPE: injectable port impls + utils + env. The axios HttpPort carries the full transport behavior
 * (auth-header injection, `{ code, msg, data }` envelope unwrap, 401→onUnauthorized callback) behind
 * the SAME factory seam — the app injects `getAuthToken` / `onUnauthorized` so this package stays
 * framework-neutral (no session-store / vue / router import).
 */

// HttpPort impl (axios) + its options/instance-injection seam + envelope config.
export {
  createAxiosHttpPort,
  type CreateAxiosHttpPortOptions,
  type EnvelopeConfig,
} from './http/axiosHttpPort';

// StoragePort impl (localStorage) + injectable backend + in-memory backend for tests/SSR.
export {
  createLocalStorageStoragePort,
  createMemoryStorage,
  type CreateLocalStorageStoragePortOptions,
  type StorageBackend,
} from './storage/localStorageStoragePort';

// utils — env accessors (the sanctioned `import.meta.env` reader).
export {
  getEnv,
  getApiBase,
  getAppTitle,
  getStorageNamespace,
  getMode,
  isDev,
  isProd,
} from './utils/env';

// utils — mitt event bus (generic UI-signal bus; NOT the actor message channel).
export {
  createEventBus,
  eventBus,
  type AdminEvents,
  type EventBus,
} from './utils/eventBus';
