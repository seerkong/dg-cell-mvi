import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import type { CrudOptions } from '../src/contract/crudOptions';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
const noopUi = { confirm: async () => true, notify: () => {} };

type Row = { id: number; name: string; age: number };
const SEED: Row[] = [
  { id: 1, name: 'alice', age: 30 },
  { id: 2, name: 'bob', age: 25 },
  { id: 3, name: 'carol', age: 41 },
];

function makeStore(editable: NonNullable<CrudOptions<Row>['table']>['editable']) {
  const data = SEED.map((r) => ({ ...r }));
  return createCrudStore<Row>({
    ui: noopUi,
    crudOptions: {
      request: {
        pageRequest: async () => ({ records: data.map((r) => ({ ...r })), total: data.length, currentPage: 1, pageSize: 10 }),
      },
      columns: {
        id: { title: 'ID', form: { show: false } },
        name: { title: 'Name', form: { rules: [{ required: true, message: 'name required' }] } },
        age: { title: 'Age', type: 'number' },
      },
      pagination: { pageSize: 10 },
      table: { editable },
    },
  });
}

async function loaded(editable: any) {
  const store = makeStore(editable);
  store.dispatch(I.doRefresh());
  await tick();
  return store;
}

describe('editable — row mode (local persist)', () => {
  it('start → edits draft → save merges into the row and clears edit-state', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    await tick();
    let ed = store.viewModel().table.editable;
    expect(ed.rowStates['1'].editing.name).toBe(true);
    expect(ed.rowStates['1'].draft.name).toBe('alice');
    expect(ed.rowStates['1'].editing.id).toBeUndefined(); // id form:hidden → not editable

    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: 'ALICE' }));
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'age', value: 31 }));
    await tick();
    expect(store.viewModel().table.editable.rowStates['1'].draft.name).toBe('ALICE');

    store.dispatch(I.editableSaveRow({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows[0].name).toBe('ALICE');
    expect(vm.table.rows[0].age).toBe(31);
    expect(vm.table.editable.rowStates['1']).toBeUndefined();
    store.dispose();
  });

  it('save with a failing required rule keeps edit-state + sets the cell error', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: '' }));
    store.dispatch(I.editableSaveRow({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.rowStates['1'].errors.name).toBe('name required');
    expect(vm.table.rows[0].name).toBe('alice'); // unchanged
    store.dispose();
  });

  it('cancel discards the draft (row unchanged, edit-state dropped)', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: 'zzz' }));
    store.dispatch(I.editableCancelRow({ rowId: 1, index: 0 }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows[0].name).toBe('alice');
    expect(vm.table.editable.rowStates['1']).toBeUndefined();
    store.dispose();
  });

  it('exclusive: editing another row cancels the first', async () => {
    const store = await loaded({ enabled: true, mode: 'row', exclusive: true });
    store.dispatch(I.editableStartRowEdit({ rowId: 1, index: 0 }));
    store.dispatch(I.editableStartRowEdit({ rowId: 2, index: 1 }));
    await tick();
    const ed = store.viewModel().table.editable;
    expect(ed.rowStates['1']).toBeUndefined();
    expect(ed.rowStates['2'].editing.name).toBe(true);
    store.dispose();
  });
});

describe('editable — cell mode', () => {
  it('start one cell sets activeKey; save merges + clears it', async () => {
    const store = await loaded({ enabled: true, mode: 'cell' });
    store.dispatch(I.editableStartCellEdit({ rowId: 2, index: 1, key: 'name' }));
    await tick();
    let ed = store.viewModel().table.editable;
    expect(ed.activeKey).toBe('2::name');
    expect(ed.rowStates['2'].editing.name).toBe(true);
    expect(ed.rowStates['2'].editing.age).toBeUndefined(); // only the one cell

    store.dispatch(I.editableSetCellValue({ rowId: 2, key: 'name', value: 'BOB' }));
    store.dispatch(I.editableSaveCell({ rowId: 2, index: 1, key: 'name' }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows[1].name).toBe('BOB');
    expect(vm.table.editable.rowStates['2']).toBeUndefined();
    expect(vm.table.editable.activeKey).toBeNull();
    store.dispose();
  });

  it('exclusive cancel: switching to a new cell drops the previous one', async () => {
    const store = await loaded({ enabled: true, mode: 'cell', exclusive: true, exclusiveEffect: 'cancel' });
    store.dispatch(I.editableStartCellEdit({ rowId: 1, index: 0, key: 'name' }));
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: 'tmp' }));
    store.dispatch(I.editableStartCellEdit({ rowId: 2, index: 1, key: 'age' }));
    await tick();
    const ed = store.viewModel().table.editable;
    expect(ed.rowStates['1']).toBeUndefined(); // previous cell cancelled
    expect(ed.activeKey).toBe('2::age');
    expect(store.viewModel().table.rows[0].name).toBe('alice'); // not saved
    store.dispose();
  });

  it('exclusive save: switching saves the previous cell first', async () => {
    const store = await loaded({ enabled: true, mode: 'cell', exclusive: true, exclusiveEffect: 'save' });
    store.dispatch(I.editableStartCellEdit({ rowId: 1, index: 0, key: 'name' }));
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: 'SAVED' }));
    store.dispatch(I.editableStartCellEdit({ rowId: 2, index: 1, key: 'name' }));
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows[0].name).toBe('SAVED'); // previous cell persisted on switch
    expect(vm.table.editable.activeKey).toBe('2::name');
    store.dispose();
  });
});

