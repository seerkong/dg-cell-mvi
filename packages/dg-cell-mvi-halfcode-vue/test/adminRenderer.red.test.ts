import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createApp, defineComponent, h, type PropType } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  resolveUnitConfigRef,
  type HalfcodeAppRuntime,
  type HalfcodeRef,
  type HalfcodeUnitBundleResolver,
  type LoadedHalfcodeUnit,
  type MountedHalfcodeDataGraph,
} from 'dg-cell-mvi-halfcode-support';
import type {
  AdminShellRoutePlanV3,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';
import { CanonicalHalfcodeRenderer, type CanonicalComponentRegistry } from '../src';

const fixtureWorkspace = path.resolve(
  __dirname,
  '../../dg-cell-mvi-halfcode-support/test/fixtures/xnl-bundles',
);

const adminFixtures = [
  'basic-admin',
  'embedded-admin',
  'import-admin',
  'data-graph-admin',
] as const;

type AdminFixture = typeof adminFixtures[number];

interface MountedAdminFixture {
  appId: AdminFixture;
  runtime: HalfcodeAppRuntime;
}

function fixturePath(vfsPath: string): string {
  const normalized = path.posix.normalize(vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`);
  return path.join(fixtureWorkspace, normalized);
}

function fixtureResolver(): HalfcodeUnitBundleResolver {
  return {
    readFile(vfsPath) {
      try {
        return readFileSync(fixturePath(vfsPath), 'utf8');
      } catch {
        return null;
      }
    },
    isDir(vfsPath) {
      try {
        return statSync(fixturePath(vfsPath)).isDirectory();
      } catch {
        return false;
      }
    },
    readDir(vfsPath) {
      try {
        return readdirSync(fixturePath(vfsPath));
      } catch {
        return null;
      }
    },
  };
}

async function importUnitSymbol(
  unit: LoadedHalfcodeUnit,
  ref: HalfcodeRef | string,
): Promise<unknown> {
  const [relativePath, symbolName] = String(ref).replace(/^vfs:\/\//, '').split('#');
  if (!relativePath || !symbolName) throw new Error(`Invalid fixture symbol ref: ${ref}`);
  const module = await import(path.join(fixturePath(unit.path), relativePath));
  const symbol = (module as Record<string, unknown>)[symbolName];
  if (symbol === undefined) throw new Error(`Missing fixture export ${symbolName} in ${relativePath}`);
  return symbol;
}

async function createAdminRuntime(appId: AdminFixture): Promise<MountedAdminFixture> {
  const bundle = loadHalfcodeUnitBundle(fixtureResolver(), `vfs://@/${appId}/`, {
    baseDir: '/',
    workspaceRoot: '/',
    uiLibraries: ['elementPlus'],
  });
  expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), appId).toEqual([]);

  const runtime = await createHalfcodeAppRuntime(bundle, {
    resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
    resolveConfig: (ref, context) => resolveUnitConfigRef(context.unit, ref),
  });
  expect(Object.values(runtime.assemblies).flatMap((assembly) => assembly.diagnostics), appId).toEqual([]);
  return { appId, runtime };
}

function flattenRoutes(routes: readonly AdminShellRoutePlanV3[]): AdminShellRoutePlanV3[] {
  return routes.flatMap((route) => [route, ...flattenRoutes(route.children ?? [])]);
}

function planForRoute(runtime: HalfcodeAppRuntime, routeId: string): UnitRenderPlan {
  const route = flattenRoutes(runtime.plans.adminShellPlan.routes).find(
    (candidate) => candidate.id === routeId,
  );
  if (!route) throw new Error(`Route #${routeId} not found`);
  const plan = runtime.plans.renderPlans.find((candidate) => candidate.unitFqn === route.pageFqn);
  if (!plan) throw new Error(`Render plan for ${route.pageFqn} not found`);
  return plan;
}

