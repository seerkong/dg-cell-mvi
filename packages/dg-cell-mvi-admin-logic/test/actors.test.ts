/**
 * admin.shell-state · suite `actors` (data-ownership actor) + key-event coverage.
 *
 * Delta cases covered:
 *   - single-writer: a fact (e.g. session.token) has exactly one writer (its reduce); other parties
 *     can only dispatch its command. We prove this two ways: (a) dispatching ANOTHER actor's command
 *     leaves this actor's fact untouched (same reference); (b) the store exposes no fact-mutation API
 *     besides `dispatch`.
 *   - reduce purity: same (state,event) → equal output, and inputs are never mutated.
 *
 * Plus key-event coverage per actor: session setToken/clearSession, tabs openTab(no-dup)/closeTab/
 * setCurrent, permission setCodes, settings setTheme/setLocale.
 */
import { describe, it, expect } from 'vitest';

import {
  createSessionStore,
  createTabsStore,
  createPermissionStore,
  createSettingsStore,
  reduceSession,
  reduceTabs,
  reducePermission,
  reduceSettings,
} from '../src/index';
import {
  // session
  setToken,
  setUserInfo,
  clearSession,
  // tabs
  openTab,
  closeTab,
  closeOthers,
  closeAll,
  setCurrent,
  // permission
  setCodes,
  clearCodes,
  // settings
  setTheme,
  setLocale,
  createInitialSessionState,
  createInitialTabsState,
  createInitialPermissionState,
  createInitialSettingsState,
} from 'dg-cell-mvi-admin-contract';
import type { TabItem } from 'dg-cell-mvi-admin-contract';

const tab = (name: string, fullPath: string, extra: Partial<TabItem> = {}): TabItem => ({
  name,
  fullPath,
  ...extra,
});

// =============================================================================
// session actor
// =============================================================================
describe('session actor', () => {
  it('setToken writes token; setUserInfo writes profile; clearSession empties both', () => {
    const store = createSessionStore();
    expect(store.state().token).toBe('');
    expect(store.state().userInfo).toBeNull();

    store.dispatch(setToken('jwt-123'));
    expect(store.state().token).toBe('jwt-123');

    store.dispatch(setUserInfo({ id: 1, username: 'alice' }));
    expect(store.state().userInfo).toEqual({ id: 1, username: 'alice' });

    store.dispatch(clearSession());
    expect(store.state().token).toBe('');
    expect(store.state().userInfo).toBeNull();
  });

  it('viewModel projects authenticated from token (derived, recomputed)', () => {
    const store = createSessionStore();
    expect(store.viewModel().authenticated).toBe(false);
    store.dispatch(setToken('jwt'));
    expect(store.viewModel().authenticated).toBe(true);
    store.dispatch(clearSession());
    expect(store.viewModel().authenticated).toBe(false);
  });

  // single-writer (delta case): another actor's command must not touch session.
  it('SINGLE-WRITER: a foreign command leaves session unchanged (same reference)', () => {
    const store = createSessionStore();
    store.dispatch(setToken('t'));
    const before = store.state();
    // dispatch tabs/permission/settings commands at the session store: no-op fold.
    store.dispatch(openTab(tab('x', '/x')));
    store.dispatch(setCodes(['a']));
    store.dispatch(setTheme('dark'));
    expect(store.state()).toBe(before); // identical reference → not rewritten
  });

  it('PURE: reduceSession is deterministic and does not mutate inputs', () => {
    const s0 = createInitialSessionState();
    const frozen = Object.freeze({ ...s0 });
    const r1 = reduceSession(frozen, setToken('a'));
    const r2 = reduceSession(frozen, setToken('a'));
    expect(r1.state).toEqual(r2.state); // same input → equal output
    expect(r1.state).not.toBe(frozen); // fresh object on change (immutability)
    expect(frozen.token).toBe(''); // input untouched
  });
});

// =============================================================================
// tabs actor
// =============================================================================
describe('tabs actor', () => {
  it('openTab adds and makes current; opening the same fullPath does NOT duplicate', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('a', '/a')));
    store.dispatch(openTab(tab('b', '/b')));
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/a', '/b']);
    expect(store.state().current).toBe('/b');

    // re-open /a → focus (current=/a) but no duplicate entry
    store.dispatch(openTab(tab('a', '/a')));
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/a', '/b']);
    expect(store.state().current).toBe('/a');
  });

  it('closeTab removes the tab and falls back current to a neighbour', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('a', '/a')));
    store.dispatch(openTab(tab('b', '/b')));
    store.dispatch(openTab(tab('c', '/c'))); // current=/c
    store.dispatch(setCurrent('/b'));

    store.dispatch(closeTab('/b')); // current was /b → neighbour /c
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/a', '/c']);
    expect(store.state().current).toBe('/c');

    store.dispatch(closeTab('/c')); // current was /c (last) → left neighbour /a
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/a']);
    expect(store.state().current).toBe('/a');
  });

  it('setCurrent changes only the active fullPath', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('a', '/a')));
    store.dispatch(openTab(tab('b', '/b')));
    store.dispatch(setCurrent('/a'));
    expect(store.state().current).toBe('/a');
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/a', '/b']);
  });

  it('keepAlive is derived from opened (only keepAlive tabs, de-duped)', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('a', '/a', { keepAlive: true })));
    store.dispatch(openTab(tab('b', '/b'))); // not kept
    store.dispatch(openTab(tab('c', '/c', { keepAlive: true })));
    expect(store.state().keepAlive).toEqual(['a', 'c']);
    store.dispatch(closeTab('/a'));
    expect(store.state().keepAlive).toEqual(['c']);
  });

  it('closeOthers keeps the target (+ affix); closeAll keeps only affix', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('home', '/home', { meta: { affix: true } })));
    store.dispatch(openTab(tab('a', '/a')));
    store.dispatch(openTab(tab('b', '/b')));

    store.dispatch(closeOthers('/a'));
    expect(store.state().opened.map((t) => t.fullPath).sort()).toEqual(['/a', '/home']);
    expect(store.state().current).toBe('/a');

    store.dispatch(closeAll());
    expect(store.state().opened.map((t) => t.fullPath)).toEqual(['/home']);
  });

  it('SINGLE-WRITER: a foreign command leaves tabs unchanged (same reference)', () => {
    const store = createTabsStore();
    store.dispatch(openTab(tab('a', '/a')));
    const before = store.state();
    store.dispatch(setToken('t'));
    store.dispatch(setCodes(['x']));
    store.dispatch(setLocale('en'));
    expect(store.state()).toBe(before);
  });

  it('PURE: reduceTabs does not mutate the opened array of the input state', () => {
    const s0 = createInitialTabsState();
    const r = reduceTabs(s0, openTab(tab('a', '/a')));
    expect(s0.opened).toEqual([]); // input array untouched
    expect(r.state.opened).toHaveLength(1);
    expect(r.state.opened).not.toBe(s0.opened);
  });
});

