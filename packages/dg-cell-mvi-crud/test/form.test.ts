/**
 * Form slice unit tests — the pure reducer/projector/support fns (Stage 3).
 *
 * Exercised directly (no store) so they run independent of orchestrator wiring: reduceForm folds,
 * projectForm view shape, validateForm rules, and the value transforms + initial-form build.
 */
import { describe, expect, it } from 'vitest';

import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import type { CrudState } from '../src/contract/state';
import * as I from '../src/contract/events';
import { reduceForm } from '../src/logic/reducers/form';
import { projectForm, pickFormColumns } from '../src/logic/projectors/form';
import { validateForm } from '../src/support/validate';
import { doValueBuilder, doValueResolve, buildInitialForm } from '../src/support/valueTransforms';

function makeConfig(extra: any = {}) {
  return buildNormalizedOptions({
    request: {},
    columns: {
      id: { title: 'ID', form: { show: false } },
      name: {
        title: 'Name',
        type: 'text',
        form: { rules: [{ required: true, message: 'name required' }] },
      },
      role: {
        title: 'Role',
        type: 'select',
        form: { value: 'user', component: { name: 'el-select', clearable: true } },
      },
      remark: { title: 'Remark', type: 'textarea', addForm: { show: false } },
      ...extra.columns,
    },
    ...extra,
  });
}

function freshState(config: ReturnType<typeof makeConfig>): CrudState {
  return createInitialCrudState(config.seed);
}

describe('validateForm (pure)', () => {
  const cols = [
    { key: 'name', title: 'Name', rules: [{ required: true, message: 'name required' }] },
    { key: 'age', title: 'Age', rules: [{ min: 18, message: 'too young' }, { max: 99 }] },
    { key: 'code', title: 'Code', rules: [{ pattern: /^[A-Z]+$/, message: 'caps only' }] },
    { key: 'even', title: 'Even', rules: [{ validator: (_r: any, v: any) => v % 2 === 0, message: 'must be even' }] },
  ];

  it('flags required empties', () => {
    const { valid, errors } = validateForm({ age: 20, code: 'AB', even: 2 }, cols);
    expect(valid).toBe(false);
    expect(errors.name).toBe('name required');
  });

  it('checks numeric min/max', () => {
    expect(validateForm({ name: 'x', age: 12, code: 'A', even: 2 }, cols).errors.age).toBe('too young');
    expect(validateForm({ name: 'x', age: 120, code: 'A', even: 2 }, cols).errors.age).toContain('99');
  });

  it('checks pattern', () => {
    expect(validateForm({ name: 'x', age: 20, code: 'ab1', even: 2 }, cols).errors.code).toBe('caps only');
  });

  it('runs sync custom validator', () => {
    expect(validateForm({ name: 'x', age: 20, code: 'A', even: 3 }, cols).errors.even).toBe('must be even');
  });

  it('passes when all rules satisfied', () => {
    expect(validateForm({ name: 'x', age: 20, code: 'A', even: 2 }, cols)).toEqual({ valid: true, errors: {} });
  });

  it('only `required` guards presence — empty optional fields skip other rules', () => {
    // age empty: min/max skipped because not required
    expect(validateForm({ name: 'x', code: 'A', even: 2 }, cols).valid).toBe(true);
  });
});

describe('value transforms (pure)', () => {
  it('doValueBuilder runs over rows and writes results back', () => {
    const config = buildNormalizedOptions({
      columns: { tags: { valueBuilder: ({ value }: any) => (value ? String(value).split(',') : []) } },
    });
    const rows = [{ tags: 'a,b,c' }];
    doValueBuilder(rows, config.columns);
    expect(rows[0].tags).toEqual(['a', 'b', 'c']);
  });

  it('doValueResolve runs over the form and writes results back', () => {
    const config = buildNormalizedOptions({
      columns: { tags: { valueResolve: ({ value }: any) => (Array.isArray(value) ? value.join(',') : value) } },
    });
    const form = { tags: ['a', 'b'] };
    doValueResolve(form, config.columns);
    expect(form.tags).toBe('a,b');
  });

  it('buildInitialForm seeds defaults, overlays row, then valueBuilds', () => {
    const config = makeConfig();
    const defaults = pickFormColumns(config, 'edit').map((fc) => ({ key: fc.key, value: fc.item.value }));
    const form = buildInitialForm(defaults, config.columns, { id: 7, name: 'amy' });
    expect(form).toMatchObject({ id: 7, name: 'amy', role: 'user' }); // role default kept, row overlaid
  });
});