const InspectorInput = defineComponent({
  name: 'InspectorInput',
  emits: ['input'],
  props: {
    placeholder: { type: String, required: false },
    clearable: { type: Boolean, required: false },
  },
  setup(props, { emit }) {
    return () => h('input', {
      'data-testid': 'input',
      'data-placeholder': props.placeholder ?? '',
      'data-clearable': String(props.clearable ?? false),
      onInput: (event: Event) => emit('input', (event.target as HTMLInputElement).value),
    });
  },
});

const InspectorSelect = defineComponent({
  name: 'InspectorSelect',
  props: {
    placeholder: { type: String, required: false },
    options: { type: Array as PropType<unknown[]>, required: false },
  },
  setup(props) {
    return () => h('select', {
      'data-testid': 'select',
      'data-placeholder': props.placeholder ?? '',
      'data-option-count': String(props.options?.length ?? 0),
    });
  },
});

const InspectorDataTable = defineComponent({
  name: 'InspectorDataTable',
  props: {
    rows: { type: Array as PropType<unknown[]>, required: false },
    summary: { type: Object as PropType<Record<string, unknown>>, required: false },
    columns: { type: Array as PropType<Array<{ field?: string; label?: string }>>, required: false },
  },
  setup(props) {
    return () => h('section', {
      'data-testid': 'data-table',
      'data-row-count': String(props.rows?.length ?? 0),
      'data-summary-total': String(props.summary?.total ?? ''),
      'data-columns': (props.columns ?? []).map((column) => column.label).join(','),
    });
  },
});

const InspectorStatisticGroup = defineComponent({
  name: 'InspectorStatisticGroup',
  props: {
    cards: { type: Array as PropType<Array<{ id?: string; label?: string; value?: unknown }>>, required: false },
  },
  setup(props) {
    return () => h('section', {
      'data-testid': 'statistic-group',
      'data-card-count': String(props.cards?.length ?? 0),
      'data-card-labels': (props.cards ?? []).map((card) => card.label ?? card.id).join(','),
    });
  },
});

const registry: CanonicalComponentRegistry = {
  resolve(identity) {
    if (identity === 'ElInput') return InspectorInput;
    if (identity === 'ElSelect') return InspectorSelect;
    if (identity === 'DataTable') return InspectorDataTable;
    if (identity === 'StatisticGroup') return InspectorStatisticGroup;
    return identity;
  },
};

async function renderRoute(appId: AdminFixture, routeId: string) {
  const fixture = await createAdminRuntime(appId);
  const plan = planForRoute(fixture.runtime, routeId);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(CanonicalHalfcodeRenderer, {
    plan,
    runtime: fixture.runtime,
    registry,
  });
  app.mount(target);
  return {
    fixture,
    target,
    unmount() {
      app.unmount();
      fixture.runtime.dispose();
      target.remove();
    },
  };
}

