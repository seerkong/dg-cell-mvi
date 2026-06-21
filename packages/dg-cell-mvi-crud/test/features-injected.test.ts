/**
 * T6.3 — three additive injected-capability features:
 *   A. i18n: an injected translator localizes built-in chrome labels; absent → default Chinese.
 *   B. settings.plugins: build-time crudOptions transforms (order respected, enabled:false skipped).
 *   C. button permission: a button with a `permission` code is dropped when the injected predicate
 *      denies it, kept when it allows / when no predicate is injected.
 *
 * Driven through the store + projector binding (the real wiring), not the projectors in isolation.
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { projectActionbar, projectRowHandle, projectToolbar } from '../src/logic/projectors/buttons';
import { projectForm } from '../src/logic/projectors/form';
import { createInitialCrudState } from '../src/contract/state';
import { openAdd } from '../src/contract/events';
import { I18N_KEY } from '../src/support/i18n';
import type { CrudOptions } from '../src/contract/crudOptions';

const baseOptions: CrudOptions = {
  request: { pageRequest: async () => ({ records: [], total: 0, currentPage: 1, pageSize: 10 }) },
  columns: {
    id: { title: 'ID' },
    name: { title: 'Name' },
  },
};

// ---------------------------------------------------------------------------
// A. i18n — injected translator localizes built-in chrome labels
// ---------------------------------------------------------------------------
describe('Feature A — i18n (injected translator for built-in chrome)', () => {
  // an EN map keyed by the stable built-in keys; returns the key (a "missing" signal) for unknowns.
  const EN: Record<string, string> = {
    [I18N_KEY.actionbarAdd]: 'Add',
    [I18N_KEY.rowHandleView]: 'View',
    [I18N_KEY.rowHandleEdit]: 'Edit',
    [I18N_KEY.rowHandleRemove]: 'Delete',
    [I18N_KEY.rowHandleTitle]: 'Actions',
    [I18N_KEY.toolbarRefresh]: 'Refresh',
    [I18N_KEY.toolbarColumnsFilter]: 'Columns',
    [I18N_KEY.formCancel]: 'Cancel',
    [I18N_KEY.formOk]: 'Save',
    [I18N_KEY.formAdd]: 'Create',
    [I18N_KEY.removeConfirmMessage]: 'Delete this record?',
    // search-bar + column-settings chrome (P6 bug-A keys — previously hardcoded in the views).
    [I18N_KEY.searchSearch]: 'Search',
    [I18N_KEY.searchReset]: 'Reset',
    [I18N_KEY.searchPlaceholder]: 'Enter ',
    [I18N_KEY.columnsFilterTitle]: 'Columns',
    [I18N_KEY.columnsFilterReset]: 'Reset',
    [I18N_KEY.columnsFilterCancel]: 'Cancel',
    [I18N_KEY.columnsFilterConfirm]: 'OK',
  };
  const en = (key: string, fallback?: string) => EN[key] ?? fallback ?? key;

  it('without a translator, the add-button text is the default Chinese', () => {
    const store = createCrudStore({ crudOptions: baseOptions });
    expect(store.viewModel().actionbar.buttons.find((b) => b.key === 'add')?.text).toBe('新增');
    store.dispose();
  });

  it('with an injected translator, built-in labels are localized (add/rowHandle/toolbar)', () => {
    const store = createCrudStore({
      crudOptions: { ...baseOptions, toolbar: { columnsFilter: { show: true } } },
      i18n: en,
    });
    const vm = store.viewModel();
    expect(vm.actionbar.buttons.find((b) => b.key === 'add')?.text).toBe('Add');
    expect(vm.rowHandle.buttons.find((b) => b.key === 'view')?.text).toBe('View');
    expect(vm.rowHandle.buttons.find((b) => b.key === 'edit')?.text).toBe('Edit');
    expect(vm.rowHandle.buttons.find((b) => b.key === 'remove')?.text).toBe('Delete');
    expect(vm.rowHandle.title).toBe('Actions');
    expect(vm.rowHandle.remove.confirmMessage).toBe('Delete this record?');
    expect(vm.toolbar.buttons.find((b) => b.key === 'refresh')?.text).toBe('Refresh');
    expect(vm.toolbar.buttons.find((b) => b.key === 'columnsFilter')?.text).toBe('Columns');
    store.dispose();
  });

  it('localizes the search-bar chrome (查询/重置/placeholder) + column-settings dialog (P6 bug A)', () => {
    const store = createCrudStore({
      crudOptions: { ...baseOptions, columnsFilter: { show: true } },
      i18n: en,
    });
    const vm = store.viewModel();
    // search bar: the labels the view used to hardcode now resolve through the translator.
    expect(vm.search.searchText).toBe('Search');
    expect(vm.search.resetText).toBe('Reset');
    expect(vm.search.placeholderPrefix).toBe('Enter ');
    // column-settings dialog chrome.
    expect(vm.columnsFilter.title).toBe('Columns');
    expect(vm.columnsFilter.resetText).toBe('Reset');
    expect(vm.columnsFilter.cancelText).toBe('Cancel');
    expect(vm.columnsFilter.confirmText).toBe('OK');
    store.dispose();
  });

  it('search/columnsFilter chrome falls back to the default Chinese with no translator (bug-A parity)', () => {
    const store = createCrudStore({ crudOptions: { ...baseOptions, columnsFilter: { show: true } } });
    const vm = store.viewModel();
    expect(vm.search.searchText).toBe('查询');
    expect(vm.search.resetText).toBe('重置');
    expect(vm.search.placeholderPrefix).toBe('请输入');
    expect(vm.columnsFilter.title).toBe('列设置');
    expect(vm.columnsFilter.resetText).toBe('重置');
    expect(vm.columnsFilter.cancelText).toBe('取消');
    expect(vm.columnsFilter.confirmText).toBe('确定');
    store.dispose();
  });

  it('localizes the form footer + dialog title via the translator', () => {
    const store = createCrudStore({ crudOptions: baseOptions, i18n: en });
    store.dispatch(openAdd());
    const form = store.viewModel().form;
    expect(form.title).toBe('Create'); // formAdd key → 'Create'
    expect(form.buttons.find((b) => b.key === 'cancel')?.text).toBe('Cancel');
    expect(form.buttons.find((b) => b.key === 'ok')?.text).toBe('Save');
    store.dispose();
  });

  it('a missing key (translator echoes the key / returns empty) falls back to the default Chinese', () => {
    // this translator only knows the add key; everything else echoes the key back → fallback applies.
    const partial = (key: string, fallback?: string) =>
      key === I18N_KEY.actionbarAdd ? 'Add' : key; // returns the key itself for misses
    const store = createCrudStore({ crudOptions: baseOptions, i18n: partial });
    const vm = store.viewModel();
    expect(vm.actionbar.buttons.find((b) => b.key === 'add')?.text).toBe('Add');
    // refresh key unknown → translator returns the key → resolveT recovers the default Chinese
    expect(vm.toolbar.buttons.find((b) => b.key === 'refresh')?.text).toBe('刷新');
    store.dispose();
  });

  it('a user-provided button text still wins over the translator', () => {
    const store = createCrudStore({
      crudOptions: { ...baseOptions, actionbar: { buttons: { add: { text: '自定义新增' } } } },
      i18n: en,
    });
    expect(store.viewModel().actionbar.buttons.find((b) => b.key === 'add')?.text).toBe('自定义新增');
    store.dispose();
  });
});

// ---------------------------------------------------------------------------
// B. settings.plugins — build-time crudOptions transforms
// ---------------------------------------------------------------------------
describe('Feature B — settings.plugins (build-time transforms)', () => {
  it('a plugin that adds a column is reflected in the normalized + projected columns', () => {
    const store = createCrudStore({
      crudOptions: {
        ...baseOptions,
        settings: {
          plugins: [
            {
              name: 'add-remark',
              exec: (opts) => {
                opts.columns = { ...(opts.columns || {}), remark: { title: 'Remark' } };
                return opts;
              },
            },
          ],
        },
      },
    });
    expect(store.config.columns.map((c) => c.key)).toContain('remark');
    expect(store.viewModel().table.columns.map((c) => c.key)).toContain('remark');
    store.dispose();
  });

  it('respects plugin order (later plugins see earlier mutations)', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      settings: {
        plugins: [
          { name: 'p1', exec: (o) => { (o as any).marker = 'a'; return o; } },
          { name: 'p2', exec: (o) => { (o as any).marker = (o as any).marker + 'b'; return o; } },
        ],
      },
    });
    expect((config.raw as any).marker).toBe('ab');
  });

  it('skips a plugin with enabled:false', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      settings: {
        plugins: [
          { name: 'on', exec: (o) => { (o as any).a = 1; return o; } },
          { name: 'off', enabled: false, exec: (o) => { (o as any).b = 2; return o; } },
        ],
      },
    });
    expect((config.raw as any).a).toBe(1);
    expect((config.raw as any).b).toBeUndefined();
  });

  it('a plugin returning void keeps the (mutated) input', () => {
    const config = buildNormalizedOptions({
      ...baseOptions,
      settings: {
        plugins: [{ name: 'void', exec: (o) => { (o as any).touched = true; /* no return */ } }],
      },
    });
    expect((config.raw as any).touched).toBe(true);
  });

  it('no settings.plugins → options unchanged (additive)', () => {
    const config = buildNormalizedOptions(baseOptions);
    expect(config.columns.map((c) => c.key)).toEqual(['id', 'name']);
  });

  it('does not mutate the caller-supplied crudOptions object', () => {
    const opts: CrudOptions = {
      ...baseOptions,
      columns: { id: { title: 'ID' } },
      settings: { plugins: [{ exec: (o) => { o.columns = { ...o.columns, extra: {} }; return o; } }] },
    };
    buildNormalizedOptions(opts);
    expect(Object.keys(opts.columns!)).toEqual(['id']); // original untouched
  });
});

