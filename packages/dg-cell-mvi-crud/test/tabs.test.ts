/**
 * Tabs quick-filter — P6 · T6.2, capability crud.tabs.
 *
 * A tab/segmented bar above the table that quick-filters the list by ONE field (config.tabs.name).
 * Three things, all at the store/projector boundary:
 *   (1) setActiveTab folds `state.tabs.active` and resets pagination to page 1 (like a search submit),
 *       then refetches — verified via a pageRequest spy that captures the query.
 *   (2) the page-query merge (support/buildPageQuery): a non-all active value adds `{ [name]: value }`
 *       to the query form; the all-sentinel (TABS_ALL by default) adds NOTHING. Additive over search.
 *   (3) the projector exposes `tabs` ({ show, name, type, active, options }) with options resolved
 *       (static or dict) and the addAll ("全部") tab prepended; show:false when tabs unset / show!==true.
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectTabs, projectCrudBinding } from '../src/logic/projectors';
import { TABS_ALL } from '../src/contract/crudOptions';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));

interface Row {
  id: number;
  name: string;
  status: string;
}

const ALL: Row[] = [
  { id: 1, name: 'a', status: 'active' },
  { id: 2, name: 'b', status: 'pending' },
  { id: 3, name: 'c', status: 'disabled' },
  { id: 4, name: 'd', status: 'active' },
];

/** a store whose pageRequest records every query it receives + filters by query.form. */
function makeStore(tabs: any, extra?: Record<string, any>) {
  const calls: any[] = [];
  const store = createCrudStore<Row>({
    crudOptions: {
      request: {
        pageRequest: async (query: any) => {
          calls.push(query);
          const form = query.form || {};
          let rows = ALL;
          if (form.status != null) rows = rows.filter((r) => r.status === form.status);
          if (form.name != null) rows = rows.filter((r) => r.name.includes(form.name));
          return { records: rows, total: rows.length, currentPage: query.page.currentPage, pageSize: query.page.pageSize };
        },
      },
      columns: {
        id: { title: 'ID' },
        name: { title: 'Name', search: { show: true } },
        status: { title: 'Status' },
      },
      pagination: { pageSize: 10 },
      tabs,
      ...extra,
    },
  });
  return { store, calls };
}

// ───────────────────────── (1) setActiveTab folds active + resets page ─────────────────────────
describe('crud.tabs — setActiveTab (active + page reset + refetch)', () => {
  it('sets state.tabs.active and resets page to 1', async () => {
    const { store } = makeStore({ show: true, name: 'status', options: [{ label: '在职', value: 'active' }] });
    store.dispatch(I.doRefresh());
    await tick();
    // move off page 1 first so the reset is observable
    store.dispatch(I.setPage(2));
    await tick();
    expect(store.state().list.page.currentPage).toBe(2);

    store.dispatch(I.setActiveTab('active'));
    await tick();
    expect(store.state().tabs.active).toBe('active');
    expect(store.state().list.page.currentPage).toBe(1);
    expect(store.viewModel().pagination.currentPage).toBe(1);
    store.dispose();
  });

  it('initial tabs.active is the addAll sentinel (TABS_ALL) when addAll is on', () => {
    const { store } = makeStore({ show: true, name: 'status', options: [{ label: '在职', value: 'active' }] });
    expect(store.state().tabs.active).toBe(TABS_ALL);
    store.dispose();
  });

  it('initial tabs.active is the first option when addAll is off', () => {
    const { store } = makeStore({
      show: true,
      name: 'status',
      addAll: false,
      options: [{ label: '在职', value: 'active' }, { label: '离职', value: 'disabled' }],
    });
    expect(store.state().tabs.active).toBe('active');
    store.dispose();
  });
});

