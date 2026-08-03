import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  defineGraphModule,
  input,
  internal,
  isNodeRef,
  output,
  type GraphNodeIdLike,
} from 'depa-data-graph-core';
import type { ImportResolver } from 'xnl-core';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  materializeDataGraphScope,
  parseHalfcodeRef,
  type DefaultHalfcodeRuntimeObject,
  type HalfcodeRef,
  type LoadedHalfcodeUnit,
  type MountedHalfcodeDataGraph,
  type UnitDomainNodeSpec,
} from '../src';

const workspaceRoot = new URL('./fixtures/xnl-bundles', import.meta.url).pathname;
const fsPathFor = (vfsPath: string) =>
  path.join(workspaceRoot, path.posix.normalize(vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`));

function fixtureResolver(): ImportResolver {
  return {
    readFile(vfsPath) {
      try { return readFileSync(fsPathFor(vfsPath), 'utf8'); } catch { return null; }
    },
    isDir(vfsPath) {
      try { return statSync(fsPathFor(vfsPath)).isDirectory(); } catch { return false; }
    },
    readDir(vfsPath) {
      try { return readdirSync(fsPathFor(vfsPath)); } catch { return null; }
    },
  };
}

async function importUnitSymbol(unit: LoadedHalfcodeUnit, ref: HalfcodeRef | string): Promise<unknown> {
  const [relPath, symbolName] = String(ref).replace(/^vfs:\/\//, '').split('#');
  if (!relPath || !symbolName) throw new Error(`Invalid code ref: ${ref}`);
  const module = await import(path.join(fsPathFor(unit.path), relPath));
  return (module as Record<string, unknown>)[symbolName];
}

function configFromDomain(unit: LoadedHalfcodeUnit, ref: HalfcodeRef | string): unknown {
  const parsed = parseHalfcodeRef(String(ref));
  const find = (nodes: UnitDomainNodeSpec[]): UnitDomainNodeSpec | undefined => {
    for (const node of nodes) {
      if (node.id === parsed.id) return node;
      const nested = find(node.children ?? []);
      if (nested) return nested;
    }
  };
  return find(unit.domains.config?.nodes ?? [])?.data;
}

describe('real depa data graph Scope materialization', () => {
  it('mounts typed GraphModule/NodeRef and lets Command code update the signal', async () => {
    const bundle = loadHalfcodeUnitBundle(fixtureResolver(), 'vfs://@/data-graph-counter/', {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: ['elementPlus'],
    });
    expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    const appRuntime = await createHalfcodeAppRuntime(bundle, {
      resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
      resolveConfig: (ref, context) => configFromDomain(context.unit, ref),
    });
    const unit = bundle.units['dg.demo.counter.CounterPage'];
    const assembly = appRuntime.assemblies[unit.fqn];
    expect(assembly.diagnostics).toEqual([]);

    const scopeRuntime = appRuntime.resolveScope(unit.fqn, 'counter-page') as DefaultHalfcodeRuntimeObject;
    const mounted = scopeRuntime.graph<MountedHalfcodeDataGraph>('counter');
    if (!mounted?.module || !mounted.refs) throw new Error('counter graph mount was not materialized');
    const stateRefs = mounted.refs.state as Record<string, GraphNodeIdLike>;
    const outputRefs = mounted.refs.outputs as Record<string, GraphNodeIdLike>;
    expect(mounted.module.kind).toBe('graph-module');
    expect(isNodeRef(stateRefs.count)).toBe(true);
    expect(mounted.graph.get(outputRefs.value)).toBe(0);
    expect(mounted.graph.get(outputRefs.label)).toBe('count = 0');

    const first = await appRuntime.dispatchCommand<{ value: number; label: string }>({
      unitFqn: unit.fqn,
      elementId: 'increment-button',
      input: {},
    });
    const second = await appRuntime.dispatchCommand<{ value: number; label: string }>({
      unitFqn: unit.fqn,
      elementId: 'increment-button',
      input: {},
    });
    expect(first).toMatchObject({ output: { value: 1, label: 'count = 1' }, diagnostics: [] });
    expect(second).toMatchObject({ output: { value: 2, label: 'count = 2' }, diagnostics: [] });
  });

  it('supports split GraphObject/GraphMount bindings and Quick GraphExtension', async () => {
    const bundle = loadHalfcodeUnitBundle(fixtureResolver(), 'vfs://@/data-graph-admin/', {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: ['elementPlus'],
    });
    expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    const appRuntime = await createHalfcodeAppRuntime(bundle, {
      resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
      resolveConfig: (ref, context) => configFromDomain(context.unit, ref),
    });
    expect(Object.values(appRuntime.assemblies).flatMap((assembly) => assembly.diagnostics)).toEqual([]);

    const users = bundle.units['dg.admin.graph.UsersPage'];
    const usersRuntime = appRuntime.resolveScope(users.fqn, 'users-page') as DefaultHalfcodeRuntimeObject;
    const usersGraph = usersRuntime.graph<MountedHalfcodeDataGraph>('users-list');
    if (!usersGraph?.module || !usersGraph.refs) throw new Error('users graph mount was not materialized');
    const inputRefs = usersGraph.refs.inputs as Record<string, GraphNodeIdLike>;
    const outputRefs = usersGraph.refs.outputs as Record<string, GraphNodeIdLike>;
    expect(usersGraph.module.moduleId).toBe('users.list');
    expect(isNodeRef(inputRefs.query)).toBe(true);
    expect(usersGraph.graph.get(outputRefs.filteredRows)).toEqual([
      { id: 'u-1', name: 'Ada', status: 'active', score: 98 },
      { id: 'u-2', name: 'Lin', status: 'inactive', score: 76 },
      { id: 'u-3', name: 'Grace', status: 'active', score: 91 },
    ]);
    expect(usersGraph.graph.get(outputRefs.summary)).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
    });

    const search = await appRuntime.dispatchCommand({
      unitFqn: users.fqn,
      elementId: 'keyword-input',
      input: { elementId: 'keyword-input', value: 'a' },
    });
    expect(search).toMatchObject({
      output: { keyword: 'a', status: 'all' },
      diagnostics: [],
    });

    const filter = await appRuntime.dispatchCommand({
      unitFqn: users.fqn,
      elementId: 'status-select',
      input: { elementId: 'status-select', value: 'active' },
    });
    expect(filter).toMatchObject({
      output: { keyword: 'a', status: 'active' },
      diagnostics: [],
    });
    expect(usersGraph.graph.get(outputRefs.filteredRows)).toEqual([
      { id: 'u-1', name: 'Ada', status: 'active', score: 98 },
      { id: 'u-3', name: 'Grace', status: 'active', score: 91 },
    ]);
    expect(usersGraph.graph.get(outputRefs.summary)).toEqual({
      total: 2,
      active: 2,
      inactive: 0,
    });

    const dashboard = bundle.units['dg.admin.graph.DashboardPage'];
    const dashboardRuntime = appRuntime.resolveScope(dashboard.fqn, 'dashboard-page') as DefaultHalfcodeRuntimeObject;
    const extension = dashboardRuntime.graph<MountedHalfcodeDataGraph>('dashboard-summary');
    expect(extension?.graph.snapshot().nodes.map((node) => node.id)).toContain('dashboard.outputs.cards');
    if (!extension?.refs) throw new Error('dashboard graph extension refs were not materialized');
    const dashboardOutputs = extension.refs.outputs as Record<string, GraphNodeIdLike>;
    expect(extension.graph.get(dashboardOutputs.cards)).toEqual([
      { key: 'total', id: 'total', label: '总用户', value: 0 },
      { key: 'active', id: 'active', label: '活跃用户', value: 0 },
      { key: 'inactive', id: 'inactive', label: '非活跃用户', value: 0 },
    ]);
  });

  it('materializes AsyncNode through DataGraph.addAsync with explicit projections', async () => {
    const module = defineGraphModule('users.async', {
      inputs: { query: input<string>() },
      outputs: {
        rows: output<string[]>(),
        loading: output<boolean>(),
        error: output<string | null>(),
      },
      internals: { load: internal<unknown>() },
    });
    const mounted = await materializeDataGraphScope({
      objects: [],
      mounts: [{
        id: 'users-list',
        scopeId: 'users-page',
        module: {
          id: 'users.async',
          src: 'vfs://./users.graph.ts#UsersAsyncGraphModule' as HalfcodeRef,
          nodes: [
            { kind: 'signal', id: 'query', slot: 'inputs.query', initial: '' },
            {
              kind: 'async',
              id: 'load',
              slot: 'internals.load',
              deps: ['inputs.query'],
              logicId: 'users.load',
              initial: [],
              projections: {
                result: 'outputs.rows',
                loading: 'outputs.loading',
                error: 'outputs.error',
              },
            },
          ],
        },
        nodeBindings: [{
          id: 'users.load',
          kind: 'async',
          impl: 'vfs://./users.graph.impl.ts#loadUsers' as HalfcodeRef,
        }],
      }],
      extensions: [],
    }, {
      scopeId: 'users-page',
      runtime: { kind: 'test-runtime' },
      getRuntime: () => ({ kind: 'test-runtime' }),
      resolveSymbol: async (_ref, role) => role === 'data-graph-module'
        ? module
        : async (_runtime: unknown, inputValue: { query: string }) => [inputValue.query],
      resolveConfig: async () => undefined,
    });
    const graphMount = mounted?.['users-list'];
    if (!graphMount?.refs) throw new Error('async graph mount was not materialized');
    const queryRef = (graphMount.refs.inputs as Record<string, unknown>).query;
    const outputs = graphMount.refs.outputs as Record<string, GraphNodeIdLike>;
    if (!isNodeRef(queryRef) || queryRef.section !== 'input') {
      throw new Error('async graph input query ref was not materialized');
    }

    graphMount.graph.set(queryRef, 'Ada');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(graphMount.graph.get(outputs.rows)).toEqual(['Ada']);
    expect(graphMount.graph.get(outputs.loading)).toBe(false);
    expect(graphMount.graph.get(outputs.error)).toBeNull();
  });
});
