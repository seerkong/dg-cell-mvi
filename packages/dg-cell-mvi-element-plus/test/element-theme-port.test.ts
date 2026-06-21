/**
 * Element-Plus ThemePort — add-admin-chassis P6·T6.2 (decisions §6 EP-native dark + §8 ThemePort=EP).
 * Acceptance source: behavior_deltas/admin.i18n-theme/delta.xml case `dark` (EP-native dark + theme color).
 *
 * `createElementThemePort` is the EP adapter for the chassis `ThemePort`: `applyTheme` toggles the
 * `html.dark` class (EP-native dark — NOT a ported color engine), `applyPrimaryColor` overrides the
 * `--el-color-primary` CSS-variable family. These run in the `node` environment (no real DOM): the port
 * exposes a `getRoot` injection seam, so we hand it a FAKE root (a classList + style stub) and assert the
 * class toggles + the CSS variables it writes. We also assert the no-DOM path is a safe no-op.
 */
import { describe, it, expect } from 'vitest';

// import the adapter DIRECTLY from its source module (not the package barrel): the barrel re-exports the
// Fs*.vue SFCs, and this package's vitest config has no @vitejs/plugin-vue, so pulling the barrel into a
// `node`-env test would try to transform .vue files. The adapter is a plain .ts module — import it alone.
import { createElementThemePort } from '../src/support/elementThemePort';

/** a minimal fake of the root element the port touches: a classList Set + a style Map. */
function createFakeRoot() {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const root = {
    classList: {
      add: (c: string) => {
        classes.add(c);
      },
      remove: (c: string) => {
        classes.delete(c);
      },
      contains: (c: string) => classes.has(c),
    } as unknown as DOMTokenList,
    style: {
      setProperty: (k: string, v: string) => {
        props.set(k, v);
      },
      removeProperty: (k: string) => {
        props.delete(k);
      },
      getPropertyValue: (k: string) => props.get(k) ?? '',
    } as unknown as CSSStyleDeclaration,
  };
  return { root, classes, props };
}

describe('createElementThemePort · EP-native dark + primary color', () => {
  it('applyTheme("dark") adds the html.dark class; "light" removes it', () => {
    const fake = createFakeRoot();
    const port = createElementThemePort({ getRoot: () => fake.root });

    port.applyTheme('dark');
    expect(fake.classes.has('dark')).toBe(true);

    port.applyTheme('light');
    expect(fake.classes.has('dark')).toBe(false);

    // an unknown token is treated as light (class removed / absent).
    fake.classes.add('dark');
    port.applyTheme('whatever');
    expect(fake.classes.has('dark')).toBe(false);
  });

  it('applyPrimaryColor sets the --el-color-primary family (base + light-1..9 + dark-2)', () => {
    const fake = createFakeRoot();
    const port = createElementThemePort({ getRoot: () => fake.root });

    port.applyPrimaryColor('#409eff');
    expect(fake.props.get('--el-color-primary')).toBe('#409eff');
    // all nine light tints + the dark shade are written.
    for (let lvl = 1; lvl <= 9; lvl += 1) {
      expect(fake.props.get(`--el-color-primary-light-${lvl}`)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(fake.props.get('--el-color-primary-dark-2')).toMatch(/^#[0-9a-f]{6}$/);
    // a tint is lighter than the base (mixes toward white) — sanity on the derivation direction.
    expect(fake.props.get('--el-color-primary-light-9')).not.toBe('#409eff');
  });

  it('applyPrimaryColor("") clears the whole family (back to EP default)', () => {
    const fake = createFakeRoot();
    const port = createElementThemePort({ getRoot: () => fake.root });

    port.applyPrimaryColor('#f5222d');
    expect(fake.props.size).toBeGreaterThan(0);

    port.applyPrimaryColor('');
    expect(fake.props.has('--el-color-primary')).toBe(false);
    expect(fake.props.has('--el-color-primary-light-5')).toBe(false);
    expect(fake.props.has('--el-color-primary-dark-2')).toBe(false);
  });

  it('a non-hex color is ignored (never throws; theme is best-effort)', () => {
    const fake = createFakeRoot();
    const port = createElementThemePort({ getRoot: () => fake.root });
    expect(() => port.applyPrimaryColor('not-a-color')).not.toThrow();
    expect(fake.props.has('--el-color-primary')).toBe(false);
  });

  it('no DOM (getRoot → null) → every method is a safe no-op', () => {
    const port = createElementThemePort({ getRoot: () => null });
    expect(() => port.applyTheme('dark')).not.toThrow();
    expect(() => port.applyPrimaryColor('#409eff')).not.toThrow();
  });
});
