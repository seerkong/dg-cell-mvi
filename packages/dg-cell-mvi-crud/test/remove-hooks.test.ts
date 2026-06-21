/**
 * Remove hook chain — store-level tests (P5, capability crud.remove-wrapper, group A).
 *
 * The remove chain (beforeRemove → doRemove|delRequest → afterRemove → onRemoved) runs inside the
 * removeChain effect (the impure boundary), never the pure reducer — mirroring the submit hook chain.
 * `beforeRemove` returning `false` or throwing aborts: no delRequest, no refresh, the row stays. A
 * `doRemove` override replaces delRequest. Exercised through the real store loop (dispatch + await).
 *
 * The confirm dialog is UI (popped in the Vue layer), so these tests dispatch `doRemove({ noConfirm:
 * true })` to drive the chain directly — the same path the confirm handler re-dispatches on accept.
 */
import { describe, expect, it, vi } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import type { RemoveScopeContext } from '../src/contract/crudOptions';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
// the chain awaits user hooks (each a microtask); give the feedback loop room to settle.
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await tick();
};

interface Row {
  id: number;
  name: string;
}

const ROWS: Row[] = [
  { id: 1, name: 'alice' },
  { id: 2, name: 'bob' },
  { id: 3, name: 'carol' },
];

/**
 * Build a REMOTE store with rows seeded + the supplied delRequest / remove hooks / pageRequest. Returns
 * the store and the captured spies. Remote mode → a successful remove triggers a page refresh.
 */
function makeRemoveStore(opts: { remove?: Record<string, any>; request?: Record<string, any> } = {}) {
  const delRequest = vi.fn(async (_ctx: { row: any; index?: number }) => ({ ok: true }));
  const pageRequest = vi.fn(async () => ({ records: ROWS.slice(), total: ROWS.length, currentPage: 1, pageSize: 20 }));
  const store = createCrudStore<Row>({
    crudOptions: {
      request: { pageRequest, delRequest, ...(opts.request || {}) },
      columns: { id: { title: 'ID' }, name: { title: 'Name' } },
      rowHandle: { remove: { ...(opts.remove || {}) } },
    },
  });
  // seed the table rows directly (no need to await the pageRequest).
  store.dispatch(I.setTableData(ROWS.slice()));
  return { store, delRequest, pageRequest };
}

describe('crud.remove-wrapper — remove hook chain (group A)', () => {
  it('happy path: full chain runs in order, delRequest fires, success triggers refresh', async () => {
    const calls: string[] = [];
    const { store, delRequest, pageRequest } = makeRemoveStore({
      remove: {
        beforeRemove: vi.fn(async () => void calls.push('beforeRemove')),
        afterRemove: vi.fn(async () => void calls.push('afterRemove')),
        onRemoved: vi.fn(async () => void calls.push('onRemoved')),
      },
    });
    const pageCallsBefore = pageRequest.mock.calls.length;

    store.dispatch(I.doRemove({ row: ROWS[1], index: 1, noConfirm: true }));
    await settle();

    expect(delRequest).toHaveBeenCalledTimes(1);
    expect(delRequest.mock.calls[0][0].row).toMatchObject({ id: 2 });
    // beforeRemove before afterRemove before onRemoved; delRequest fired between before & after.
    expect(calls).toEqual(['beforeRemove', 'afterRemove', 'onRemoved']);
    // remote success → a refresh (pageRequest) fired.
    expect(pageRequest.mock.calls.length).toBeGreaterThan(pageCallsBefore);
  });

  it('beforeRemove returns false → abort: delRequest NOT called, no refresh', async () => {
    const { store, delRequest, pageRequest } = makeRemoveStore({
      remove: { beforeRemove: vi.fn(async () => false) },
    });
    const pageCallsBefore = pageRequest.mock.calls.length;

    store.dispatch(I.doRemove({ row: ROWS[1], index: 1, noConfirm: true }));
    await settle();

    expect(delRequest).not.toHaveBeenCalled();
    expect(pageRequest.mock.calls.length).toBe(pageCallsBefore); // no refresh
  });

  it('beforeRemove throws → abort: delRequest NOT called', async () => {
    const { store, delRequest } = makeRemoveStore({
      remove: {
        beforeRemove: vi.fn(async () => {
          throw new Error('blocked');
        }),
      },
    });
    store.dispatch(I.doRemove({ row: ROWS[0], index: 0, noConfirm: true }));
    await settle();
    expect(delRequest).not.toHaveBeenCalled();
  });

  it('doRemove override: runs instead of delRequest; afterRemove + onRemoved run after', async () => {
    const calls: string[] = [];
    const doRemove = vi.fn(async () => void calls.push('doRemove'));
    const { store, delRequest } = makeRemoveStore({
      remove: {
        doRemove,
        afterRemove: vi.fn(async () => void calls.push('afterRemove')),
        onRemoved: vi.fn(async () => void calls.push('onRemoved')),
      },
    });
    store.dispatch(I.doRemove({ row: ROWS[2], index: 2, noConfirm: true }));
    await settle();

    expect(doRemove).toHaveBeenCalledTimes(1);
    expect(delRequest).not.toHaveBeenCalled(); // override replaces delRequest
    expect(calls).toEqual(['doRemove', 'afterRemove', 'onRemoved']);
  });

  it('afterRemove + onRemoved run after a successful remove (receive the request res)', async () => {
    const afterRemove = vi.fn(async (_ctx: RemoveScopeContext) => {});
    const onRemoved = vi.fn(async (_ctx: RemoveScopeContext) => {});
    const { store } = makeRemoveStore({
      request: { delRequest: vi.fn(async (_ctx: { row: any; index?: number }) => ({ deletedId: 2 })) },
      remove: { afterRemove, onRemoved },
    });
    store.dispatch(I.doRemove({ row: ROWS[1], index: 1, noConfirm: true }));
    await settle();

    expect(afterRemove).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    // the post-request hooks see the request result on ctx.res.
    expect(afterRemove.mock.calls[0][0].res).toMatchObject({ deletedId: 2 });
    expect(onRemoved.mock.calls[0][0].res).toMatchObject({ deletedId: 2 });
  });

  it('local mode: beforeRemove false leaves the row in place (no splice)', async () => {
    const delRequest = vi.fn(async () => ({}));
    const store = createCrudStore<Row>({
      crudOptions: {
        mode: { name: 'local' },
        request: { delRequest },
        columns: { id: { title: 'ID' }, name: { title: 'Name' } },
        rowHandle: { remove: { beforeRemove: async () => false } },
      },
    });
    store.dispatch(I.setTableData(ROWS.slice()));

    store.dispatch(I.doRemove({ row: ROWS[1], index: 1, noConfirm: true }));
    await settle();

    expect(delRequest).not.toHaveBeenCalled();
    // the aborted local delete must NOT splice — all three rows remain.
    expect(store.state().list.rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('local mode: a successful remove splices the row out of the list', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        mode: { name: 'local' },
        request: {},
        columns: { id: { title: 'ID' }, name: { title: 'Name' } },
        rowHandle: { remove: {} },
      },
    });
    store.dispatch(I.setTableData(ROWS.slice()));

    store.dispatch(I.doRemove({ row: ROWS[1], index: 1, noConfirm: true }));
    await settle();

    // index 1 (bob) spliced out after the chain succeeded.
    expect(store.state().list.rows.map((r) => r.id)).toEqual([1, 3]);
  });
});
