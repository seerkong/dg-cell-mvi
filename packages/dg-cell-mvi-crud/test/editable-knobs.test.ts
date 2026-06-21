/**
 * P7 · T7.1 — editable refinements: readonly columns, activeTrigger, programmatic update-cell.
 *
 * Additive to test/editable.test.ts (the 12 core lifecycle tests). These exercise the new knobs:
 *  - readonly: a column marked `column.editable:false` / `{readonly}` / `{disabled}`, or whole-table
 *    `editable.readonly`, is NEVER seeded into the edit buffer + the projector marks it non-editable.
 *  - activeTrigger: the configured cell-activation gesture flows through the projector binding.
 *  - editableUpdateCell: the programmatic update-cell command sets the draft buffer (by rowId / index).
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import type { CrudOptions } from '../src/contract/crudOptions';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
const noopUi = { confirm: async () => true, notify: () => {} };

type Row = { id: number; name: string; age: number; code: string };
const SEED: Row[] = [
  { id: 1, name: 'alice', age: 30, code: 'A-1' },
  { id: 2, name: 'bob', age: 25, code: 'B-2' },
  { id: 3, name: 'carol', age: 41, code: 'C-3' },
];

function makeStore(
  editable: NonNullable<CrudOptions<Row>['table']>['editable'],
  columnOverrides: Record<string, any> = {},
) {
  const data = SEED.map((r) => ({ ...r }));
  return createCrudStore<Row>({
    ui: noopUi,
    crudOptions: {
      request: {
        pageRequest: async () => ({
          records: data.map((r) => ({ ...r })),
          total: data.length,
          currentPage: 1,
          pageSize: 10,
        }),
      },
      columns: {
        id: { title: 'ID', form: { show: false } },
        name: { title: 'Name', form: { rules: [{ required: true, message: 'name required' }] } },
        age: { title: 'Age', type: 'number' },
        code: { title: 'Code', ...(columnOverrides.code || {}) },
      },
      pagination: { pageSize: 10 },
      table: { editable },
    },
  });
}

async function loaded(
  editable: any,
  columnOverrides: Record<string, any> = {},
) {
  const store = makeStore(editable, columnOverrides);
  store.dispatch(I.doRefresh());
  await tick();
  return store;
}

describe('editable knobs — readonly column (row mode)', () => {
  it('column.editable:false → not seeded into the edit buffer; other cells edit; projector marks it', async () => {
    const store = await loaded({ enabled: true, mode: 'row' }, { code: { column: { editable: false } } });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    const rs = vm.table.editable.rowStates['1'];
    // editable siblings ARE in the buffer
    expect(rs.editing.name).toBe(true);
    expect(rs.editing.age).toBe(true);
    // the readonly column is NOT
    expect(rs.editing.code).toBeUndefined();
    expect('code' in rs.draft).toBe(false);
    // projector exposes it as a readonly column + builds no edit control for it
    expect(vm.table.editable.readonlyColumns.code).toBe(true);
    expect(vm.table.editable.columns.code).toBeUndefined();
    // editable columns still have edit controls
    expect(vm.table.editable.columns.name).toBeDefined();
    store.dispose();
  });

  it('column.editable:{readonly:true} behaves the same as editable:false', async () => {
    const store = await loaded(
      { enabled: true, mode: 'row' },
      { code: { column: { editable: { readonly: true } } } },
    );
    store.dispatch(I.editableStartRowEdit({ rowId: 2, index: 1 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.rowStates['2'].editing.code).toBeUndefined();
    expect(vm.table.editable.readonlyColumns.code).toBe(true);
    store.dispose();
  });

  it('column.editable:{disabled:true} also marks the column read-only', async () => {
    const store = await loaded(
      { enabled: true, mode: 'row' },
      { code: { column: { editable: { disabled: true } } } },
    );
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.rowStates['1'].editing.code).toBeUndefined();
    expect(vm.table.editable.readonlyColumns.code).toBe(true);
    store.dispose();
  });

  it('readonly column is excluded from an added row too', async () => {
    const store = await loaded({ enabled: true, mode: 'row' }, { code: { column: { editable: false } } });
    store.dispatch(I.editableAddRow());
    await tick();
    const vm = store.viewModel();
    const rs = vm.table.editable.rowStates['-1'];
    expect(rs.isAdd).toBe(true);
    expect(rs.editing.name).toBe(true);
    expect(rs.editing.code).toBeUndefined();
    store.dispose();
  });

  it('no readonly markers → readonlyColumns is empty (behavior-equivalent when unset)', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(Object.keys(vm.table.editable.readonlyColumns)).toEqual([]);
    // every shown form column (id is form:hidden) is editable
    expect(vm.table.editable.rowStates['1'].editing.code).toBe(true);
    store.dispose();
  });
});

describe('editable knobs — readonly column (cell mode) + whole-table readonly', () => {
  it('cell mode: starting a readonly cell does NOT enter edit', async () => {
    const store = await loaded(
      { enabled: true, mode: 'cell' },
      { code: { column: { editable: false } } },
    );
    store.dispatch(I.editableStartCellEdit({ rowId: 1, index: 0, key: 'code' }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.activeKey).toBeNull();
    expect(vm.table.editable.rowStates['1']).toBeUndefined();
    store.dispose();
  });

  it('cell mode: a non-readonly cell still enters edit', async () => {
    const store = await loaded(
      { enabled: true, mode: 'cell' },
      { code: { column: { editable: false } } },
    );
    store.dispatch(I.editableStartCellEdit({ rowId: 1, index: 0, key: 'name' }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.activeKey).toBe('1::name');
    store.dispose();
  });

  it('whole-table editable.readonly: no cell becomes editable, every column marked', async () => {
    const store = await loaded({ enabled: true, mode: 'row', readonly: true });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.readonly).toBe(true);
    // no cell seeded into the buffer
    expect(vm.table.editable.rowStates['1'].editing.name).toBeUndefined();
    expect(Object.keys(vm.table.editable.rowStates['1'].editing)).toEqual([]);
    // and no edit controls are built
    expect(vm.table.editable.columns.name).toBeUndefined();
    store.dispose();
  });
});

describe('editable knobs — activeTrigger', () => {
  it('defaults to click (behavior-equivalent when unset)', async () => {
    const store = await loaded({ enabled: true, mode: 'cell' });
    expect(store.viewModel().table.editable.activeTrigger).toBe('click');
    store.dispose();
  });

  it('configured dblclick flows through the projector binding', async () => {
    const store = await loaded({ enabled: true, mode: 'cell', activeTrigger: 'dblclick' });
    expect(store.viewModel().table.editable.activeTrigger).toBe('dblclick');
    store.dispose();
  });
});

describe('editable knobs — programmatic update-cell', () => {
  it('editableUpdateCell by rowId sets the draft buffer + marks the cell editing', async () => {
    const store = await loaded({ enabled: true, mode: 'free', activeDefault: true });
    store.dispatch(I.editableUpdateCell({ rowId: 1, colKey: 'name', value: 'NEO' }));
    await tick();
    const rs = store.viewModel().table.editable.rowStates['1'];
    expect(rs.draft.name).toBe('NEO');
    expect(rs.editing.name).toBe(true);
    store.dispose();
  });

  it('editableUpdateCell by index resolves the rowId via rowKey', async () => {
    const store = await loaded({ enabled: true, mode: 'free', activeDefault: true });
    store.dispatch(I.editableUpdateCell({ index: 1, colKey: 'age', value: 99 }));
    await tick();
    // row at index 1 is id=2
    const rs = store.viewModel().table.editable.rowStates['2'];
    expect(rs.draft.age).toBe(99);
    expect(rs.editing.age).toBe(true);
    store.dispose();
  });

  it('editableUpdateCell is a no-op for a readonly column', async () => {
    const store = await loaded(
      { enabled: true, mode: 'free', activeDefault: true },
      { code: { column: { editable: false } } },
    );
    store.dispatch(I.editableUpdateCell({ rowId: 1, colKey: 'code', value: 'X-9' }));
    await tick();
    expect(store.viewModel().table.editable.rowStates['1']).toBeUndefined();
    store.dispose();
  });

  it('a set draft via update-cell is what a subsequent save persists', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableStartRowEdit({ rowId: 3, index: 2 }));
    store.dispatch(I.editableUpdateCell({ rowId: 3, colKey: 'name', value: 'CAROL2' }));
    store.dispatch(I.editableSaveRow({ rowId: 3, index: 2 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows[2].name).toBe('CAROL2');
    expect(vm.table.editable.rowStates['3']).toBeUndefined();
    store.dispose();
  });
});