// ───────────────────────── (2) the page-query merge ─────────────────────────
describe('crud.tabs — page-query merge (include on tab, omit on all)', () => {
  it('includes { [name]: value } in the query when a non-all tab is active', async () => {
    const { store, calls } = makeStore({ show: true, name: 'status', options: [{ label: '在职', value: 'active' }] });
    store.dispatch(I.setActiveTab('active'));
    await tick();
    const last = calls[calls.length - 1];
    expect(last.form.status).toBe('active');
    // the request actually narrowed the list (mock filters by query.form.status)
    expect(store.viewModel().table.rows.every((r) => r.status === 'active')).toBe(true);
    expect(store.viewModel().table.rows.length).toBe(2);
    store.dispose();
  });

  it('OMITS the filter when the all-sentinel is active', async () => {
    const { store, calls } = makeStore({ show: true, name: 'status', options: [{ label: '在职', value: 'active' }] });
    // first narrow, then back to 全部
    store.dispatch(I.setActiveTab('active'));
    await tick();
    store.dispatch(I.setActiveTab(TABS_ALL));
    await tick();
    const last = calls[calls.length - 1];
    expect('status' in last.form).toBe(false);
    expect(store.viewModel().table.rows.length).toBe(ALL.length);
    store.dispose();
  });

  it('merges additively with the search form (both present, search not clobbered)', async () => {
    const { store, calls } = makeStore({ show: true, name: 'status', options: [{ label: '在职', value: 'active' }] });
    store.dispatch(I.setSearchField('name', 'a'));
    store.dispatch(I.doSearch());
    await tick();
    store.dispatch(I.setActiveTab('active'));
    await tick();
    const last = calls[calls.length - 1];
    expect(last.form.status).toBe('active');
    expect(last.form.name).toBe('a');
    store.dispose();
  });

  it('an explicit addAll value override acts as the no-filter sentinel', async () => {
    const { store, calls } = makeStore({
      show: true,
      name: 'status',
      addAll: { label: '全部', value: -1 },
      options: [{ label: '在职', value: 'active' }],
    });
    expect(store.state().tabs.active).toBe(-1);
    store.dispatch(I.doRefresh());
    await tick();
    const last = calls[calls.length - 1];
    expect('status' in last.form).toBe(false);
    store.dispose();
  });
});

// ───────────────────────── (3) the projector tabs binding ─────────────────────────
describe('crud.tabs — projector binding (resolved options + addAll prepended)', () => {
  it('exposes show:false when tabs is unset', () => {
    const config = buildNormalizedOptions<Row>({ columns: { id: {} } });
    const vm = projectTabs(createInitialCrudState<Row>(config.seed), config);
    expect(vm.show).toBe(false);
  });

  it('exposes show:false when tabs.show !== true', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { id: {} },
      tabs: { name: 'status', options: [{ label: '在职', value: 'active' }] },
    });
    expect(projectTabs(createInitialCrudState<Row>(config.seed), config).show).toBe(false);
  });

  it('resolves static options with the addAll tab prepended', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { id: {} },
      tabs: {
        show: true,
        name: 'status',
        options: [
          { label: '在职', value: 'active' },
          { label: '离职', value: 'disabled' },
        ],
      },
    });
    const vm = projectTabs(createInitialCrudState<Row>(config.seed), config);
    expect(vm.show).toBe(true);
    expect(vm.name).toBe('status');
    expect(vm.type).toBe('tabs');
    expect(vm.active).toBe(TABS_ALL);
    expect(vm.options).toEqual([
      { label: '全部', value: TABS_ALL },
      { label: '在职', value: 'active' },
      { label: '离职', value: 'disabled' },
    ]);
  });

  it('omits the addAll tab when addAll:false', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { id: {} },
      tabs: {
        show: true,
        name: 'status',
        addAll: false,
        options: [{ label: '在职', value: 'active' }],
      },
    });
    const vm = projectTabs(createInitialCrudState<Row>(config.seed), config);
    expect(vm.options).toEqual([{ label: '在职', value: 'active' }]);
  });

  it('resolves dict-driven options (with addAll prepended) once the dict has loaded', async () => {
    const { store } = makeStore({
      show: true,
      name: 'status',
      dict: {
        value: 'value',
        label: 'label',
        data: [
          { value: 'active', label: '在职' },
          { value: 'disabled', label: '离职' },
        ],
      },
    });
    // load the tabs dict by its id (the mount loop in the Vue layer does this; here we drive it directly)
    store.dispatch(I.loadDict({ dictId: '__tabs__:status' }));
    await tick();
    const vm = store.viewModel().tabs;
    expect(vm.show).toBe(true);
    expect(vm.options).toEqual([
      { label: '全部', value: TABS_ALL },
      { label: '在职', value: 'active' },
      { label: '离职', value: 'disabled' },
    ]);
    store.dispose();
  });

  it('the full CrudBinding carries the tabs slice', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { id: {} },
      tabs: { show: true, name: 'status', options: [{ label: '在职', value: 'active' }] },
    });
    const binding = projectCrudBinding(createInitialCrudState<Row>(config.seed), config);
    expect(binding.tabs.show).toBe(true);
    expect(binding.tabs.options?.[0]).toEqual({ label: '全部', value: TABS_ALL });
  });
});
