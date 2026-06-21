/**
 * Render hooks + field linkage — P4, capability crud.render-hooks. Acceptance source:
 * behavior_deltas/crud.render-hooks/delta.xml.
 *
 * The render hooks themselves (cellRender / form-item render / prefix / suffix / top / bottom /
 * conditionalRender) emit framework VNodes, so they are CALLED in the Vue layer (DgCell / DgFormItem)
 * — never in the agnostic crud package. Here we test (a) the only non-VNode logic, the `valueChange`
 * linkage and its loop guard, exercised through the real store loop, and (b) that the projector
 * passes the hook fn refs through by reference (it must not call them).
 *
 * valueChange is MVI-pure: the `setFormField` reducer stays a plain write; the linkage runs in the
 * `crud.fx.valueChange` effect (the impure boundary), which reads the live form, runs the handler,
 * and re-dispatches `setFormField(..., fromValueChange:true)` for each set field. `fromValueChange`
 * is the loop guard — a write produced by a valueChange does NOT re-trigger valueChange (one level).
 */
import { describe, expect, it, vi } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectCrudBinding } from '../src/logic/projectors';
import { projectFormColumns } from '../src/logic/projectors/form';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
// the valueChange effect re-dispatches setFormField (each a feedback hop); give the loop room.
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await tick();
};

interface Row {
  id: number;
  province?: string;
  city?: string;
}

// ───────────────────────────── (1) valueChange linkage ─────────────────────────────
describe('crud.render-hooks — valueChange linkage (delta: value-change-linkage)', () => {
  it('changing field A runs its valueChange.handle which setValue(B) → B lands in form data', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          province: {
            title: 'Province',
            type: 'select',
            // changing 省份 clears 城市 (classic cascading linkage).
            valueChange: ({ setValue }) => setValue('city', ''),
          },
          city: { title: 'City', type: 'select' },
        },
      },
    });

    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { province: 'bj', city: 'cy' }, index: null }));
    await settle();
    expect(store.state().form.form.city).toBe('cy');

    // change province → valueChange fires → city cleared via setValue.
    store.dispatch(I.setFormField('province', 'sh'));
    await settle();
    expect(store.state().form.form.province).toBe('sh');
    expect(store.state().form.form.city).toBe('');
  });

  it('object form { handle } and a handler returning a plain object both set other fields', async () => {
    const store = createCrudStore<Row & { category?: string; price?: number }>({
      crudOptions: {
        request: {},
        columns: {
          category: {
            title: 'Category',
            type: 'select',
            // returning a plain object merges into the collected changes (alt. to setValue).
            valueChange: { handle: ({ value }) => ({ price: value === 'premium' ? 999 : 0 }) },
          },
          price: { title: 'Price', type: 'number' },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { category: 'basic', price: 0 }, index: null }));
    await settle();

    store.dispatch(I.setFormField('category', 'premium'));
    await settle();
    expect(store.state().form.form.price).toBe(999);
  });
});

// ───────────────────────────── (2) loop guard ─────────────────────────────
describe('crud.render-hooks — valueChange loop guard (delta: value-change-loop-guard)', () => {
  it('a setFormField carrying fromValueChange:true does NOT trigger valueChange (no cascade)', async () => {
    const handle = vi.fn(({ setValue }: any) => setValue('city', 'forced'));
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          province: { title: 'Province', type: 'select', valueChange: handle },
          city: { title: 'City', type: 'select' },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { province: 'bj', city: '' }, index: null }));
    await settle();
    handle.mockClear();

    // a write flagged fromValueChange:true (as the effect itself emits) must be ignored by valueChange.
    store.dispatch(I.setFormField('province', 'sh', true));
    await settle();
    expect(handle).not.toHaveBeenCalled(); // loop guard held — no handler run, no cascade.
    expect(store.state().form.form.province).toBe('sh'); // but the reducer still wrote the field.
  });

  it('one normal change triggers the handler exactly once (set field B does not re-trigger)', async () => {
    const provinceVc = vi.fn(({ setValue }: any) => setValue('city', ''));
    const cityVc = vi.fn();
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          // city ALSO has a valueChange; the linkage-set write must NOT trigger it (one level only).
          province: { title: 'Province', type: 'select', valueChange: provinceVc },
          city: { title: 'City', type: 'select', valueChange: cityVc },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { province: 'bj', city: 'cy' }, index: null }));
    await settle();
    provinceVc.mockClear();
    cityVc.mockClear();

    store.dispatch(I.setFormField('province', 'sh'));
    await settle();
    expect(provinceVc).toHaveBeenCalledTimes(1);
    expect(cityVc).not.toHaveBeenCalled(); // the fromValueChange write to city did not cascade.
    expect(store.state().form.form.city).toBe('');
  });
});

