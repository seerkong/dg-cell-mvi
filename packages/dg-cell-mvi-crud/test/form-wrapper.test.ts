/**
 * Form-wrapper advanced — store/projector-level tests (P5, capability crud.remove-wrapper, group B).
 *
 * Framework parts of the wrapper feature (the UI lifecycle/beforeClose live in the Vue layer):
 *   (1) dirty tracking — formOpened snapshots state.form.initial; the projector derives form.dirty
 *       (= !isEqual(form, initial)). Editing a field flips dirty true; restoring the value flips back.
 *   (2) saveDraft — with form.wrapper.saveDraft + an id, editing persists the form to the injected
 *       storage port (key crud:formDraft:<id>); a successful submit clears it; on open a stored draft
 *       is read and (confirm accepted) restored via setFormData. All IO at the effect boundary.
 *   (3) custom buttons — form.buttons project through to form.customButtons (opaque onClick refs).
 *   (4) wrapper passthrough — form.wrapper props surface on form.wrapper; wrapper.title overrides.
 */
import { describe, expect, it, vi } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import type { FormDraftStoragePort } from '../src/support/formDraftEffects';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await tick();
};

interface Row {
  id: number;
  name: string;
}

function fakeStorage(seed: Record<string, string> = {}): FormDraftStoragePort & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

// ───────────────────────────── (1) dirty tracking ─────────────────────────────
describe('crud.remove-wrapper — dirty tracking (group B)', () => {
  function makeStore() {
    return createCrudStore<Row>({
      crudOptions: {
        request: { addRequest: vi.fn(async () => ({ id: 9 })) },
        columns: { id: { title: 'ID', form: { show: false } }, name: { title: 'Name' } },
        form: { wrapper: { saveRemind: true } },
      },
    });
  }

  it('a freshly-opened form is not dirty', async () => {
    const store = makeStore();
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'alice' }, index: null }));
    await settle();
    expect(store.viewModel().form.dirty).toBe(false);
  });

  it('editing a field makes the form dirty; restoring the value clears it', async () => {
    const store = makeStore();
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'alice' }, index: null }));
    await settle();

    store.dispatch(I.setFormField('name', 'alice-edited'));
    await settle();
    expect(store.viewModel().form.dirty).toBe(true);

    store.dispatch(I.setFormField('name', 'alice'));
    await settle();
    expect(store.viewModel().form.dirty).toBe(false);
  });

  it('initial snapshot is captured on open (state.form.initial mirrors the opened data)', async () => {
    const store = makeStore();
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'bob' }, index: null }));
    await settle();
    expect(store.state().form.initial).toEqual({ name: 'bob' });
  });
});

