/**
 * T7.2 — four additive features (all faithful ports of the reference crud), driven through the projectors +
 * the real store wiring (never the internals in isolation):
 *   A. rowHandle.dropdown — the button list splits into inline (first `atLeast`) + dropdown rest when
 *      enabled; the full ordered `buttons` list is ALWAYS intact (backward-compat) regardless.
 *   B. rowHandle group — adjacent same-`group` buttons cluster into runs (order preserved); ungrouped
 *      buttons are standalone runs.
 *   C. dict.labelBuilder — a dict value resolves to `labelBuilder(item)`, not `item[label]` (cell +
 *      form select option), additive (no labelBuilder → the plain label).
 *   D. dict.onReady — loading a dict (static `data` + `getData`) fires `onReady({ dict, data })` once,
 *      at the effect boundary (spy).
 *   E. rowHandle.show:false — the projector marks the operation column hidden (`show === false`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectRowHandle } from '../src/logic/projectors/buttons';
import { projectForm } from '../src/logic/projectors/form';
import { getLabelsFromDataMap } from '../src/logic/projectors/compute';
import { resetSharedDictRegistry } from '../src/support/dictRegistry';
import * as I from '../src/contract/events';
import type { CrudOptions } from '../src/contract/crudOptions';

const tick = () => new Promise((r) => setTimeout(r, 0));

const baseOptions: CrudOptions = {
  request: { pageRequest: async () => ({ records: [], total: 0, currentPage: 1, pageSize: 10 }) },
  columns: { id: { title: 'ID' }, name: { title: 'Name' } },
};

beforeEach(() => {
  // isolate the process-wide dict cache between tests (a getData dict would otherwise hit cache and
  // not re-fire onReady on a second store).
  resetSharedDictRegistry();
});

// ---------------------------------------------------------------------------
// A. rowHandle.dropdown — inline / dropdown split (full list intact)
// ---------------------------------------------------------------------------
describe('A — rowHandle.dropdown (overflow → 更多 dropdown)', () => {
  // five rowHandle buttons (3 built-in + 2 custom) so atLeast:2 leaves a clear overflow.
  const fiveButtons: CrudOptions = {
    ...baseOptions,
    rowHandle: {
      buttons: {
        view: { order: 1 },
        edit: { order: 2 },
        remove: { order: 3 },
        audit: { text: '审核', order: 4, onClick: () => {} },
        archive: { text: '归档', order: 5, onClick: () => {} },
      },
    },
  };

  it('OFF (default): dropdown=false, all buttons inline, no overflow', () => {
    const config = buildNormalizedOptions(fiveButtons);
    const state = createInitialCrudState(config.seed);
    const rh = projectRowHandle(state, config);
    expect(rh.dropdown).toBe(false);
    expect(rh.buttons.map((b) => b.key)).toEqual(['view', 'edit', 'remove', 'audit', 'archive']);
    // off → inlineButtons === the full list, dropdownButtons empty.
    expect(rh.inlineButtons.map((b) => b.key)).toEqual(['view', 'edit', 'remove', 'audit', 'archive']);
    expect(rh.dropdownButtons).toEqual([]);
  });

  it('ON (atLeast:2): first 2 inline, the rest in the dropdown; full list still intact', () => {
    const config = buildNormalizedOptions({
      ...fiveButtons,
      rowHandle: { ...fiveButtons.rowHandle, dropdown: { show: true, atLeast: 2 } },
    });
    const state = createInitialCrudState(config.seed);
    const rh = projectRowHandle(state, config);
    expect(rh.dropdown).toBe(true);
    expect(rh.dropdownText).toBe('更多'); // default label
    expect(rh.inlineButtons.map((b) => b.key)).toEqual(['view', 'edit']);
    expect(rh.dropdownButtons.map((b) => b.key)).toEqual(['remove', 'audit', 'archive']);
    // backward-compat: `buttons` is still the FULL ordered list.
    expect(rh.buttons.map((b) => b.key)).toEqual(['view', 'edit', 'remove', 'audit', 'archive']);
  });

  it('atLeast defaults to 1 and `text` overrides the trigger label', () => {
    const config = buildNormalizedOptions({
      ...fiveButtons,
      rowHandle: { ...fiveButtons.rowHandle, dropdown: { show: true, text: '操作菜单' } },
    });
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    expect(rh.inlineButtons.map((b) => b.key)).toEqual(['view']); // atLeast defaults to 1
    expect(rh.dropdownButtons.map((b) => b.key)).toEqual(['edit', 'remove', 'audit', 'archive']);
    expect(rh.dropdownText).toBe('操作菜单');
  });

  it('atLeast >= count → nothing overflows (dropdownButtons empty)', () => {
    const config = buildNormalizedOptions({
      ...fiveButtons,
      rowHandle: { ...fiveButtons.rowHandle, dropdown: { show: true, atLeast: 10 } },
    });
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    expect(rh.inlineButtons.length).toBe(5);
    expect(rh.dropdownButtons).toEqual([]);
  });

  it('drives through the real store binding (vm.rowHandle carries the split)', () => {
    const store = createCrudStore({
      crudOptions: {
        ...fiveButtons,
        rowHandle: { ...fiveButtons.rowHandle, dropdown: { show: true, atLeast: 2 } },
      },
    });
    const rh = store.viewModel().rowHandle;
    expect(rh.dropdown).toBe(true);
    expect(rh.inlineButtons.map((b) => b.key)).toEqual(['view', 'edit']);
    expect(rh.dropdownButtons.map((b) => b.key)).toEqual(['remove', 'audit', 'archive']);
    store.dispose();
  });
});

// ---------------------------------------------------------------------------
// B. rowHandle group — cluster adjacent same-group buttons (order preserved)
// ---------------------------------------------------------------------------
describe('B — rowHandle group (button-group clustering)', () => {
  it('clusters adjacent same-group buttons into runs; ungrouped → standalone runs', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      rowHandle: {
        buttons: {
          view: { order: 1 }, // ungrouped
          edit: { order: 2, group: 'edit' },
          remove: { order: 3, group: 'edit' }, // adjacent same group → clustered with edit
          audit: { order: 4, text: '审核', group: 'flow', onClick: () => {} }, // new group → new run
        },
      },
    });
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    // runs: [view] (standalone), [edit, remove] (group 'edit'), [audit] (group 'flow')
    expect(rh.groups.map((g) => ({ group: g.group, keys: g.buttons.map((b) => b.key) }))).toEqual([
      { group: undefined, keys: ['view'] },
      { group: 'edit', keys: ['edit', 'remove'] },
      { group: 'flow', keys: ['audit'] },
    ]);
    // the full flat list is unchanged.
    expect(rh.buttons.map((b) => b.key)).toEqual(['view', 'edit', 'remove', 'audit']);
  });

  it('no groups → every run is a single standalone button (renders as before)', () => {
    const config = buildNormalizedOptions(baseOptions);
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    expect(rh.groups.every((g) => g.group === undefined && g.buttons.length === 1)).toBe(true);
    expect(rh.groups.map((g) => g.buttons[0].key)).toEqual(['view', 'edit', 'remove']);
  });

  it('same group split by an ungrouped button → two separate runs (clusters are ADJACENT-only)', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      rowHandle: {
        buttons: {
          // hide the built-in view/edit/remove so only the three custom buttons are in play.
          view: { show: false },
          edit: { show: false },
          remove: { show: false },
          a: { order: 10, text: 'A', group: 'g', onClick: () => {} },
          b: { order: 11, text: 'B' }, // ungrouped — breaks the run
          c: { order: 12, text: 'C', group: 'g', onClick: () => {} }, // same name 'g' but not adjacent
        },
      },
    });
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    expect(rh.groups.map((g) => ({ group: g.group, keys: g.buttons.map((b) => b.key) }))).toEqual([
      { group: 'g', keys: ['a'] },
      { group: undefined, keys: ['b'] },
      { group: 'g', keys: ['c'] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// C. dict.labelBuilder — custom display label from a dict item
// ---------------------------------------------------------------------------
describe('C — dict.labelBuilder (custom display label)', () => {
  const dataMap = {
    1: { value: 1, label: '启用' },
    0: { value: 0, label: '禁用' },
  };

  it('getLabelsFromDataMap honors labelBuilder over item[label]', () => {
    const labelBuilder = (item: any) => `${item.label}(${item.value})`;
    expect(getLabelsFromDataMap(dataMap, 1, { labelBuilder })).toBe('启用(1)');
    expect(getLabelsFromDataMap(dataMap, [1, 0], { labelBuilder })).toBe('启用(1), 禁用(0)');
  });

  it('without labelBuilder → plain item[label] (additive / identical to before)', () => {
    expect(getLabelsFromDataMap(dataMap, 1)).toBe('启用');
    expect(getLabelsFromDataMap(dataMap, [1, 0])).toBe('启用, 禁用');
  });

  it('form select option label uses labelBuilder when provided', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      columns: {
        id: { title: 'ID' },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 1, label: '启用' },
              { value: 0, label: '禁用' },
            ],
            labelBuilder: (item: any) => `${item.label}[${item.value}]`,
          },
        },
      },
    });
    const state = createInitialCrudState(config.seed);
    const form = projectForm({ ...state, form: { ...state.form, mode: 'add', open: true } } as any, config);
    const statusItem = form.columns.find((c) => c.key === 'status');
    const opts = (statusItem?.component as any)?.options as Array<{ value: any; label: string }>;
    expect(opts.map((o) => o.label)).toEqual(['启用[1]', '禁用[0]']);
  });
});

// ---------------------------------------------------------------------------
// D. dict.onReady — fired once when the data is ready (effect boundary)
// ---------------------------------------------------------------------------
describe('D — dict.onReady (callback once data loaded)', () => {
  it('fires onReady with the data for a STATIC data dict', async () => {
    const onReady = vi.fn();
    const data = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ];
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        columns: {
          id: { title: 'ID' },
          kind: { title: 'Kind', type: 'select', dict: { value: 'value', label: 'label', data, onReady } },
        },
      },
    });
    store.dispatch(I.loadDict({ dictId: 'kind' }));
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    const ctx = onReady.mock.calls[0][0];
    expect(ctx.data).toEqual(data);
    expect(ctx.dict).toBeDefined();
    store.dispose();
  });

  it('fires onReady with the resolved data for a getData dict', async () => {
    const onReady = vi.fn();
    const getData = vi.fn(async () => [{ value: 1, label: '甲' }]);
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        columns: {
          id: { title: 'ID' },
          g: { title: 'G', type: 'select', dict: { value: 'value', label: 'label', getData, onReady } },
        },
      },
    });
    store.dispatch(I.loadDict({ dictId: 'g' }));
    await tick();
    expect(getData).toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0].data).toEqual([{ value: 1, label: '甲' }]);
    store.dispose();
  });

  it('a redundant loadDict for an already-loaded dict does NOT re-fire onReady', async () => {
    const onReady = vi.fn();
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        columns: {
          id: { title: 'ID' },
          k: { title: 'K', type: 'select', dict: { value: 'value', label: 'label', data: [{ value: 1, label: 'x' }], onReady } },
        },
      },
    });
    store.dispatch(I.loadDict({ dictId: 'k' }));
    await tick();
    store.dispatch(I.loadDict({ dictId: 'k' })); // already loaded → reducer collapses (no effect)
    await tick();
    expect(onReady).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it('no onReady configured → loading still works (no throw)', async () => {
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        columns: { id: { title: 'ID' }, s: { title: 'S', type: 'select', dict: { data: [{ value: 1, label: 'a' }] } } },
      },
    });
    store.dispatch(I.loadDict({ dictId: 's' }));
    await tick();
    expect(store.viewModel().dict['s']?.status).toBe('loaded');
    store.dispose();
  });
});

// ---------------------------------------------------------------------------
// E. rowHandle.show:false — the operation column is hidden in the projection
// ---------------------------------------------------------------------------
describe('E — rowHandle.show:false hides the operation column', () => {
  it('projector marks rowHandle.show === false', () => {
    const config = buildNormalizedOptions({ ...baseOptions, rowHandle: { show: false } });
    const rh = projectRowHandle(createInitialCrudState(config.seed), config);
    expect(rh.show).toBe(false);
  });

  it('default (no rowHandle.show) → operation column shown', () => {
    const config = buildNormalizedOptions(baseOptions);
    expect(projectRowHandle(createInitialCrudState(config.seed), config).show).toBe(true);
  });

  it('rowHandle.show:false even with editable enabled → projection still marks show false', () => {
    // the editable-knobs scenario: an editable table + rowHandle.show:false. The view (DgTable)
    // reads vm.rowHandle.show to suppress the editable action (操作) column; the projection exposes it.
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        rowHandle: { show: false },
        table: { editable: { enabled: true, mode: 'cell' } },
      },
    });
    expect(store.viewModel().rowHandle.show).toBe(false);
    expect(store.viewModel().table.editable.enabled).toBe(true);
    store.dispose();
  });
});
