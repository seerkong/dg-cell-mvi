/**
 * Layout variants — P2, capability crud.layout-variants.
 * Acceptance source: behavior_deltas/crud.layout-variants/delta.xml (T2.1-AC1).
 *
 * Two pure additive contract/projector concerns (no reducer change — render mode + outer container
 * are projection/view concerns):
 *   (1) table.mode ('table' default | 'virtual' | 'card') — normalized in optionsBuild, exposed on
 *       `vm.table.mode`. `mode` is NOT a native el-table prop, so it must be EXCLUDED from the
 *       table.nativeProps passthrough (it must not leak onto <el-table>).
 *   (2) container — a passthrough bag for the outer wrapper (height/class/style/...), normalized to
 *       `config.container` (null when unset) and exposed on `vm.container`.
 *
 * No-regression Gate: with table.mode unset, the table binding is byte-equivalent to before
 * (mode === 'table', no container, nativeProps unaffected, the SHARED resolved column list intact).
 */
import { describe, expect, it } from 'vitest';

import { createCrudStore } from '../src/contract/store';
import { buildNormalizedOptions } from '../src/support/optionsBuild';
import { createInitialCrudState } from '../src/contract/state';
import { projectCrudBinding } from '../src/logic/projectors';

interface Row {
  id: number;
  name: string;
  age: number;
  city: string;
}

function fourColOptions() {
  return {
    request: {},
    columns: {
      id: { title: 'ID', column: { width: 70 } },
      name: { title: 'Name' },
      age: { title: 'Age', type: 'number' },
      city: { title: 'City' },
    },
  };
}

// ───────────────────────────── (1) table.mode normalization + projection ─────────────────────────────
describe('crud.layout-variants — table.mode (normalize + project)', () => {
  it('defaults to "table" when table.mode is unset', () => {
    const config = buildNormalizedOptions<Row>(fourColOptions());
    expect(config.table.mode).toBe('table');

    const binding = projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config);
    expect(binding.table.mode).toBe('table');
  });

  it('carries the configured mode ("virtual") onto config + binding', () => {
    const config = buildNormalizedOptions<Row>({
      ...fourColOptions(),
      table: { mode: 'virtual' },
    });
    expect(config.table.mode).toBe('virtual');

    const binding = projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config);
    expect(binding.table.mode).toBe('virtual');
  });

  it('carries the configured mode ("card") onto config + binding', () => {
    const config = buildNormalizedOptions<Row>({
      ...fourColOptions(),
      table: { mode: 'card' },
    });
    expect(config.table.mode).toBe('card');
    expect(projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config).table.mode).toBe(
      'card',
    );
  });

  it('mode is NOT leaked into table.nativeProps (not a native el-table prop)', () => {
    const config = buildNormalizedOptions<Row>({
      ...fourColOptions(),
      table: { mode: 'virtual', stripe: true, border: true },
    });
    // mode is framework-owned → excluded from the el-table passthrough; the genuine native keys stay.
    expect(config.table.nativeProps).toEqual({ stripe: true, border: true });
    expect(config.table.nativeProps).not.toHaveProperty('mode');

    const binding = projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config);
    expect(binding.table.nativeProps).not.toHaveProperty('mode');
  });

  it('the resolved column list is SHARED across modes (same shape regardless of mode)', () => {
    const base = buildNormalizedOptions<Row>(fourColOptions());
    const virtual = buildNormalizedOptions<Row>({ ...fourColOptions(), table: { mode: 'virtual' } });
    const card = buildNormalizedOptions<Row>({ ...fourColOptions(), table: { mode: 'card' } });
    const cols = (cfg: typeof base) =>
      projectCrudBinding<Row>(createInitialCrudState<Row>(cfg.seed), cfg).table.columns.map((c) => ({
        key: c.key,
        title: c.title,
        width: c.width,
      }));
    expect(cols(virtual)).toEqual(cols(base));
    expect(cols(card)).toEqual(cols(base));
  });
});

// ───────────────────────────── (2) container passthrough ─────────────────────────────
describe('crud.layout-variants — container passthrough', () => {
  it('is null when unset (no container on config / binding)', () => {
    const config = buildNormalizedOptions<Row>(fourColOptions());
    expect(config.container).toBeNull();
    expect(projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config).container).toBeNull();
  });

  it('passes the container bag through (height/class/style/extra keys)', () => {
    const container = {
      height: '520px',
      class: 'my-wrap',
      style: { padding: '8px' },
      'data-x': 'y',
    };
    const config = buildNormalizedOptions<Row>({ ...fourColOptions(), container });
    expect(config.container).toEqual(container);

    const binding = projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config);
    expect(binding.container).toEqual(container);
  });

  it('accepts a numeric height', () => {
    const config = buildNormalizedOptions<Row>({ ...fourColOptions(), container: { height: 600 } });
    expect(config.container).toEqual({ height: 600 });
    expect(projectCrudBinding<Row>(createInitialCrudState<Row>(config.seed), config).container).toEqual({
      height: 600,
    });
  });
});

// ───────────────────────────── (3) no-regression: unset mode ≡ status quo ─────────────────────────────
describe('crud.layout-variants — no-regression (unset mode is byte-equivalent)', () => {
  it('an unset-mode store projects mode "table", null container, and unchanged table binding', () => {
    const store = createCrudStore<Row>({ crudOptions: fourColOptions() });
    const vm = store.viewModel();
    // the render-mode selector defaults to the existing el-table path; no container wrapper.
    expect(vm.table.mode).toBe('table');
    expect(vm.container).toBeNull();
    // the existing table binding is intact (columns/rowKey/nativeProps all as before).
    expect(vm.table.columns.map((c) => c.key)).toEqual(['id', 'name', 'age', 'city']);
    expect(vm.table.rowKey).toBe('id');
    expect(vm.table.nativeProps).toEqual({});
  });
});