// =============================================================================
// permission actor
// =============================================================================
describe('permission actor', () => {
  it('setCodes replaces codes; clearCodes empties', () => {
    const store = createPermissionStore();
    expect(store.state().codes).toEqual([]);
    store.dispatch(setCodes(['user:add', 'user:edit']));
    expect(store.state().codes).toEqual(['user:add', 'user:edit']);
    store.dispatch(setCodes(['role:view'])); // replace, not merge
    expect(store.state().codes).toEqual(['role:view']);
    store.dispatch(clearCodes());
    expect(store.state().codes).toEqual([]);
  });

  it('SINGLE-WRITER: a foreign command leaves permission unchanged (same reference)', () => {
    const store = createPermissionStore();
    store.dispatch(setCodes(['a']));
    const before = store.state();
    store.dispatch(setToken('t'));
    store.dispatch(openTab(tab('x', '/x')));
    store.dispatch(setTheme('dark'));
    expect(store.state()).toBe(before);
  });

  it('PURE: setCodes copies the array (no aliasing of caller input)', () => {
    const input = ['a', 'b'];
    const r = reducePermission(createInitialPermissionState(), setCodes(input));
    expect(r.state.codes).toEqual(['a', 'b']);
    input.push('c'); // mutating the caller's array must not leak into state
    expect(r.state.codes).toEqual(['a', 'b']);
  });

  // `loaded` control fact (load-race fix): distinguishes "a codes load has resolved" from "still loading"
  // so the router permission guard never误跳 /403 during the async load window. setCodes→true (even []),
  // clearCodes→false (logout re-arms the gate). Pure: the codes membership semantics are unchanged.
  it('LOADED flag: initial false, setCodes flips true (even empty), clearCodes flips back false', () => {
    expect(createInitialPermissionState().loaded).toBe(false);

    const store = createPermissionStore();
    expect(store.state().loaded).toBe(false); // nothing loaded yet → guard must NOT gate

    store.dispatch(setCodes(['user:view']));
    expect(store.state().loaded).toBe(true); // codes resolved → guard may now enforce
    expect(store.viewModel().loaded).toBe(true); // and the projection exposes it

    // an EMPTY result is still a real answer ("no extra perms"), so loaded stays true (not "loading").
    store.dispatch(setCodes([]));
    expect(store.state().codes).toEqual([]);
    expect(store.state().loaded).toBe(true);

    store.dispatch(clearCodes()); // logout → unloaded again (next login re-loads; gate re-armed)
    expect(store.state().loaded).toBe(false);
    expect(store.state().codes).toEqual([]);
  });
});

// =============================================================================
// settings actor
// =============================================================================
describe('settings actor', () => {
  it('setTheme / setLocale write their fields independently', () => {
    const store = createSettingsStore();
    expect(store.state()).toEqual({ theme: 'light', locale: 'zh-CN' });
    store.dispatch(setTheme('dark'));
    expect(store.state()).toEqual({ theme: 'dark', locale: 'zh-CN' });
    store.dispatch(setLocale('en'));
    expect(store.state()).toEqual({ theme: 'dark', locale: 'en' });
  });

  it('SINGLE-WRITER: a foreign command leaves settings unchanged (same reference)', () => {
    const store = createSettingsStore();
    store.dispatch(setTheme('dark'));
    const before = store.state();
    store.dispatch(setToken('t'));
    store.dispatch(openTab(tab('x', '/x')));
    store.dispatch(setCodes(['a']));
    expect(store.state()).toBe(before);
  });

  it('PURE: reduceSettings is deterministic and immutable', () => {
    const s0 = createInitialSettingsState();
    const r1 = reduceSettings(s0, setTheme('dark'));
    const r2 = reduceSettings(s0, setTheme('dark'));
    expect(r1.state).toEqual(r2.state);
    expect(r1.state).not.toBe(s0);
    expect(s0.theme).toBe('light');
  });
});
