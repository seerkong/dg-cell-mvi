/**
 * Form submit-hook chain + async validation — store-level tests (P1, capability
 * crud.form.submit-hooks). Acceptance source: behavior_deltas/crud.form.submit-hooks/delta.xml.
 *
 * The hook chain (beforeValidate → sync+async validate → beforeSubmit → doSubmit|add/editRequest →
 * afterSubmit → onSuccess) runs inside the submit effect (the impure boundary), never the pure
 * reducer. A hook that throws or returns `false` aborts: no add/editRequest, form stays open,
 * submitStatus back to idle. Exercised through the real store loop (dispatch + await tick).
 */
import { describe, expect, it, vi } from 'vitest';

import { createCrudStore } from '../src/contract/store';
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

/**
 * Build a store with an open ADD form ready to submit (name filled), wiring the supplied
 * request fns + form hooks. Returns the store and the captured request spies.
 */
function makeSubmitStore(opts: {
  form?: Record<string, any>;
  request?: Record<string, any>;
  columns?: Record<string, any>;
  initialForm?: Record<string, any>;
} = {}) {
  const addRequest = vi.fn(async ({ form }: { form: Record<string, any> }) => ({ id: 99, ...form }));
  const editRequest = vi.fn(async ({ form }: { form: Record<string, any> }) => ({ ...form }));
  const store = createCrudStore<Row>({
    crudOptions: {
      request: { addRequest, editRequest, ...(opts.request || {}) },
      columns: {
        id: { title: 'ID', form: { show: false } },
        name: { title: 'Name', form: { rules: [{ required: true, message: 'name required' }] } },
        ...(opts.columns || {}),
      },
      form: { ...(opts.form || {}) },
    },
  });
  // open an add form via the feedback path, then fill it.
  const initialForm = opts.initialForm ?? { name: 'alice' };
  store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm, index: null }));
  return { store, addRequest, editRequest };
}

describe('crud.form.submit-hooks — hook order & abort (delta: hook-order)', () => {
  it('happy path: full chain runs in order, add request fires, form closes', async () => {
    const calls: string[] = [];
    const { store, addRequest } = makeSubmitStore({
      form: {
        beforeValidate: vi.fn(async () => void calls.push('beforeValidate')),
        beforeSubmit: vi.fn(async () => void calls.push('beforeSubmit')),
        afterSubmit: vi.fn(async () => void calls.push('afterSubmit')),
        onSuccess: vi.fn(async () => void calls.push('onSuccess')),
      },
    });
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).toHaveBeenCalledTimes(1);
    expect(addRequest.mock.calls[0][0].form).toMatchObject({ name: 'alice' });
    // beforeValidate before beforeSubmit before afterSubmit before onSuccess; add fired between
    expect(calls).toEqual(['beforeValidate', 'beforeSubmit', 'afterSubmit', 'onSuccess']);
    expect(store.state().form.open).toBe(false); // closed on success
    expect(store.state().form.submitStatus).toBe('saved');
  });

  it('beforeSubmit returns false → abort: no addRequest, form stays open, submitStatus idle', async () => {
    const { store, addRequest } = makeSubmitStore({
      form: { beforeSubmit: vi.fn(async () => false) },
    });
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).not.toHaveBeenCalled();
    expect(store.state().form.open).toBe(true);
    expect(store.state().form.submitStatus).toBe('idle');
  });

  it('beforeSubmit throws → abort: no addRequest, form stays open, submitStatus idle', async () => {
    const { store, addRequest } = makeSubmitStore({
      form: {
        beforeSubmit: vi.fn(async () => {
          throw new Error('blocked by hook');
        }),
      },
    });
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).not.toHaveBeenCalled();
    expect(store.state().form.open).toBe(true);
    expect(store.state().form.submitStatus).toBe('idle');
  });

  it('doSubmit override: form.doSubmit runs instead of add/editRequest; afterSubmit+onSuccess after', async () => {
    const calls: string[] = [];
    const doSubmit = vi.fn(async () => void calls.push('doSubmit'));
    const { store, addRequest, editRequest } = makeSubmitStore({
      form: {
        doSubmit,
        afterSubmit: vi.fn(async () => void calls.push('afterSubmit')),
        onSuccess: vi.fn(async () => void calls.push('onSuccess')),
      },
    });
    store.dispatch(I.doSubmit());
    await settle();

    expect(doSubmit).toHaveBeenCalledTimes(1);
    expect(addRequest).not.toHaveBeenCalled();
    expect(editRequest).not.toHaveBeenCalled();
    expect(calls).toEqual(['doSubmit', 'afterSubmit', 'onSuccess']);
    expect(store.state().form.open).toBe(false);
  });

  it('afterSubmit throws → treated as failure: form NOT closed', async () => {
    const onSuccess = vi.fn();
    const { store, addRequest } = makeSubmitStore({
      form: {
        afterSubmit: vi.fn(async () => {
          throw new Error('after failed');
        }),
        onSuccess,
      },
    });
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).toHaveBeenCalledTimes(1); // request did run
    expect(onSuccess).not.toHaveBeenCalled(); // onSuccess gated behind afterSubmit
    expect(store.state().form.open).toBe(true); // afterSubmit failure keeps it open
  });
});

describe('crud.form.submit-hooks — async validation (delta: async-validate)', () => {
  it('async rule validator rejects → field error set, submit aborted', async () => {
    const addRequest = vi.fn(async () => ({}));
    const store = createCrudStore<Row>({
      crudOptions: {
        request: { addRequest },
        columns: {
          name: {
            title: 'Name',
            form: {
              rules: [
                {
                  // async validator: reject ⇒ field invalid
                  validator: async () => {
                    throw new Error('name taken');
                  },
                  message: 'name taken',
                },
              ],
            },
          },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'bob' }, index: null }));
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).not.toHaveBeenCalled();
    expect(store.state().form.open).toBe(true);
    expect(store.state().form.errors.name).toBeTruthy();
    expect(store.state().form.valid).toBe(false);
  });

  it('async rule validator resolves → submit proceeds', async () => {
    const addRequest = vi.fn(async () => ({}));
    const store = createCrudStore<Row>({
      crudOptions: {
        request: { addRequest },
        columns: {
          name: {
            title: 'Name',
            form: { rules: [{ validator: async () => true }] },
          },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'ok' }, index: null }));
    store.dispatch(I.doSubmit());
    await settle();

    expect(addRequest).toHaveBeenCalledTimes(1);
    expect(store.state().form.open).toBe(false);
  });
});
