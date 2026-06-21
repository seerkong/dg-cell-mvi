/**
 * Column settings + storage persistence + x-table passthrough — P3, capability crud.columns-filter.
 * Acceptance source: behavior_deltas/crud.columns-filter/delta.xml.
 *
 * Three things, all at the store/projector boundary (createCrudStore + dispatch, or projectCrudBinding
 * directly):
 *   (1) column settings — setColumnsFilter overrides (show/fixed/order) fold into the immutable
 *       `state.columnsFilter` slice; the projector drops `show:false` columns, applies fixed/order
 *       overrides, and sorts by effective order. resetColumnsFilter clears the slice.
 *   (2) storage persistence — with `table.id` + `toolbar.columnsFilter.storage`, an injected storage
 *       port is read on init (seeding the slice via a load command) and written whenever the slice
 *       changes. Reading/writing is IO → the effect boundary only; the reducer stays pure.
 *   (3) x-table passthrough — table's extra (non-framework-owned) keys collect into
 *       config.table.nativeProps, exposed as `table.nativeProps` so el-table receives stripe/border/….
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectCrudBinding } from '../src/logic/projectors';
import type { ColumnsFilterStoragePort } from '../src/support/columnsFilterEffects';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await tick();
};

interface Row {
  id: number;
  name: string;
  age: number;
  city: string;
}

function fourColOptions() {
  return {
    request: {},
    columns: {
      id: { title: 'ID', column: { width: 70 } },
      name: { title: 'Name' },
      age: { title: 'Age', type: 'number' },
      city: { title: 'City' },
    },
  };
}

// ───────────────────────────── (1) column settings ─────────────────────────────
describe('crud.columns-filter — show / fixed / order overrides (delta: hide-column)', () => {
  it('setColumnsFilter with show:false drops the column from the projected table.columns', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    // all four columns present initially
    expect(store.viewModel().table.columns.map((c) => c.key)).toEqual(['id', 'name', 'age', 'city']);

    store.dispatch(I.setColumnsFilter({ age: { show: false } }));
    const keys = store.viewModel().table.columns.map((c) => c.key);
    expect(keys).toEqual(['id', 'name', 'city']);
    expect(keys).not.toContain('age');
  });

  it('resetColumnsFilter restores a previously hidden column', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    store.dispatch(I.setColumnsFilter({ age: { show: false } }));
    expect(store.viewModel().table.columns.map((c) => c.key)).not.toContain('age');

    store.dispatch(I.resetColumnsFilter());
    expect(store.viewModel().table.columns.map((c) => c.key)).toEqual(['id', 'name', 'age', 'city']);
  });

  it('setColumnsFilter merges successive overrides (does not replace the whole slice)', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    store.dispatch(I.setColumnsFilter({ age: { show: false } }));
    store.dispatch(I.setColumnsFilter({ city: { show: false } }));
    const keys = store.viewModel().table.columns.map((c) => c.key);
    // both overrides survive the merge
    expect(keys).toEqual(['id', 'name']);
  });

  it('fixed / order overrides are reflected in the projected columns', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    // pin city to the left and reorder it before id; bump name to the end
    store.dispatch(
      I.setColumnsFilter({
        city: { fixed: 'left', order: -10 },
        name: { order: 999 },
      }),
    );
    const cols = store.viewModel().table.columns;
    expect(cols.map((c) => c.key)).toEqual(['city', 'id', 'age', 'name']);
    expect(cols.find((c) => c.key === 'city')!.fixed).toBe('left');
  });

  it('clearing a column override with fixed:false removes a config-default fixed', () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          id: { title: 'ID', column: { fixed: 'left' } },
          name: { title: 'Name' },
        },
      },
    });
    expect(store.viewModel().table.columns.find((c) => c.key === 'id')!.fixed).toBe('left');
    store.dispatch(I.setColumnsFilter({ id: { fixed: false } }));
    expect(store.viewModel().table.columns.find((c) => c.key === 'id')!.fixed).toBe(false);
  });
});

// ───────────────────────────── (2) storage persistence ─────────────────────────────
describe('crud.columns-filter — storage persistence (delta: persist-restore)', () => {
  function fakeStore(initial?: Record<string, string>): ColumnsFilterStoragePort & { data: Record<string, string> } {
    const data: Record<string, string> = { ...(initial || {}) };
    return {
      data,
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it('seeds the slice from storage on init when table.id + storage are set (restore)', async () => {
    const saved = JSON.stringify({ age: { show: false } });
    const storage = fakeStore({ 'crud:columnsFilter:feat-cols': saved });
    const store = createCrudStore<Row>({
      crudOptions: {
        ...fourColOptions(),
        table: { id: 'feat-cols' },
        toolbar: { columnsFilter: { show: true, storage: true } },
      },
      storage,
    });
    // the load command fires on the init effect → slice seeded → age dropped from the projection
    await settle();
    expect(store.state().columnsFilter).toEqual({ age: { show: false } });
    expect(store.viewModel().table.columns.map((c) => c.key)).toEqual(['id', 'name', 'city']);
  });

  it('writes the slice to storage whenever it changes (persist)', async () => {
    const storage = fakeStore();
    const store = createCrudStore<Row>({
      crudOptions: {
        ...fourColOptions(),
        table: { id: 'feat-cols' },
        toolbar: { columnsFilter: { show: true, storage: true } },
      },
      storage,
    });
    await settle();

    store.dispatch(I.setColumnsFilter({ city: { show: false } }));
    await settle();
    expect(storage.data['crud:columnsFilter:feat-cols']).toBeDefined();
    expect(JSON.parse(storage.data['crud:columnsFilter:feat-cols'])).toEqual({ city: { show: false } });
  });

  it('does NOT persist when storage is off (no table.id / storage flag)', async () => {
    const storage = fakeStore();
    const store = createCrudStore<Row>({
      crudOptions: fourColOptions(), // no table.id, no toolbar.columnsFilter.storage
      storage,
    });
    await settle();
    store.dispatch(I.setColumnsFilter({ city: { show: false } }));
    await settle();
    // the slice still folds (pure), but nothing is written to storage
    expect(store.state().columnsFilter).toEqual({ city: { show: false } });
    expect(Object.keys(storage.data)).toHaveLength(0);
  });
});

// ───────────────────────────── (3) x-table passthrough ─────────────────────────────
describe('crud.columns-filter — x-table native props passthrough (delta: stripe-border)', () => {
  it('table extra keys collect into config.table.nativeProps and project onto table.nativeProps', () => {
    const config = buildNormalizedOptions<Row>({
      ...fourColOptions(),
      table: { rowKey: 'id', stripe: true, border: true, height: 400, 'max-height': 600 },
    });
    // framework-owned keys must NOT leak into nativeProps
    expect(config.table.nativeProps).toEqual({ stripe: true, border: true, height: 400, 'max-height': 600 });
    expect(config.table.nativeProps).not.toHaveProperty('rowKey');

    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    expect(binding.table.nativeProps).toEqual({ stripe: true, border: true, height: 400, 'max-height': 600 });
  });

  it('framework-owned table keys (rowKey/show/editable/index/selection/tree/id/columnsFilter) are excluded', () => {
    const config = buildNormalizedOptions<Row>({
      ...fourColOptions(),
      table: {
        rowKey: 'id',
        id: 'feat-cols',
        show: true,
        index: { show: true },
        selection: { show: true },
        stripe: true,
      },
    });
    expect(config.table.nativeProps).toEqual({ stripe: true });
  });
});

// ───────────────────────────── (4) toolbar columnsFilter button ─────────────────────────────
describe('crud.columns-filter — toolbar button gating', () => {
  it('the columnsFilter toolbar button is off by default', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    expect(store.viewModel().toolbar.buttons.find((b) => b.key === 'columnsFilter')).toBeUndefined();
  });

  it('toolbar.columnsFilter.show enables the columnsFilter button', () => {
    const store = createCrudStore<Row>({
      crudOptions: { ...fourColOptions(), toolbar: { columnsFilter: { show: true } } },
    });
    expect(store.viewModel().toolbar.buttons.find((b) => b.key === 'columnsFilter')).toBeDefined();
  });

  it('columnsFilter binding lists the full roster with effective show (incl. hidden columns)', () => {
    const store = createCrudStore<Row>({
      crudOptions: { ...fourColOptions(), toolbar: { columnsFilter: { show: true } } },
    });
    store.dispatch(I.setColumnsFilter({ age: { show: false } }));
    const cf = store.viewModel().columnsFilter;
    expect(cf.show).toBe(true);
    // every column is still listed (so the dialog can re-enable a hidden one); age is show:false.
    expect(cf.items.map((i) => i.key)).toEqual(['id', 'name', 'age', 'city']);
    expect(cf.items.find((i) => i.key === 'age')!.show).toBe(false);
    expect(cf.items.find((i) => i.key === 'name')!.show).toBe(true);
  });
});