describe('canonical admin renderer red coverage', () => {
  it('loads the four real admin XNL bundles and their real TypeScript modules without fake plans', async () => {
    const mounted = await Promise.all(adminFixtures.map((fixture) => createAdminRuntime(fixture)));
    try {
      expect(Object.fromEntries(mounted.map(({ appId, runtime }) => [
        appId,
        flattenRoutes(runtime.plans.adminShellPlan.routes).map((route) => ({
          id: route.id,
          path: route.path,
          pageFqn: route.pageFqn,
        })),
      ]))).toEqual({
        'basic-admin': [{ id: 'users-route', path: '/users', pageFqn: 'dg.admin.basic.UsersPage' }],
        'embedded-admin': [
          { id: 'home-route', path: '/home', pageFqn: 'dg.admin.embedded.HomePage' },
          { id: 'reports-route', path: '/reports', pageFqn: 'dg.admin.embedded.ReportsPage' },
        ],
        'import-admin': [{ id: 'orders-route', path: '/orders', pageFqn: 'dg.admin.imports.OrdersPage' }],
        'data-graph-admin': [
          { id: 'users-route', path: '/users', pageFqn: 'dg.admin.graph.UsersPage' },
          { id: 'dashboard-route', path: '/dashboard', pageFqn: 'dg.admin.graph.DashboardPage' },
        ],
      });
    } finally {
      for (const { runtime } of mounted) runtime.dispose();
    }
  });

  it('renders basic-admin config props and component config through the real runtime', async () => {
    const rendered = await renderRoute('basic-admin', 'users-route');
    try {
      expect(rendered.target.textContent).toContain('用户管理');
      expect(rendered.target.querySelector('[data-testid="input"]')?.getAttribute('data-placeholder'))
        .toBe('搜索用户');
      expect(rendered.target.querySelector('[data-testid="input"]')?.getAttribute('data-clearable'))
        .toBe('true');
      expect(rendered.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-row-count'))
        .toBe('3');
      expect(rendered.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-columns'))
        .toBe('姓名,评分,状态');

      const dispatch = vi.spyOn(rendered.fixture.runtime, 'dispatchCommand');
      const input = rendered.target.querySelector('[data-testid="input"]') as HTMLInputElement;
      input.value = 'Ada';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        unitFqn: 'dg.admin.basic.UsersPage',
        elementId: 'keyword-input',
        input: { elementId: 'keyword-input', value: 'Ada' },
      })));
      await vi.waitFor(() => expect(
        rendered.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-row-count'),
      ).toBe('1'));
    } finally {
      rendered.unmount();
    }
  });

  it('recursively renders embedded-admin Page and Component units from the selected route', async () => {
    const rendered = await renderRoute('embedded-admin', 'home-route');
    try {
      expect(rendered.target.textContent).toContain('工作台首页');
      expect(rendered.target.textContent).toContain('报表中心');
      expect(rendered.target.querySelector('span')?.getAttribute('density')).toBe('compact');
      expect(rendered.target.querySelector('span')?.getAttribute('entity')).toBe('reports');
    } finally {
      rendered.unmount();
    }
  });

  it('renders import-admin imported prefab and config props from the real orders route', async () => {
    const rendered = await renderRoute('import-admin', 'orders-route');
    try {
      expect(rendered.target.textContent).toContain('订单管理');
      expect(rendered.target.querySelector('div[entity="orders"]')).not.toBeNull();
      expect(rendered.target.querySelector('table')).not.toBeNull();
    } finally {
      rendered.unmount();
    }
  });

  it('projects data-graph-admin graph outputs into DataTable and StatisticGroup props', async () => {
    const users = await renderRoute('data-graph-admin', 'users-route');
    try {
      expect(users.target.textContent).toContain('用户数据图');
      expect(users.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-row-count'))
        .toBe('3');
      expect(users.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-summary-total'))
        .toBe('3');
      expect(users.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-columns'))
        .toBe('姓名,状态,评分');

      const scopeRuntime = users.fixture.runtime.resolveScope(
        'dg.admin.graph.UsersPage',
        'users-page',
      ) as { graph?<T>(name: string): T | undefined };
      const mounted = scopeRuntime.graph?.<MountedHalfcodeDataGraph>('users-list');
      if (!mounted?.refs) throw new Error('users-list graph was not mounted');
      const inputs = mounted.refs.inputs as Record<string, unknown>;
      mounted.graph.set(inputs.query as any, { keyword: 'Ada', status: 'active' });
      await vi.waitFor(() => {
        expect(users.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-row-count'))
          .toBe('1');
        expect(users.target.querySelector('[data-testid="data-table"]')?.getAttribute('data-summary-total'))
          .toBe('1');
      });
    } finally {
      users.unmount();
    }

    const dashboard = await renderRoute('data-graph-admin', 'dashboard-route');
    try {
      expect(dashboard.target.textContent).toContain('Quick Graph 扩展');
      expect(dashboard.target.querySelector('[data-testid="statistic-group"]')?.getAttribute('data-card-count'))
        .toBe('3');
      expect(dashboard.target.querySelector('[data-testid="statistic-group"]')?.getAttribute('data-card-labels'))
        .toContain('活跃用户');
    } finally {
      dashboard.unmount();
    }
  });
});
