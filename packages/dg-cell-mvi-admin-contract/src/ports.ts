/**
 * dg-cell-mvi-admin-contract · ports — the Effect-维 injection seams for transport + persistence
 * (DEPA design §C/§D). Pure *signatures* only: logic depends on these interfaces and never on a
 * concrete IO implementation; dg-cell-mvi-admin-support supplies the axios / localStorage impls
 * (T1.3), and P3 layers interceptors / 401→logout (as a domain message) on top of HttpPort.
 *
 * Mirrors crud's port style (support/requestEffects `CrudUiPort`, support/columnsFilterEffects
 * `ColumnsFilterStoragePort`): the contract declares the minimal-but-real seam, the support/render
 * layer implements it, and effects inject it through `runtime` (never reading an implicit global).
 */

// ---------------------------------------------------------------------------
// HttpPort — transport seam
// ---------------------------------------------------------------------------

/** HTTP verbs the transport accepts (lower/upper both tolerated by the axios impl). */
export type HttpMethod =
  | 'get'
  | 'GET'
  | 'post'
  | 'POST'
  | 'put'
  | 'PUT'
  | 'delete'
  | 'DELETE'
  | 'patch'
  | 'PATCH'
  | 'head'
  | 'HEAD'
  | 'options'
  | 'OPTIONS';

/**
 * One transport request. Commandionally a small, framework-neutral subset of axios' config (a concrete
 * impl may pass extra fields through). `url` is required and is resolved against the port's injected
 * `baseURL`; everything else is optional.
 */
export interface HttpRequestConfig {
  url: string;
  method?: HttpMethod;
  /** querystring params. */
  params?: Record<string, unknown>;
  /** request body (for post/put/patch). */
  data?: unknown;
  /** per-request headers (merged over the port's defaults by the impl). */
  headers?: Record<string, string>;
  /** per-request override of the response timeout (ms). */
  timeout?: number;
  /**
   * per-request envelope-unwrap override (P3). When the port is configured to unwrap the
   * `{ code, msg, data }` envelope, set `unwrap: false` to receive the *raw* envelope for this one
   * request instead of its `data` (e.g. an endpoint that returns a non-standard body, or a caller
   * that needs `code`/`msg`). Omitted ⇒ follow the port's default unwrap behavior.
   */
  unwrap?: boolean;
  /** opaque pass-through for impl-specific options (axios `responseType`, etc.). */
  [k: string]: unknown;
}

/**
 * The transport seam. `request<T>` is the single primitive (verb sugar `get`/`post` is optional and
 * delegates to it). `T` is the *resolved* payload the caller expects — the concrete impl decides how
 * the raw response maps to `T` (raw passthrough in T1.3; envelope-unpacking added in P3). Implementations
 * SHALL reject the returned promise on transport/HTTP errors so effect handlers can fold a failure.
 */
export interface HttpPort {
  request<T = unknown>(config: HttpRequestConfig): Promise<T>;
  /** GET convenience — `request({ method: 'get', url, params })`. */
  get?<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T>;
  /** POST convenience — `request({ method: 'post', url, data })`. */
  post?<T = unknown>(url: string, data?: unknown): Promise<T>;
}

// ---------------------------------------------------------------------------
// StoragePort — persistence seam (localStorage is a *shadow* of facts, never a source — design §A)
// ---------------------------------------------------------------------------

/**
 * The persistence seam. Value-typed (not the raw `getItem`/`setItem` string subset): the concrete
 * impl owns JSON (de)serialization + an optional key prefix, so callers store/read typed values
 * directly. `get` returns `null` when the key is absent or unparseable (best-effort, never throws on
 * read). Used as the injection seam for token / per-user tabs / settings persistence effects (P2+).
 */
export interface StoragePort {
  /** read + JSON-parse the value at `key`; `null` if missing or corrupt. */
  get<T = unknown>(key: string): T | null;
  /** JSON-serialize + write `value` at `key`. */
  set(key: string, value: unknown): void;
  /** delete `key`. */
  remove(key: string): void;
}

// ---------------------------------------------------------------------------
// I18nPort — localization seam (settings.locale is the source; the port APPLIES it — design §F P6)
// ---------------------------------------------------------------------------

/**
 * The localization seam (P6·T6.1). The settings actor owns `locale` as the 1-级 fact (its reduce is the
 * single writer); applying that fact to the actual i18n engine is an EFFECT through THIS port — exactly
 * the crud `CrudTranslator` shape generalized for the chassis. logic stays pure (never imports vue-i18n);
 * the concrete adapter (`createVueI18nPort`, wrapping a vue-i18n instance) lives in dg-cell-mvi-vue, and
 * the app装配根 injects it + drives `setLocale` from the settings actor's projected `locale`.
 *
 * The `t(key, fallback?)` member is intentionally structurally compatible with crud's `CrudTranslator`,
 * so a single port instance localizes BOTH the chassis chrome (menu/header/login) AND — handed to
 * `useCrud({ i18n })` — the crud built-in chrome (新增/编辑/删除/查询/重置 …). One source of truth, one
 * translation surface.
 */
export interface I18nPort {
  /**
   * Resolve a message `key` (optionally with a default `fallback`). Returns the localized string, or
   * the fallback / key when the key is unknown — same resilient contract as crud's translator, so this
   * fn may be passed straight to `useCrud({ i18n })`.
   */
  t(key: string, fallback?: string): string;
  /** switch the active locale (the effect-side apply of a `settings.setLocale` command). */
  setLocale(locale: string): void;
  /** read the active locale tag (e.g. for the switcher's current selection). */
  getLocale(): string;
}

// ---------------------------------------------------------------------------
// ThemePort — theming seam (settings.theme/primaryColor is the source; the port APPLIES it — design §6/§F P6)
// ---------------------------------------------------------------------------

/**
 * The theming seam (P6·T6.2). The settings actor owns `theme` ('light'|'dark') + the optional
 * `primaryColor` as 1-级 facts (its reduce is the single writer); applying those facts to the actual
 * render engine is an EFFECT through THIS port — the theme sibling of I18nPort.
 *
 * decisions §6: the chassis uses **Element-Plus NATIVE dark** — `applyTheme('dark')` toggles the
 * `html.dark` class (which EP's `theme-chalk/dark/css-vars.css` keys off), NOT a ported Ant color engine.
 * `applyPrimaryColor` overrides the `--el-color-primary` CSS-variable family. logic stays pure (never
 * touches the DOM); the concrete adapter (`createElementThemePort`) lives in dg-cell-mvi-element-plus,
 * and the app装配根 injects it + drives it from the settings actor's projected theme/primaryColor (the
 * same apply-at-the-root pattern as the locale watch in App.vue — T6.1).
 */
export interface ThemePort {
  /**
   * apply the theme — the effect-side apply of a `settings.setTheme` command. The EP adapter toggles
   * `document.documentElement.classList`'s `dark` class for `'dark'` (and removes it otherwise), so EP's
   * dark CSS variables take/leave effect. Unknown tokens are treated as light (class removed).
   */
  applyTheme(theme: string): void;
  /**
   * apply the custom primary color — the effect-side apply of a `settings.setPrimaryColor` command
   * (optional member: an adapter that only does light/dark may omit it). The EP adapter sets the
   * `--el-color-primary` + its `light-N`/`dark-2` derivations as CSS variables on the root element. Pass
   * an empty string / omit to clear the override (fall back to EP's built-in primary).
   */
  applyPrimaryColor?(color: string): void;
}