describe('pickFormColumns (per-mode, show filtering, merge)', () => {
  it('drops form.show:false columns and applies mode overrides', () => {
    const config = makeConfig();
    const addKeys = pickFormColumns(config, 'add').map((c) => c.key);
    const editKeys = pickFormColumns(config, 'edit').map((c) => c.key);
    expect(addKeys).not.toContain('id'); // form.show:false
    expect(addKeys).not.toContain('remark'); // addForm.show:false
    expect(editKeys).toContain('remark'); // edit keeps it
    expect(addKeys).toEqual(['name', 'role']);
  });
});

describe('projectForm (view shape)', () => {
  it('derives component defaults per type + view disables + buttons per mode', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = reduceForm(s, I.formOpened({ mode: 'add', row: null, initialForm: { role: 'user' }, index: null }), config).state;
    const vmAdd = projectForm(s, config);
    expect(vmAdd.open).toBe(true);
    expect(vmAdd.title).toContain('新增');
    const byKey = Object.fromEntries(vmAdd.columns.map((c) => [c.key, c]));
    expect(byKey.name.component.name).toBe('el-input'); // text default
    expect(byKey.role.component.name).toBe('el-select'); // explicit
    expect(byKey.role.component.clearable).toBe(true); // user props merged
    expect(vmAdd.buttons.map((b) => b.action)).toEqual(['cancel', 'submit']);

    // view mode: ok button hidden, components disabled
    let v = freshState(config);
    v = reduceForm(v, I.formOpened({ mode: 'view', row: { id: 1, name: 'a' }, initialForm: { name: 'a' }, index: 0 }), config).state;
    const vmView = projectForm(v, config);
    expect(vmView.buttons.map((b) => b.action)).toEqual(['cancel']);
    expect(vmView.columns.every((c) => c.component.disabled === true)).toBe(true);
  });

  it('ok button shows loading while submitting', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = reduceForm(s, I.formOpened({ mode: 'add', row: null, initialForm: {}, index: null }), config).state;
    s = { ...s, form: { ...s.form, submitStatus: 'submitting' } };
    const ok = projectForm(s, config).buttons.find((b) => b.action === 'submit');
    expect(ok?.loading).toBe(true);
    expect(projectForm(s, config).loading).toBe(true);
  });
});

