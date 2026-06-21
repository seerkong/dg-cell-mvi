declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}

/// <reference types="vite/client" />

// Typed app env keys (augments vite/client's ImportMetaEnv). `VITE_APP_MOCK` toggles the dev mock
// HttpPort in chassis/stores.ts (DEV defaults to the mock; set 'false' to use the real axios transport).
interface ImportMetaEnv {
  /** when 'false', use the axios HttpPort even in dev (otherwise dev injects the in-process mock). */
  readonly VITE_APP_MOCK?: string;
  /** API base / prefix consumed by the support env util (getApiBase()). */
  readonly VITE_APP_API?: string;
  /** app title (document.title / login header). */
  readonly VITE_APP_TITLE?: string;
  /** StoragePort key namespace short-name. */
  readonly VITE_APP_STORAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