describe('editable — add / remove rows', () => {
  it('addRow inserts an editing row with a negative id; cancel removes it', async () => {
    const store = await loaded({ enabled: true, mode: 'row' });
    store.dispatch(I.editableAddRow());
    await tick();
    let vm = store.viewModel();
    expect(vm.table.rows[0].id).toBe(-1);
    expect(vm.table.editable.rowStates['-1'].isAdd).toBe(true);
    expect(vm.table.editable.rowStates['-1'].editing.name).toBe(true);
    expect(vm.table.rows.length).toBe(4);

    store.dispatch(I.editableCancelRow({ rowId: -1, index: 0 }));
    await tick();
    vm = store.viewModel();
    expect(vm.table.rows.length).toBe(3);
    expect(vm.table.rows[0].id).toBe(1);
    expect(vm.table.editable.rowStates['-1']).toBeUndefined();
    store.dispose();
  });
});

describe('editable — free mode (batch save)', () => {
  it('saveAll persists every dirty row and clears edit-state', async () => {
    const calls: any[] = [];
    const store = await loaded({
      enabled: true,
      mode: 'free',
      activeDefault: true,
      updateRow: async ({ row }: any) => {
        calls.push(row.id);
        return row;
      },
    });
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: 'r1' }));
    store.dispatch(I.editableSetCellValue({ rowId: 2, key: 'name', value: 'r2' }));
    await tick();
    expect(Object.keys(store.viewModel().table.editable.rowStates).sort()).toEqual(['1', '2']);

    store.dispatch(I.editableSaveAll());
    await tick();
    await tick();
    const vm = store.viewModel();
    expect(calls.sort()).toEqual([1, 2]);
    expect(vm.table.rows[0].name).toBe('r1');
    expect(vm.table.rows[1].name).toBe('r2');
    expect(Object.keys(vm.table.editable.rowStates).length).toBe(0);
    store.dispose();
  });

  it('saveAll skips invalid rows, keeping their errors', async () => {
    const store = await loaded({ enabled: true, mode: 'free', activeDefault: true }); // local persist
    store.dispatch(I.editableSetCellValue({ rowId: 1, key: 'name', value: '' })); // invalid (required)
    store.dispatch(I.editableSetCellValue({ rowId: 2, key: 'name', value: 'ok2' }));
    store.dispatch(I.editableSaveAll());
    await tick();
    const vm = store.viewModel();
    expect(vm.table.editable.rowStates['1']?.errors.name).toBe('name required');
    expect(vm.table.rows[1].name).toBe('ok2'); // valid row saved (local merge)
    expect(vm.table.editable.rowStates['2']).toBeUndefined();
    store.dispose();
  });
});

describe('editable — api persist', () => {
  it('row save calls updateRow and merges its response', async () => {
    const calls: any[] = [];
    const store = await loaded({
      enabled: true,
      mode: 'row',
      updateRow: async ({ row, isAdd }: any) => {
        calls.push({ row, isAdd });
        return { ...row, name: row.name + '#srv' };
      },
    });
    store.dispatch(I.editableStartRowEdit({ rowId: 3, index: 2 }));
    store.dispatch(I.editableSetCellValue({ rowId: 3, key: 'name', value: 'carol2' }));
    store.dispatch(I.editableSaveRow({ rowId: 3, index: 2 }));
    await tick();
    await tick();
    const vm = store.viewModel();
    expect(calls.length).toBe(1);
    expect(calls[0].isAdd).toBe(false);
    expect(vm.table.rows[2].name).toBe('carol2#srv'); // server-mutated response merged
    expect(vm.table.editable.rowStates['3']).toBeUndefined();
    store.dispose();
  });

  it('cell save calls updateCell', async () => {
    const calls: any[] = [];
    const store = await loaded({
      enabled: true,
      mode: 'cell',
      updateCell: async ({ key, value }: any) => {
        calls.push({ key, value });
        return null;
      },
    });
    store.dispatch(I.editableStartCellEdit({ rowId: 2, index: 1, key: 'age' }));
    store.dispatch(I.editableSetCellValue({ rowId: 2, key: 'age', value: 99 }));
    store.dispatch(I.editableSaveCell({ rowId: 2, index: 1, key: 'age' }));
    await tick();
    await tick();
    const vm = store.viewModel();
    expect(calls).toEqual([{ key: 'age', value: 99 }]);
    expect(vm.table.rows[1].age).toBe(99);
    store.dispose();
  });
});
