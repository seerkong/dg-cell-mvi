/**
 * dg-cell-mvi-element-plus · support/elementThemePort — the Element-Plus adapter for the chassis
 * ThemePort (add-admin-chassis P6·T6.2, decisions §6 EP-native dark + §8 ThemePort=EP).
 *
 * The chassis declares a `ThemePort` (theming seam) in dg-cell-mvi-admin-contract; the CONCRETE
 * Element-Plus implementation belongs HERE (the EP render layer), the same way the vue-i18n I18nPort
 * adapter lives in dg-cell-mvi-vue. `createElementThemePort()` returns that port:
 *   - `applyTheme('dark'|'light')` toggles the `html.dark` class — EP's OWN dark theme keys off it
 *     (decisions §6: EP-native dark, NOT a ported Ant color engine). The app imports EP's
 *     `theme-chalk/dark/css-vars.css` once so the class actually re-themes the components.
 *   - `applyPrimaryColor(hex)` overrides the `--el-color-primary` CSS-variable FAMILY on the root element
 *     (the base + EP's `light-1..9` tints and `dark-2` shade, computed by mixing with white/black — the
 *     same derivation EP ships). Pass '' to clear the override (fall back to EP's built-in primary).
 *
 * NEUTRALITY (mirrors vueI18nPort, decisions §8): this module imports NEITHER `dg-cell-mvi-admin-contract`
 * NOR `element-plus`. It returns an `ElementThemePort` whose shape is STRUCTURALLY identical to the
 * contract's `ThemePort` (`applyTheme` + optional `applyPrimaryColor`), so the app assigns it to a
 * `ThemePort`-typed slot with zero coupling. The DOM is touched lazily + guarded, so importing this under
 * node/SSR (no `document`) never throws — every method no-ops when there is no document.
 */

/**
 * The chassis theming port produced by `createElementThemePort`. Structurally identical to
 * `dg-cell-mvi-admin-contract`'s `ThemePort` (so it is assignable to it without importing the contract).
 */
export interface ElementThemePort {
  /** apply the theme — toggles `html.dark` for 'dark' (removes it otherwise). */
  applyTheme(theme: string): void;
  /** apply the custom primary color — sets the `--el-color-primary` CSS-var family on the root ('' clears it). */
  applyPrimaryColor(color: string): void;
}

export interface CreateElementThemePortOptions {
  /**
   * the class toggled on the root element for dark mode. Default `'dark'` (what EP's
   * `theme-chalk/dark/css-vars.css` selects on — `html.dark`). Override only for a custom dark scheme.
   */
  darkClass?: string;
  /**
   * the root element the class + CSS variables are applied to. Default `document.documentElement` (`<html>`),
   * resolved LAZILY per call so the module imports safely under node/SSR. Pass a specific element to scope
   * the theme (e.g. a shadow host) or a test fixture.
   */
  getRoot?: () => { classList: DOMTokenList; style: CSSStyleDeclaration } | null | undefined;
}

/** the EP primary-color CSS variables we drive — base + the light tints (1..9) + the dark shade (2). */
const PRIMARY_VAR = '--el-color-primary';
const LIGHT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const DARK_LEVEL = 2;

/** parse a `#rgb` / `#rrggbb` hex into [r,g,b] (0..255); null if it is not a hex color. */
function parseHex(hex: string): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    return Number.isNaN(r + g + b) ? null : [r, g, b];
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return Number.isNaN(r + g + b) ? null : [r, g, b];
  }
  return null;
}

/** mix `[r,g,b]` toward `weight` (0..1) of white (`light=true`) or black — EP's tint/shade derivation. */
function mix(rgb: [number, number, number], weight: number, light: boolean): string {
  const target = light ? 255 : 0;
  const ch = (c: number) => Math.round(c * (1 - weight) + target * weight);
  const [r, g, b] = rgb;
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(ch(r))}${toHex(ch(g))}${toHex(ch(b))}`;
}

/**
 * Build the Element-Plus ThemePort (structurally — see `ElementThemePort`).
 *
 * @example
 *   import 'element-plus/theme-chalk/dark/css-vars.css'; // once, app-side — the dark vars the class selects.
 *   const themePort = createElementThemePort();
 *   themePort.applyTheme('dark');            // <html class="dark"> → EP goes dark
 *   themePort.applyPrimaryColor('#f5222d');  // override the EP primary family
 */
export function createElementThemePort(
  opts: CreateElementThemePortOptions = {},
): ElementThemePort {
  const darkClass = opts.darkClass ?? 'dark';
  const resolveRoot =
    opts.getRoot ??
    (() => {
      // lazy + guarded: no document (node/SSR) → null → every method no-ops (theme is a render concern).
      const d = (globalThis as { document?: { documentElement?: unknown } }).document;
      return (d?.documentElement as { classList: DOMTokenList; style: CSSStyleDeclaration }) ?? null;
    });

  return {
    applyTheme(theme: string): void {
      const root = resolveRoot();
      if (!root) return;
      // EP-native dark = the `html.dark` class (decisions §6). 'dark' adds it; anything else removes it.
      if (theme === 'dark') root.classList.add(darkClass);
      else root.classList.remove(darkClass);
    },

    applyPrimaryColor(color: string): void {
      const root = resolveRoot();
      if (!root) return;
      // empty/unset → clear the override so EP's built-in primary returns.
      if (!color) {
        root.style.removeProperty(PRIMARY_VAR);
        for (const lvl of LIGHT_LEVELS) root.style.removeProperty(`${PRIMARY_VAR}-light-${lvl}`);
        root.style.removeProperty(`${PRIMARY_VAR}-dark-${DARK_LEVEL}`);
        return;
      }
      const rgb = parseHex(color);
      if (!rgb) return; // not a hex → ignore (never throw on a bad value; theme is best-effort).
      // base + EP's light-1..9 (mix toward white at 0.1*level) + dark-2 (mix toward black at 0.1*2).
      root.style.setProperty(PRIMARY_VAR, color);
      for (const lvl of LIGHT_LEVELS) {
        root.style.setProperty(`${PRIMARY_VAR}-light-${lvl}`, mix(rgb, lvl * 0.1, true));
      }
      root.style.setProperty(`${PRIMARY_VAR}-dark-${DARK_LEVEL}`, mix(rgb, DARK_LEVEL * 0.1, false));
    },
  };
}