// ───────────────────────────── (3) immediate ─────────────────────────────
describe('crud.render-hooks — valueChange immediate (delta: value-change-immediate)', () => {
  it('immediate:true runs the handler on formOpened against the initial value', async () => {
    const handle = vi.fn(({ value, setValue }: any) => setValue('label', `picked:${value}`));
    const store = createCrudStore<Row & { type?: string; label?: string }>({
      crudOptions: {
        request: {},
        columns: {
          type: { title: 'Type', type: 'select', valueChange: { immediate: true, handle } },
          label: { title: 'Label' },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { type: 'a', label: '' }, index: null }));
    await settle();

    expect(handle).toHaveBeenCalledTimes(1);
    expect(store.state().form.form.label).toBe('picked:a');
  });

  it('a NON-immediate valueChange does NOT run on formOpened', async () => {
    const handle = vi.fn(({ setValue }: any) => setValue('label', 'x'));
    const store = createCrudStore<Row & { type?: string; label?: string }>({
      crudOptions: {
        request: {},
        columns: {
          type: { title: 'Type', type: 'select', valueChange: handle }, // bare fn → immediate:false
          label: { title: 'Label' },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { type: 'a', label: '' }, index: null }));
    await settle();
    expect(handle).not.toHaveBeenCalled();
    expect(store.state().form.form.label).toBe('');
  });
});

// ───────────────────────────── (4) projector passthrough ─────────────────────────────
describe('crud.render-hooks — projector passes hook fn refs through by reference', () => {
  it('the table-column projector carries column.cellRender by reference (does not call it)', () => {
    const cellRender = vi.fn((scope: any) => `tag:${scope.value}`);
    const config = buildNormalizedOptions<Row>({
      columns: {
        status: { title: 'Status', column: { cellRender } },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const col = binding.table.columns.find((c) => c.key === 'status');
    expect(col).toBeDefined();
    expect(col!.cellRender).toBe(cellRender); // same ref
    expect(cellRender).not.toHaveBeenCalled(); // projector must NOT call it (no VNodes in agnostic pkg)
  });

  it('the form-item projector carries render/prefixRender/suffixRender/conditionalRender by reference', () => {
    const render = vi.fn();
    const prefixRender = vi.fn();
    const suffixRender = vi.fn();
    const topRender = vi.fn();
    const bottomRender = vi.fn();
    const match = vi.fn(() => false);
    const condRender = vi.fn();
    const config = buildNormalizedOptions<Row>({
      columns: {
        a: { title: 'A', form: { render, prefixRender, suffixRender, topRender, bottomRender } },
        b: { title: 'B', form: { conditionalRender: { match, render: condRender } } },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const items = projectFormColumns(state, config, 'add');
    const a = items.find((i) => i.key === 'a');
    const b = items.find((i) => i.key === 'b');
    expect(a!.render).toBe(render);
    expect(a!.prefixRender).toBe(prefixRender);
    expect(a!.suffixRender).toBe(suffixRender);
    expect(a!.topRender).toBe(topRender);
    expect(a!.bottomRender).toBe(bottomRender);
    expect(b!.conditionalRender).toBeDefined();
    expect(b!.conditionalRender!.match).toBe(match);
    expect(b!.conditionalRender!.render).toBe(condRender);
    // none of the render hooks (nor conditionalRender.match) are evaluated in the projector.
    expect(render).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
  });
});
