/**
 * Search col / valueResolve / autoSearchTrigger + multi-level headers + per-column exportable —
 * P7 · T7.3. Five additive capabilities, all at the store / projector / query-assembly boundary:
 *
 *   (A) search col span — the search projector exposes `search.columns[].col` (grid span).
 *   (B) search valueResolve — a searchable field's `valueResolve` transforms the page-query form
 *       (mutate `form` to split into multiple keys, and/or return a replacement) BEFORE transformQuery.
 *       Verified via a pageRequest spy that captures the assembled query.
 *   (C) autoSearchTrigger — view-side debounce; at the crud level we assert (1) the search-submit
 *       command path (doSearch) works, and (2) the projector exposes the autoSearchTrigger config
 *       (crud-wide + per-field) so DgSearch can drive the debounce.
 *   (D) multi-header — the projector builds a column with `children` into a GROUP node carrying
 *       projected child columns (a tree); leaf columns are unaffected.
 *   (E) exportable — `exportColumns` (the export column-selection helper) excludes `exportable:false`
 *       columns and flattens header groups to their leaves; the projector exposes `exportable`.
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectCrudBinding } from '../src/logic/projectors';
import { exportColumns } from '../src/support/exportColumns';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));

interface Row {
  id: number;
  name: string;
  createTime?: string;
}

// ───────────────────────────── (A) search col span ─────────────────────────────
describe('crud.search-col — projector exposes the search item grid span (search.col)', () => {
  it('a searchable column with search.col.span surfaces it on the resolved search column', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        name: { title: '姓名', search: { show: true, col: { span: 8 } } },
        createTime: { title: '时间', search: { show: true } },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const name = binding.search.columns.find((c) => c.key === 'name');
    const time = binding.search.columns.find((c) => c.key === 'createTime');
    expect(name).toBeDefined();
    expect(name!.col).toEqual({ span: 8 });
    // a search item with no col → col is undefined (DgSearch then applies its default span).
    expect(time!.col).toBeUndefined();
  });
});

// ───────────────────────────── (B) search valueResolve ─────────────────────────────
describe('crud.search-valueResolve — transforms the page-query form before transformQuery', () => {
  /** a store whose pageRequest records every (transformed) query it receives. */
  function makeStore(crudOptions: any) {
    const calls: any[] = [];
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {
          pageRequest: async (query: any) => {
            calls.push(query);
            return { records: [], total: 0, currentPage: query.page.currentPage, pageSize: query.page.pageSize };
          },
        },
        ...crudOptions,
      },
    });
    return { store, calls };
  }

  it('a daterange valueResolve splits one field into two query keys (and removes the original)', async () => {
    const { store, calls } = makeStore({
      columns: {
        id: { title: 'ID' },
        createTime: {
          title: '时间',
          search: {
            show: true,
            // split a [start, end] daterange into startTime / endTime query params.
            valueResolve: ({ form, key, value }: any) => {
              if (Array.isArray(value)) {
                form.startTime = value[0];
                form.endTime = value[1];
              }
              delete form[key]; // drop the original daterange key from the query
            },
          },
        },
      },
    });

    // type a daterange into the search field, then submit.
    store.dispatch(I.setSearchField('createTime', ['2026-01-01', '2026-01-31']));
    store.dispatch(I.doSearch({ goFirstPage: true }));
    await tick();

    const q = calls.at(-1);
    expect(q.form.startTime).toBe('2026-01-01');
    expect(q.form.endTime).toBe('2026-01-31');
    expect(q.form.createTime).toBeUndefined(); // original key removed by the resolver
  });

  it('a valueResolve RETURN value replaces the field at its key', async () => {
    const { store, calls } = makeStore({
      columns: {
        name: {
          title: '姓名',
          search: {
            show: true,
            // normalize the search term (trim + lowercase) by RETURNING a replacement.
            valueResolve: ({ value }: any) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
          },
        },
      },
    });
    store.dispatch(I.setSearchField('name', '  ALICE  '));
    store.dispatch(I.doSearch({ goFirstPage: true }));
    await tick();
    expect(calls.at(-1).form.name).toBe('alice');
  });

  it('no valueResolve → the search form flows through to the query verbatim (additive)', async () => {
    const { store, calls } = makeStore({
      columns: { name: { title: '姓名', search: { show: true } } },
    });
    store.dispatch(I.setSearchField('name', 'bob'));
    store.dispatch(I.doSearch({ goFirstPage: true }));
    await tick();
    expect(calls.at(-1).form).toEqual({ name: 'bob' });
  });

  it('valueResolve only runs for SHOWN search columns (a non-search column resolver is ignored)', async () => {
    let ran = false;
    const { store, calls } = makeStore({
      columns: {
        name: { title: '姓名', search: { show: true } },
        // search.show is NOT true → this resolver must never run during query assembly.
        secret: { title: '隐藏', search: { show: false, valueResolve: () => { ran = true; } } },
      },
    });
    store.dispatch(I.setSearchField('name', 'x'));
    store.dispatch(I.doSearch({ goFirstPage: true }));
    await tick();
    expect(ran).toBe(false);
    expect(calls.at(-1).form).toEqual({ name: 'x' });
  });
});

