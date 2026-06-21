/**
 * Element UI registry — P3 crud.ui-registry, RELOCATED here in P4 crud.ui-package-split.
 * Acceptance source: behavior_deltas/crud.ui-registry/delta.xml (T3.2-AC1; suite `registry`).
 *
 * The `elementUiRegistry` it exercises moved (P4) from `dg-cell-mvi-vue` to this Element UI package
 * (`dg-cell-mvi-element-plus`) — it is the concrete Element impl of dg-cell-mvi-vue's UI-neutral
 * `UiRegistry` interface. So the test lives WITH the impl: it imports the impl symbols
 * (`elementUiRegistry` / `elementUiAdapter` / `COMPONENT_ALIASES` / `resolveElementComponentSpec`) from
 * this package and the interface + injection keys from `dg-cell-mvi-vue`.
 *
 * The UiAdapter seam (F10) was evolved into a unified UiRegistry: component resolution
 * (`resolveComponent` / `resolveComponentSpec`) + imperative UI (`confirm` / `notify` / `message`),
 * one injectable object. The bar is BEHAVIOR-EQUIVALENCE: the default `elementUiRegistry` must resolve
 * every authoring name AND run confirm/notify/message EXACTLY as the prior inline code (DgComponentRender
 * NAME_MAP + COMPONENT_ALIASES; the old elementUiAdapter).
 *
 * These run in the `node` environment (no component mount): component resolution is a PURE string->spec
 * lookup (DgComponentRender consumes this very table, so identical resolution ⟹ identical render), and
 * the imperative UI is asserted against a mocked element-plus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock element-plus so the imperative-UI methods can be asserted without a DOM. ElMessageBox.confirm
// resolves (accept path); the per-kind ElMessage/ElNotification methods are spies.
vi.mock('element-plus', () => {
  const mkKinds = () => ({
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  });
  return {
    ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) },
    ElMessage: mkKinds(),
    ElNotification: mkKinds(),
  };
});

import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
// Element registry impl (this package) — the concrete elementUiRegistry + its tables/helpers.
import {
  COMPONENT_ALIASES,
  elementUiAdapter,
  elementUiRegistry,
  resolveElementComponentSpec,
} from '../src/support/elementUiRegistry';
// The UI-neutral interface + injection keys live in dg-cell-mvi-vue (this package depends on it).
import {
  UI_ADAPTER_KEY,
  UI_REGISTRY_KEY,
  type ResolvedComponentSpec,
  type UiRegistry,
} from 'dg-cell-mvi-vue';

afterEach(() => vi.clearAllMocks());

// ─────────────────────────── (1) component resolution — byte-equivalent to the prior tables ───────────────────────────
//
// GOLDEN expected specs: a verbatim transcription of DgComponentRender's prior inline NAME_MAP (the
// authoring + el-* names) and COMPONENT_ALIASES (the UI-neutral aliases, consulted ONLY when NAME_MAP
// misses). If anyone edits the registry's resolution this golden table breaks → no silent regression.
const NAME_MAP_GOLDEN: Record<string, ResolvedComponentSpec> = {
  text: { name: 'el-input' },
  textarea: { name: 'el-input', props: { type: 'textarea' } },
  number: { name: 'el-input-number' },
  select: { name: 'el-select' },
  switch: { name: 'el-switch' },
  date: { name: 'el-date-picker', props: { type: 'date' } },
  datetime: { name: 'el-date-picker', props: { type: 'datetime' } },
  radio: { name: 'el-radio-group' },
  checkbox: { name: 'el-checkbox-group' },
  cascader: { name: 'el-cascader' },
  'tree-select': { name: 'el-tree-select' },
  'el-input': { name: 'el-input' },
  'el-input-number': { name: 'el-input-number' },
  'el-select': { name: 'el-select' },
  'el-switch': { name: 'el-switch' },
  'el-date-picker': { name: 'el-date-picker' },
  'el-radio-group': { name: 'el-radio-group' },
  'el-checkbox-group': { name: 'el-checkbox-group' },
  'el-cascader': { name: 'el-cascader' },
  'el-tree-select': { name: 'el-tree-select' },
};

// COMPONENT_ALIASES keys that are NOT shadowed by a NAME_MAP entry — i.e. the names whose ONLY
// resolution source is the alias fallback ('input', 'date-picker', 'time-picker', 'radio-group',
// 'checkbox-group'). (Keys like 'select'/'number'/'switch'/'cascader' exist in NAME_MAP too and are
// covered by NAME_MAP_GOLDEN; here we assert the alias-only ones resolve via the fallback layer.)
const ALIAS_ONLY_GOLDEN: Record<string, ResolvedComponentSpec> = {
  input: { name: 'el-input' },
  'date-picker': { name: 'el-date-picker' },
  'time-picker': { name: 'el-time-picker' },
  'radio-group': { name: 'el-radio-group' },
  'checkbox-group': { name: 'el-checkbox-group' },
};

describe('crud.ui-registry — default registry component resolution (no-regression)', () => {
  it('resolveComponentSpec matches the prior NAME_MAP for every authoring + el-* name', () => {
    for (const [name, expected] of Object.entries(NAME_MAP_GOLDEN)) {
      expect(elementUiRegistry.resolveComponentSpec!(name)).toEqual(expected);
      // resolveComponent returns just the concrete el-* component name (the string a caller hands to
      // Vue's resolveComponent) — the same `name` the prior code passed to resolveComponent(entry.name).
      expect(elementUiRegistry.resolveComponent(name)).toBe(expected.name);
    }
  });

  it('resolveComponentSpec falls back to COMPONENT_ALIASES for alias-only logical names', () => {
    for (const [name, expected] of Object.entries(ALIAS_ONLY_GOLDEN)) {
      expect(elementUiRegistry.resolveComponentSpec!(name)).toEqual(expected);
      expect(elementUiRegistry.resolveComponent(name)).toBe(expected.name);
    }
  });

  it('NAME_MAP wins over COMPONENT_ALIASES where both define a name (resolution ORDER preserved)', () => {
    // 'select'/'number'/'switch'/'cascader' exist in BOTH tables with the same target — assert the
    // NAME_MAP entry (consulted first) is what resolves, exactly as the prior `NAME_MAP[k] ?? ALIAS[k]`.
    for (const name of ['select', 'number', 'switch', 'cascader']) {
      expect(elementUiRegistry.resolveComponentSpec!(name)).toEqual(NAME_MAP_GOLDEN[name]);
    }
  });

  it('an unknown name resolves to undefined (caller then applies the el-input terminal fallback)', () => {
    expect(elementUiRegistry.resolveComponentSpec!('totally-unknown')).toBeUndefined();
    expect(elementUiRegistry.resolveComponent('totally-unknown')).toBeUndefined();
    // the standalone pure fn agrees (it is the single source both the registry + DgComponentRender use).
    expect(resolveElementComponentSpec('totally-unknown')).toBeUndefined();
  });

  it('the exported COMPONENT_ALIASES table is intact (back-compat shape)', () => {
    // a couple of representative entries — the table is still exported with the prior contents.
    expect(COMPONENT_ALIASES.input).toEqual({ name: 'el-input' });
    expect(COMPONENT_ALIASES.textarea).toEqual({ name: 'el-input', props: { type: 'textarea' } });
    expect(COMPONENT_ALIASES['time-picker']).toEqual({ name: 'el-time-picker' });
  });
});

// ─────────────────────────── (2) imperative UI — verbatim prior elementUiAdapter behavior ───────────────────────────
describe('crud.ui-registry — default registry imperative UI (verbatim elementUiAdapter)', () => {
  it('confirm → ElMessageBox.confirm(message, title, { type }); accept resolves true', async () => {
    const ok = await elementUiRegistry.confirm({ message: 'do it?', title: 'T', type: 'warning' });
    expect(ok).toBe(true);
    expect(ElMessageBox.confirm).toHaveBeenCalledWith('do it?', 'T', { type: 'warning' });
  });

  it('confirm defaults title to "提示" and type to "warning"', async () => {
    await elementUiRegistry.confirm({ message: 'x' });
    expect(ElMessageBox.confirm).toHaveBeenCalledWith('x', '提示', { type: 'warning' });
  });

  it('confirm resolves false on cancel (reject) — never rejects', async () => {
    (ElMessageBox.confirm as any).mockRejectedValueOnce('cancel');
    await expect(elementUiRegistry.confirm({ message: 'x' })).resolves.toBe(false);
  });

  it('notify → ElNotification[kind] with { title?, message, duration: 2500 }', () => {
    elementUiRegistry.notify({ kind: 'success', title: 'Hi', message: 'done' });
    expect((ElNotification as any).success).toHaveBeenCalledWith({
      title: 'Hi',
      message: 'done',
      duration: 2500,
    });
  });

  it('notify defaults kind to info', () => {
    elementUiRegistry.notify({ message: 'm' });
    expect((ElNotification as any).info).toHaveBeenCalledWith({
      title: undefined,
      message: 'm',
      duration: 2500,
    });
  });

  it('message → ElMessage[kind] with { message }', () => {
    elementUiRegistry.message({ kind: 'error', message: 'oops' });
    expect((ElMessage as any).error).toHaveBeenCalledWith({ message: 'oops' });
  });

  it('message defaults kind to info', () => {
    elementUiRegistry.message({ message: 'm' });
    expect((ElMessage as any).info).toHaveBeenCalledWith({ message: 'm' });
  });
});

// ─────────────────────────── (3) back-compat exports + injection key ───────────────────────────
describe('crud.ui-registry — back-compat surface', () => {
  it('elementUiAdapter IS the registry (same object) — the F10 import still resolves identical behavior', () => {
    // elementUiAdapter is exported as the imperative-UI view of the registry; it is the same instance,
    // so prior `import { elementUiAdapter }` call sites get the exact same confirm/notify/message.
    expect(elementUiAdapter).toBe(elementUiRegistry);
  });

  it('UI_REGISTRY_KEY is the SAME injection symbol as UI_ADAPTER_KEY (provide/inject interop)', () => {
    // useCrud provides under UI_ADAPTER_KEY; DgComponentRender/DgRowHandle/DgFormWrapper inject the same
    // symbol. The alias must be identical so old and new key names resolve the same provided registry.
    expect(UI_REGISTRY_KEY).toBe(UI_ADAPTER_KEY);
  });
});

// ─────────────────────────── (4) an injected custom registry is honored (resolve-and-override) ───────────────────────────
//
// The override path: a caller passes their own UiRegistry; the view layer must resolve components AND
// imperative UI through it. We assert the registry CONTRACT both ways here (a custom registry resolves
// to a different component + its own confirm is callable) — the actual wiring (DgComponentRender +
// useCrud provide/inject) is exercised end-to-end by the admin vite build + browser GapLoop.
describe('crud.ui-registry — injected custom registry (override)', () => {
  it('a custom resolveComponent returns the custom-mapped component (distinct from the default)', () => {
    const custom: UiRegistry = {
      resolveComponent: (name) => (name === 'input' ? 'my-fancy-input' : undefined),
      confirm: () => Promise.resolve(true),
      notify: () => {},
      message: () => {},
    };
    expect(custom.resolveComponent('input')).toBe('my-fancy-input');
    // and it differs from the default registry's resolution — proving an injected registry overrides.
    expect(custom.resolveComponent('input')).not.toBe(elementUiRegistry.resolveComponent('input'));
  });

  it('a custom confirm is the one invoked (the imperative UI is overridable)', async () => {
    const confirm = vi.fn(() => Promise.resolve(false));
    const custom: UiRegistry = {
      resolveComponent: () => undefined,
      confirm,
      notify: () => {},
      message: () => {},
    };
    await expect(custom.confirm({ message: 'x' })).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith({ message: 'x' });
    // the default's ElMessageBox.confirm was NOT used for the custom registry's confirm.
    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
  });

  it('a spec-less custom registry is tolerated (resolveComponentSpec optional)', () => {
    const custom: UiRegistry = {
      resolveComponent: (n) => (n === 'x' ? 'comp-x' : undefined),
      confirm: () => Promise.resolve(true),
      notify: () => {},
      message: () => {},
    };
    // no resolveComponentSpec — DgComponentRender's fallback derives a spec from resolveComponent.
    expect(custom.resolveComponentSpec).toBeUndefined();
    expect(custom.resolveComponent('x')).toBe('comp-x');
  });
});