// ---------------------------------------------------------------------------
// C. button permission — injected predicate drops permissioned buttons
// ---------------------------------------------------------------------------
describe('Feature C — button permission (injected predicate)', () => {
  const permOptions: CrudOptions = {
    ...baseOptions,
    rowHandle: { buttons: { remove: { permission: 'role:delete' } } },
    toolbar: { buttons: { export: { show: true, permission: 'role:export' } } },
    actionbar: { buttons: { add: { permission: 'role:add' } } },
  };

  it('drops a button whose permission code the predicate denies', () => {
    const store = createCrudStore({
      crudOptions: permOptions,
      permission: (code) => code !== 'role:delete', // deny delete only
    });
    const vm = store.viewModel();
    expect(vm.rowHandle.buttons.map((b) => b.key)).not.toContain('remove');
    expect(vm.rowHandle.buttons.map((b) => b.key)).toContain('view');
    // add allowed, export allowed
    expect(vm.actionbar.buttons.map((b) => b.key)).toContain('add');
    expect(vm.toolbar.buttons.map((b) => b.key)).toContain('export');
    store.dispose();
  });

  it('keeps a button whose permission code the predicate allows', () => {
    const store = createCrudStore({
      crudOptions: permOptions,
      permission: () => true, // allow everything
    });
    const vm = store.viewModel();
    expect(vm.rowHandle.buttons.map((b) => b.key)).toContain('remove');
    expect(vm.actionbar.buttons.map((b) => b.key)).toContain('add');
    expect(vm.toolbar.buttons.map((b) => b.key)).toContain('export');
    store.dispose();
  });

  it('keeps every button when no predicate is injected (additive)', () => {
    const store = createCrudStore({ crudOptions: permOptions });
    const vm = store.viewModel();
    expect(vm.rowHandle.buttons.map((b) => b.key)).toContain('remove');
    expect(vm.actionbar.buttons.map((b) => b.key)).toContain('add');
    expect(vm.toolbar.buttons.map((b) => b.key)).toContain('export');
    store.dispose();
  });

  it('keeps a button with NO permission code even when a predicate is injected', () => {
    // view/edit carry no permission code; a deny-all predicate must not touch them.
    const store = createCrudStore({ crudOptions: baseOptions, permission: () => false });
    const vm = store.viewModel();
    expect(vm.rowHandle.buttons.map((b) => b.key)).toEqual(['view', 'edit', 'remove']);
    expect(vm.actionbar.buttons.map((b) => b.key)).toContain('add');
    store.dispose();
  });

  it('drops a permissioned form footer (custom) button when denied', () => {
    const config = buildNormalizedOptions(
      {
        ...baseOptions,
        form: {
          buttons: [
            { text: 'Approve', permission: 'role:approve', onClick: () => {} },
            { text: 'Plain', onClick: () => {} },
          ],
        },
      },
      undefined,
      { permission: (code) => code !== 'role:approve' },
    );
    const state = createInitialCrudState(config.seed);
    const form = projectForm({ ...state, form: { ...state.form, mode: 'add' } } as any, config);
    expect(form.customButtons.map((b) => b.text)).toEqual(['Plain']);
  });

  it('projectors filter directly too (unit-level: deny add, deny remove)', () => {
    const config = buildNormalizedOptions(permOptions, undefined, {
      permission: (code) => code === 'role:export', // only export allowed
    });
    const state = createInitialCrudState(config.seed);
    expect(projectActionbar(state, config).buttons.map((b) => b.key)).not.toContain('add');
    expect(projectRowHandle(state, config).buttons.map((b) => b.key)).not.toContain('remove');
    expect(projectToolbar(state, config).buttons.map((b) => b.key)).toContain('export');
  });
});