// ───────────────────────────── (C) autoSearchTrigger ─────────────────────────────
describe('crud.autoSearchTrigger — search-submit command path + projector config exposure', () => {
  it('doSearch (the command DgSearch dispatches on auto-trigger) refetches with the live search form', async () => {
    const calls: any[] = [];
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {
          pageRequest: async (query: any) => {
            calls.push(query);
            return { records: [], total: 0, currentPage: query.page.currentPage, pageSize: query.page.pageSize };
          },
        },
        search: { autoSearchTrigger: 'change' },
        columns: { name: { title: '姓名', search: { show: true } } },
      },
    });
    // a field change writes the live form; the view would debounce-dispatch doSearch — emulate that.
    store.dispatch(I.setSearchField('name', 'carol'));
    store.dispatch(I.doSearch({ goFirstPage: true }));
    await tick();
    expect(calls.at(-1).form).toEqual({ name: 'carol' });
    expect(calls.at(-1).page.currentPage).toBe(1);
  });

  it('the projector exposes the crud-wide autoSearchTrigger and per-field overrides', () => {
    const config = buildNormalizedOptions<Row>({
      search: { autoSearchTrigger: 'change' },
      columns: {
        name: { title: '姓名', search: { show: true } }, // inherits crud-wide
        createTime: {
          title: '时间',
          search: { show: true, autoSearchTrigger: { event: 'change', wait: 800 } }, // per-field override
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    expect(binding.search.autoSearchTrigger).toBe('change');
    const name = binding.search.columns.find((c) => c.key === 'name');
    const time = binding.search.columns.find((c) => c.key === 'createTime');
    expect(name!.autoSearchTrigger).toBeUndefined(); // no per-field → falls back to crud-wide in the view
    expect(time!.autoSearchTrigger).toEqual({ event: 'change', wait: 800 });
  });

  it('default (unset) → crud-wide autoSearchTrigger is false (search only on the button)', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { name: { title: '姓名', search: { show: true } } },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    expect(binding.search.autoSearchTrigger).toBe(false);
  });
});

// ───────────────────────────── (D) multi-level headers ─────────────────────────────
describe('crud.multi-header — projector builds column.children into a group node tree', () => {
  it('a column with children (keyed map) becomes a GROUP node carrying projected children', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        name: { title: '姓名' },
        contact: {
          title: '联系方式',
          children: {
            phone: { title: '电话', column: { width: 120 } },
            email: { title: '邮箱' },
          },
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);

    const group = binding.table.columns.find((c) => c.key === 'contact');
    expect(group).toBeDefined();
    expect(group!.title).toBe('联系方式');
    expect(group!.children).toBeDefined();
    expect(group!.children!.map((c) => c.key)).toEqual(['phone', 'email']);
    expect(group!.children![0].title).toBe('电话');
    expect(group!.children![0].width).toBe(120);

    // leaf columns are unaffected — no children.
    const leaf = binding.table.columns.find((c) => c.key === 'name');
    expect(leaf!.children).toBeUndefined();
  });

  it('children declared as an ARRAY use each child key (or a synthetic one) and keep order', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        review: {
          title: '考核',
          children: [
            { key: 'q', title: '季度' },
            { key: 'y', title: '年度' },
          ],
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const group = binding.table.columns.find((c) => c.key === 'review');
    expect(group!.children!.map((c) => c.key)).toEqual(['q', 'y']);
    expect(group!.children!.map((c) => c.title)).toEqual(['季度', '年度']);
  });

  it('nested groups recurse (a group inside a group) and leaf cellRender refs pass through', () => {
    const cellRender = () => 'x';
    const config = buildNormalizedOptions<Row>({
      columns: {
        outer: {
          title: '外层',
          children: {
            inner: {
              title: '内层',
              children: { deep: { title: '最深', column: { cellRender } } },
            },
          },
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const outer = binding.table.columns.find((c) => c.key === 'outer')!;
    const inner = outer.children![0];
    expect(inner.key).toBe('inner');
    const deep = inner.children![0];
    expect(deep.key).toBe('deep');
    expect(deep.children).toBeUndefined(); // a true leaf
    expect(deep.cellRender).toBe(cellRender); // opaque ref carried through, never called
  });

  it('a hidden child (column.show:false) is dropped from the group', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        g: {
          title: 'G',
          children: {
            a: { title: 'A' },
            b: { title: 'B', column: { show: false } },
          },
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const group = binding.table.columns.find((c) => c.key === 'g')!;
    expect(group.children!.map((c) => c.key)).toEqual(['a']);
  });
});

// ───────────────────────────── (E) per-column exportable ─────────────────────────────
describe('crud.exportable — exportColumns excludes exportable:false + flattens header groups', () => {
  it('the projector exposes exportable on each resolved column (default true)', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        name: { title: '姓名' },
        secret: { title: '内部', exportable: false },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    expect(binding.table.columns.find((c) => c.key === 'name')!.exportable).toBe(true);
    expect(binding.table.columns.find((c) => c.key === 'secret')!.exportable).toBe(false);
  });

  it('exportColumns drops exportable:false columns (additive — unset → included)', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        id: { title: 'ID' },
        name: { title: '姓名' },
        secret: { title: '内部', exportable: false },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const picked = exportColumns(binding.table.columns).map((c) => c.key);
    expect(picked).toEqual(['id', 'name']); // secret excluded
  });

  it('exportColumns flattens header GROUPS to their leaf data columns (groups are not data)', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        name: { title: '姓名' },
        contact: {
          title: '联系方式',
          children: {
            phone: { title: '电话' },
            email: { title: '邮箱', exportable: false }, // a non-exportable leaf under a group
          },
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const picked = exportColumns(binding.table.columns).map((c) => c.key);
    // the group header itself is not a data column; its exportable leaf (phone) is included, email excluded.
    expect(picked).toEqual(['name', 'phone']);
  });

  it('all columns exportable by default → exportColumns returns every keyed leaf', () => {
    const config = buildNormalizedOptions<Row>({
      columns: { a: { title: 'A' }, b: { title: 'B' }, c: { title: 'C' } },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    expect(exportColumns(binding.table.columns).map((c) => c.key)).toEqual(['a', 'b', 'c']);
  });
});
