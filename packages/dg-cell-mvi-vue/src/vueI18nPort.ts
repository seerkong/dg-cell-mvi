/**
 * dg-cell-mvi-vue · vueI18nPort — the vue-i18n adapter for the chassis I18nPort (add-admin-chassis
 * P6·T6.1, design §F P6 + decisions §8).
 *
 * The chassis declares an `I18nPort` (localization seam) in dg-cell-mvi-admin-contract; the CONCRETE
 * vue-coupled implementation belongs here (the vue耦合 support layer), the same way the vue-router
 * RouterPort adapter and the `useCrud` bridge live here. `createVueI18nPort(i18n)` wraps a vue-i18n
 * instance into that port: `t(key, fallback)` resolves a message, `setLocale` switches the active
 * locale, `getLocale` reads it.
 *
 * NEUTRALITY (decisions §8 硬禁令 "dg-cell-mvi-vue 尽量不强依赖 admin schema"): this module does NOT
 * import `dg-cell-mvi-admin-contract`. It returns a `VueI18nPort` whose shape is STRUCTURALLY identical
 * to the contract's `I18nPort` (`t` / `setLocale` / `getLocale`), so the app can assign it to an
 * `I18nPort`-typed slot with zero coupling — vue stays admin-schema-free. The `t` signature is also
 * structurally the crud `CrudTranslator` (`(key, fallback?) => string`), so the SAME port can be handed
 * to `useCrud({ i18n })` to localize the crud built-in chrome.
 *
 * vue-i18n is a PEER (optionalDependencies via peerDependenciesMeta): the consumer owns the singleton
 * (one app = one i18n instance). This adapter is a thin, dependency-free wrapper around whatever vue-i18n
 * instance the app passes in — it imports no vue-i18n symbol, only structurally-types the slice it uses,
 * so the package builds with or without vue-i18n installed.
 */

/**
 * The chassis localization port produced by `createVueI18nPort`. Structurally identical to
 * `dg-cell-mvi-admin-contract`'s `I18nPort` (so it is assignable to it without importing the contract),
 * and its `t` is structurally the crud `CrudTranslator`.
 */
export interface VueI18nPort {
  /** resolve a message key (with an optional fallback). Crud-`CrudTranslator`-compatible. */
  t(key: string, fallback?: string): string;
  /** switch the active locale. */
  setLocale(locale: string): void;
  /** read the active locale tag. */
  getLocale(): string;
}

/**
 * The minimal slice of a vue-i18n instance this adapter touches — both the `legacy: false` (Composition,
 * `locale` is a `Ref`) and the legacy (`locale` is a plain string) shapes. We do NOT import vue-i18n's
 * `I18n` type (keeps vue-i18n a true optional peer + avoids version-type coupling); we only structurally
 * type `i18n.global`.
 */
export interface VueI18nLike {
  global: {
    /** `legacy:false` → a WritableRef<string>; legacy → a plain string. We support both. */
    locale: string | { value: string };
    /** the translate fn — vue-i18n's `t` accepts `(key)` and `(key, named/default)`. */
    t: (key: string, ...args: unknown[]) => unknown;
    /** whether `i18n.global.t` knows this key (used to honor an explicit fallback on a miss). */
    te?: (key: string, locale?: string) => boolean;
  };
}

/** read the active locale from either the Composition (`Ref`) or legacy (string) shape. */
function readLocale(i18n: VueI18nLike): string {
  const loc = i18n.global.locale;
  return typeof loc === 'string' ? loc : String(loc.value ?? '');
}

/** write the active locale to either shape. */
function writeLocale(i18n: VueI18nLike, locale: string): void {
  const loc = i18n.global.locale;
  if (typeof loc === 'string') {
    // legacy mode — the prop is a plain settable string.
    (i18n.global as { locale: string }).locale = locale;
  } else {
    // Composition mode — `locale` is a WritableComputedRef/Ref; set `.value`.
    loc.value = locale;
  }
}

/**
 * Wrap a vue-i18n instance into the chassis I18nPort (structurally — see `VueI18nPort`).
 *
 * `t(key, fallback)`: returns the vue-i18n translation. On an UNKNOWN key it returns the `fallback`
 * (when provided) — mirroring crud's `resolveT` resilience so the port is safe to hand to
 * `useCrud({ i18n })`: a key the messages don't cover falls back to the crud default Chinese label
 * rather than echoing the raw `fs.*` key. Detection uses `i18n.global.te` (key-exists) when available;
 * otherwise it falls back to comparing the result against the key (vue-i18n echoes an unknown key).
 *
 * @example
 *   const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages });
 *   const i18nPort = createVueI18nPort(i18n);
 *   i18nPort.setLocale('en');                       // switch language
 *   useCrud({ i18n: i18nPort, ... });               // localize crud chrome via the same port
 *   t('menu.cat.chassis', '底盘')                    // chassis chrome
 */
export function createVueI18nPort(i18n: VueI18nLike): VueI18nPort {
  return {
    t(key: string, fallback?: string): string {
      // honor an explicit fallback when the key is unknown (te → exists check, preferred).
      if (fallback !== undefined && typeof i18n.global.te === 'function') {
        if (!i18n.global.te(key)) return fallback;
      }
      const out = i18n.global.t(key);
      const str = typeof out === 'string' ? out : String(out ?? '');
      // vue-i18n echoes an unknown key as its own string → recover the fallback (crud-resolveT parity).
      if (fallback !== undefined && (str === '' || str === key)) return fallback;
      return str;
    },
    setLocale(locale: string): void {
      writeLocale(i18n, locale);
    },
    getLocale(): string {
      return readLocale(i18n);
    },
  };
}
