/**
 * Dynamic config (compute / asyncCompute / DynamicType) — P2, capability crud.compute.
 * Acceptance source: behavior_deltas/crud.compute/delta.xml.
 *
 * Sync compute (`compute(({form/row}) => …)`) is a PURE deep-walk resolved where the live scope is
 * known — the projector for form items (scope = the live form) and DgCell per-row for table cells
 * (scope = {row,index,value}); see support/compute.ts `resolveCompute`. Async compute
 * (`asyncCompute({watch, asyncFn})`) needs IO, so it resolves at the effect boundary: formOpened /
 * setFormField emit `resolveAsyncCompute`, the effect runs `asyncFn` when the watched value changed,
 * and `asyncComputeResolved` stores the result in `state.computeAsync[key]` for the projector to read.
 *
 * Exercised store-level (createCrudStore + dispatch + await tick) where the loop matters; the table
 * sync-compute case asserts the projector passes the marker through + DgCell-equivalent resolution.
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectCrudBinding } from '../src/logic/projectors';
import { compute, asyncCompute, resolveCompute, isAsyncCompute } from '../src/support/compute';
import * as I from '../src/contract/events';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await tick();
};

interface Row {
  id: number;
  name: string;
  type?: string;
}

// ───────────────────────────── (1) sync compute — form item ─────────────────────────────
describe('crud.compute — sync compute on a form item (delta: form-item-disabled-by-compute)', () => {
  it('component.disabled = compute(({form}) => form.locked) toggles with the locked field', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          locked: { title: 'Locked', type: 'switch' },
          name: {
            title: 'Name',
            form: {
              // disabled when the sibling `locked` field is true
              component: { name: 'el-input', disabled: compute(({ form }) => form?.locked === true) },
            },
          },
        },
      },
    });

    // open an add form with locked=false → name enabled
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { locked: false, name: '' }, index: null }));
    await settle();
    let nameItem = store.viewModel().form.columns.find((c) => c.key === 'name');
    expect(nameItem?.component.disabled).toBe(false);

    // flip locked → name disabled (compute re-evaluates against the live form on the next projection)
    store.dispatch(I.setFormField('locked', true));
    await settle();
    nameItem = store.viewModel().form.columns.find((c) => c.key === 'name');
    expect(nameItem?.component.disabled).toBe(true);
  });

  it('form-item show = compute(...) hides the item when the compute is false', async () => {
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          type: { title: 'Type', type: 'text' },
          vipNote: {
            title: 'VIP Note',
            // only shown for vip forms
            form: { show: compute(({ form }) => form?.type === 'vip') as unknown as boolean },
          },
        },
      },
    });
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { type: 'normal' }, index: null }));
    await settle();
    expect(store.viewModel().form.columns.find((c) => c.key === 'vipNote')).toBeUndefined();

    store.dispatch(I.setFormField('type', 'vip'));
    await settle();
    expect(store.viewModel().form.columns.find((c) => c.key === 'vipNote')).toBeDefined();
  });
});

// ───────────────────────────── (2) sync compute — table cell per-row ─────────────────────────────
describe('crud.compute — sync compute on a table column cell (delta: column-show-by-compute)', () => {
  it('the projector passes column compute markers through (does not statically resolve them)', () => {
    const config = buildNormalizedOptions<Row>({
      columns: {
        name: { title: 'Name' },
        secret: {
          title: 'Secret',
          // a column whose cell is hidden for non-vip rows
          column: { show: compute(({ row }) => row?.type === 'vip') as unknown as boolean },
        },
      },
    });
    const state = createInitialCrudState<Row>(config.seed);
    const binding = projectCrudBinding<Row>(state, config);
    const secretCol = binding.table.columns.find((c) => c.key === 'secret');
    // column survives the render filter (a ComputeValue is not === false) and carries the marker.
    expect(secretCol).toBeDefined();
    expect(isAsyncCompute(secretCol!.props.show)).toBe(false);
    // resolving per-row (the DgCell boundary) hides for non-vip, shows for vip.
    const vip = resolveCompute(secretCol!.props, { row: { id: 1, name: 'a', type: 'vip' } });
    const normal = resolveCompute(secretCol!.props, { row: { id: 2, name: 'b', type: 'x' } });
    expect(vip.show).toBe(true);
    expect(normal.show).toBe(false);
  });
});

// ───────────────────────────── (3) async compute — options on a watched key ─────────────────────────────
describe('crud.compute — async compute options on a watched key (delta: async-options)', () => {
  it('opening + setting the watched field resolves asyncFn, stores it, and projects it as options', async () => {
    const calls: Array<{ value: any }> = [];
    const cityByProvince: Record<string, any[]> = {
      bj: [{ value: 'cy', label: '朝阳' }, { value: 'hd', label: '海淀' }],
      sh: [{ value: 'pd', label: '浦东' }, { value: 'hp', label: '黄浦' }],
    };
    const store = createCrudStore<Row>({
      crudOptions: {
        request: {},
        columns: {
          province: { title: 'Province', type: 'select' },
          city: {
            title: 'City',
            type: 'select',
            form: {
              component: {
                name: 'el-select',
                // options fetched whenever the watched `province` changes
                options: asyncCompute({
                  watch: ({ form }) => form?.province,
                  asyncFn: async (province: any) => {
                    calls.push({ value: province });
                    return cityByProvince[province] ?? [];
                  },
                  defaultValue: [],
                }),
              },
            },
          },
        },
      },
    });

    // open with no province → defaultValue ([]), asyncFn not yet meaningfully resolved
    store.dispatch(I.formOpened({ mode: 'add', row: null, initialForm: { province: '', city: '' }, index: null }));
    await settle();
    let cityItem = store.viewModel().form.columns.find((c) => c.key === 'city');
    expect(cityItem?.component.options).toEqual([]);

    // set province=bj → effect runs asyncFn(bj), result flows back, projected as options
    store.dispatch(I.setFormField('province', 'bj'));
    await settle();
    expect(store.state().computeAsync.city?.value).toEqual(cityByProvince.bj);
    cityItem = store.viewModel().form.columns.find((c) => c.key === 'city');
    expect(cityItem?.component.options).toEqual(cityByProvince.bj);

    // change province=sh → re-resolves
    store.dispatch(I.setFormField('province', 'sh'));
    await settle();
    expect(store.state().computeAsync.city?.value).toEqual(cityByProvince.sh);

    // setting an UNwatched field must not re-trigger asyncFn (no infinite loop / no extra call).
    const before = calls.length;
    store.dispatch(I.setFormField('city', 'pd'));
    await settle();
    expect(calls.length).toBe(before);
  });
});