// ───────────────────────────── (2) saveDraft ─────────────────────────────
describe('crud.remove-wrapper — saveDraft persistence (group B)', () => {
  function makeDraftStore(storage: FormDraftStoragePort) {
    return createCrudStore<Row>({
      crudOptions: {
        request: { addRequest: vi.fn(async () => ({ id: 9 })) },
        table: { id: 'draft-demo' },
        columns: { id: { title: 'ID', form: { show: false } }, name: { title: 'Name' } },
        form: { wrapper: { saveDraft: true } },
      },
      storage,
    });
  }

  it('editing a field persists the form data to storage under crud:formDraft:<id>', async () => {
    const storage = fakeStorage();
    const store = makeDraftStore(storage);
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: '' }, index: null }));
    await settle();

    store.dispatch(I.setFormField('name', 'wip'));
    await settle();
    expect(storage.data['crud:formDraft:draft-demo']).toBeDefined();
    expect(JSON.parse(storage.data['crud:formDraft:draft-demo'])).toMatchObject({ name: 'wip' });
  });

  it('a successful submit clears the stored draft', async () => {
    const storage = fakeStorage({ 'crud:formDraft:draft-demo': JSON.stringify({ name: 'wip' }) });
    const store = makeDraftStore(storage);
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'final' }, index: null }));
    await settle();

    store.dispatch(I.doSubmit());
    await settle();
    expect(store.state().form.open).toBe(false); // submitted
    expect('crud:formDraft:draft-demo' in storage.data).toBe(false); // draft cleared
  });

  it('on open, a stored draft is restored (confirm accepted) via setFormData', async () => {
    const storage = fakeStorage({ 'crud:formDraft:draft-demo': JSON.stringify({ name: 'restored' }) });
    // a UI port whose confirm always accepts → the draft restore proceeds.
    const ui = { confirm: vi.fn(async () => true), notify: vi.fn() };
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        table: { id: 'draft-demo' },
        columns: { id: { title: 'ID', form: { show: false } }, name: { title: 'Name' } },
        form: { wrapper: { saveDraft: true } },
      },
      storage,
      ui,
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: '' }, index: null }));
    await settle();

    expect(ui.confirm).toHaveBeenCalledTimes(1); // restore confirm popped
    expect(store.state().form.form).toMatchObject({ name: 'restored' }); // draft applied
    // the restored draft becomes the new dirty baseline.
    expect(store.viewModel().form.dirty).toBe(false);
  });

  it('on open, a declined restore leaves the form as opened (draft kept in storage)', async () => {
    const storage = fakeStorage({ 'crud:formDraft:draft-demo': JSON.stringify({ name: 'restored' }) });
    const ui = { confirm: vi.fn(async () => false), notify: vi.fn() };
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        table: { id: 'draft-demo' },
        columns: { id: { title: 'ID', form: { show: false } }, name: { title: 'Name' } },
        form: { wrapper: { saveDraft: true } },
      },
      storage,
      ui,
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'opened' }, index: null }));
    await settle();

    expect(ui.confirm).toHaveBeenCalledTimes(1);
    expect(store.state().form.form).toMatchObject({ name: 'opened' }); // NOT restored
    expect(storage.data['crud:formDraft:draft-demo']).toBeDefined(); // draft still kept
  });

  it('saveDraft off → editing does NOT persist anything', async () => {
    const storage = fakeStorage();
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        table: { id: 'draft-demo' },
        columns: { id: { title: 'ID', form: { show: false } }, name: { title: 'Name' } },
        // no form.wrapper.saveDraft
      },
      storage,
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: '' }, index: null }));
    await settle();
    store.dispatch(I.setFormField('name', 'wip'));
    await settle();
    expect(Object.keys(storage.data)).toHaveLength(0);
  });
});

// ───────────────────────────── (3) custom buttons ─────────────────────────────
describe('crud.remove-wrapper — custom footer buttons (group B)', () => {
  it('form.buttons project through to form.customButtons (default buttons preserved)', async () => {
    const onClick = vi.fn();
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: { name: { title: 'Name' } },
        form: { buttons: [{ text: '保存并继续', type: 'success', onClick }] },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'x' }, index: null }));
    await settle();

    const vm = store.viewModel().form;
    // defaults still present (cancel + ok)
    expect(vm.buttons.map((b) => b.action)).toEqual(['cancel', 'submit']);
    // the custom button is projected with a stable key and its opaque onClick fn ref.
    expect(vm.customButtons).toHaveLength(1);
    expect(vm.customButtons[0].text).toBe('保存并继续');
    expect(vm.customButtons[0].onClick).toBe(onClick); // passed by reference, not called
    expect(onClick).not.toHaveBeenCalled();
  });

  it('no form.buttons → customButtons is empty (default footer only)', async () => {
    const store = createCrudStore<Row>({
      crudOptions: { request: {}, columns: { name: { title: 'Name' } } },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { name: 'x' }, index: null }));
    await settle();
    expect(store.viewModel().form.customButtons).toEqual([]);
  });
});

// ───────────────────────────── (4) wrapper passthrough ─────────────────────────────
describe('crud.remove-wrapper — wrapper passthrough (group B)', () => {
  it('wrapper props (fullscreen/draggable/inner) surface on form.wrapper', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: { name: { title: 'Name' } },
        form: { wrapper: { draggable: true, fullscreen: true, inner: true, width: '60%' } },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: {}, index: null }));
    await settle();
    expect(store.viewModel().form.wrapper).toMatchObject({
      draggable: true,
      fullscreen: true,
      inner: true,
      width: '60%',
    });
  });

  it('wrapper.title overrides the derived dialog title', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: { name: { title: 'Name' } },
        form: { wrapper: { title: '自定义标题' } },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: {}, index: null }));
    await settle();
    expect(store.viewModel().form.title).toBe('自定义标题');
  });
});