describe('reduceForm (folds + effects)', () => {
  it('openAdd (no infoRequest) emits a triggerFormOpened effect with a built initialForm', () => {
    const config = makeConfig();
    const r = reduceForm(freshState(config), I.openAdd(), config);
    expect(r.state.form.mode).toBe('add');
    expect(r.state.form.open).toBe(false); // pending until formOpened
    expect(r.effects).toHaveLength(1);
    expect(r.effects![0].type).toBe('crud.fx.triggerFormOpened');
    const payload = r.effects![0].payload as any;
    expect(payload.mode).toBe('add');
    expect(payload.initialForm.role).toBe('user'); // default seeded
  });

  it('openEdit WITH infoRequest emits infoRequest (not formOpened) and stays closed', () => {
    const config = makeConfig({ request: { infoRequest: async () => ({}) } });
    let s = freshState(config);
    s = { ...s, list: { ...s.list, rows: [{ id: 1, name: 'a' }] } };
    const r = reduceForm(s, I.openEdit({ index: 0 }), config);
    expect(r.effects![0].type).toBe('crud.fx.infoRequest');
    expect((r.effects![0].payload as any).row).toEqual({ id: 1, name: 'a' });
    expect(r.state.form.open).toBe(false);
  });

  it('openEdit resolves row from list by index when no row passed', () => {
    const config = makeConfig(); // no infoRequest -> builds inline
    let s = freshState(config);
    s = { ...s, list: { ...s.list, rows: [{ id: 9, name: 'z' }] } };
    const r = reduceForm(s, I.openEdit({ index: 0 }), config);
    expect(r.state.form.row).toEqual({ id: 9, name: 'z' });
    expect((r.effects![0].payload as any).initialForm.name).toBe('z');
  });

  it('formOpened opens the dialog and clones initialForm into form', () => {
    const config = makeConfig();
    const r = reduceForm(
      freshState(config),
      I.formOpened({ mode: 'edit', row: { id: 1 }, initialForm: { id: 1, name: 'a' }, index: 0 }),
      config,
    );
    expect(r.state.form.open).toBe(true);
    expect(r.state.form.form).toEqual({ id: 1, name: 'a' });
    expect(r.state.form.form).not.toBe(r.state.form.initialForm); // cloned, not aliased
  });

  it('setFormField sets a (nested) field on a fresh form object', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, form: { name: 'a' } } };
    const r = reduceForm(s, I.setFormField('name', 'b'), config);
    expect(r.state.form.form.name).toBe('b');
    expect(r.state.form.form).not.toBe(s.form.form); // immutable
  });

  it('doSubmit with invalid form sets errors + submitStatus=error, no effect', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, mode: 'add', open: true, form: { role: 'user' } } }; // name missing
    const r = reduceForm(s, I.doSubmit(), config);
    expect(r.state.form.valid).toBe(false);
    expect(r.state.form.errors.name).toBe('name required');
    expect(r.state.form.submitStatus).toBe('error');
    expect(r.effects).toHaveLength(0);
  });

  it('doSubmit (add, valid) emits submitChain with valueResolved form and submitting status', () => {
    // Post-P1: the reducer validates sync rules then hands off to the submitChain effect (which runs
    // the hook chain + async validation + the actual add/editRequest). It no longer emits the
    // request effect directly.
    const config = buildNormalizedOptions({
      request: {},
      columns: {
        name: { title: 'Name', form: { rules: [{ required: true }] } },
        tags: { title: 'Tags', valueResolve: ({ value }: any) => (Array.isArray(value) ? value.join(',') : value) },
      },
    });
    let s = createInitialCrudState(config.seed);
    s = { ...s, form: { ...s.form, mode: 'add', open: true, form: { name: 'a', tags: ['x', 'y'] } } };
    const r = reduceForm(s, I.doSubmit(), config);
    expect(r.state.form.submitStatus).toBe('submitting');
    expect(r.effects![0].type).toBe('crud.fx.submitChain');
    expect((r.effects![0].payload as any).mode).toBe('add');
    expect((r.effects![0].payload as any).form.tags).toBe('x,y'); // resolved
  });

  it('doSubmit (edit, valid) emits submitChain carrying the row + mode', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, mode: 'edit', open: true, row: { id: 3 }, form: { id: 3, name: 'a' } } };
    const r = reduceForm(s, I.doSubmit(), config);
    expect(r.effects![0].type).toBe('crud.fx.submitChain');
    expect((r.effects![0].payload as any).mode).toBe('edit');
    expect((r.effects![0].payload as any).row).toEqual({ id: 3 });
  });

  it('doSubmit in view mode is a no-op', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, mode: 'view', open: true, form: {} } };
    const r = reduceForm(s, I.doSubmit(), config);
    expect(r.effects).toHaveLength(0);
    expect(r.state).toBe(s);
  });

  it('submitSucceeded (add) closes form + emits triggerRefresh{goFirstPage} + success notify', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, mode: 'add', open: true, submitStatus: 'submitting' } };
    const r = reduceForm(s, I.submitSucceeded({ res: { id: 1 }, mode: 'add' }), config);
    expect(r.state.form.open).toBe(false);
    expect(r.state.form.submitStatus).toBe('saved');
    const refresh = r.effects!.find((e) => e.type === 'crud.fx.triggerRefresh');
    expect((refresh!.payload as any).goFirstPage).toBe(true);
    const notify = r.effects!.find((e) => e.type === 'crud.fx.notify');
    expect((notify!.payload as any).kind).toBe('success');
  });

  it('submitSucceeded (edit) refreshes without jumping to first page', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, mode: 'edit', open: true } };
    const r = reduceForm(s, I.submitSucceeded({ res: {}, mode: 'edit' }), config);
    const refresh = r.effects!.find((e) => e.type === 'crud.fx.triggerRefresh');
    expect((refresh!.payload as any).goFirstPage).toBe(false);
  });

  it('submitFailed records error and resets submit status', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, submitStatus: 'submitting' } };
    const r = reduceForm(s, I.submitFailed({ error: 'boom' }), config);
    expect(r.state.form.submitStatus).toBe('error');
    expect(r.state.form.submitError).toBe('boom');
  });

  it('closeForm just closes', () => {
    const config = makeConfig();
    let s = freshState(config);
    s = { ...s, form: { ...s.form, open: true } };
    expect(reduceForm(s, I.closeForm(), config).state.form.open).toBe(false);
  });
});
