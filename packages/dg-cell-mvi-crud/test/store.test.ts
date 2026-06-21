import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));

const ALL = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: 'user' + (i + 1),
  role: i % 2 ? 'admin' : 'user',
}));

function makeStore() {
  return createCrudStore<{ id: number; name: string; role: string }>({
    crudOptions: {
      request: {
        pageRequest: async (query: any) => {
          const { page, form } = query;
          let rows = ALL;
          if (form?.name) rows = rows.filter((r) => r.name.includes(form.name));
          const start = (page.currentPage - 1) * page.pageSize;
          return {
            records: rows.slice(start, start + page.pageSize),
            total: rows.length,
            currentPage: page.currentPage,
            pageSize: page.pageSize,
          };
        },
      },
      columns: {
        id: { title: 'ID', column: { width: 70 } },
        name: { title: 'Name', search: { show: true } },
        role: { title: 'Role' },
      },
      pagination: { pageSize: 10 },
    },
  });
}

describe('createCrudStore (CRUD model on dg-cell-mvi-core)', () => {
  it('doRefresh loads the first page into the viewModel', async () => {
    const store = makeStore();
    store.dispatch(I.doRefresh());
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows.length).toBe(10);
    expect(vm.table.rows[0].name).toBe('user1');
    expect(vm.pagination.total).toBe(25);
    expect(vm.table.loading).toBe(false);
    expect(vm.table.columns.map((c) => c.key)).toEqual(['id', 'name', 'role']);
    store.dispose();
  });

  it('setPage refetches the right page', async () => {
    const store = makeStore();
    store.dispatch(I.doRefresh());
    await tick();
    store.dispatch(I.setPage(2));
    await tick();
    const vm = store.viewModel();
    expect(vm.pagination.currentPage).toBe(2);
    expect(vm.table.rows[0].name).toBe('user11');
    store.dispose();
  });

  it('setPageSize resets to page 1', async () => {
    const store = makeStore();
    store.dispatch(I.doRefresh());
    await tick();
    store.dispatch(I.setPage(3));
    await tick();
    store.dispatch(I.setPageSize(20));
    await tick();
    const vm = store.viewModel();
    expect(vm.pagination.currentPage).toBe(1);
    expect(vm.pagination.pageSize).toBe(20);
    expect(vm.table.rows.length).toBe(20);
    store.dispose();
  });

  it('doSearch commits the live form and refetches from page 1', async () => {
    const store = makeStore();
    store.dispatch(I.doRefresh());
    await tick();
    store.dispatch(I.setSearchField('name', 'user2'));
    store.dispatch(I.doSearch());
    await tick();
    const vm = store.viewModel();
    expect(vm.table.rows.length).toBeGreaterThan(0);
    expect(vm.table.rows.every((r) => r.name.includes('user2'))).toBe(true);
    expect(vm.pagination.currentPage).toBe(1);
    store.dispose();
  });

  it('exposes search columns in the viewModel', () => {
    const store = makeStore();
    expect(store.viewModel().search.columns.map((c) => c.key)).toEqual(['name']);
    store.dispose();
  });

  it('refreshFailed sets error status', async () => {
    const store = createCrudStore({
      crudOptions: {
        request: {
          pageRequest: async () => {
            throw new Error('boom');
          },
        },
        columns: { id: {} },
      },
    });
    store.dispatch(I.doRefresh());
    await tick();
    expect(store.viewModel().status).toBe('error');
    expect(store.viewModel().error).toContain('boom');
    store.dispose();
  });
});
