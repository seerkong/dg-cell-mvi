import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ImportResolver } from 'xnl-core';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  parseHalfcodeRef,
  type HalfcodeRef,
  type LoadedHalfcodeUnit,
  type UnitDomainNodeSpec,
} from '../src';

const workspaceRoot = new URL('./fixtures/xnl-bundles', import.meta.url).pathname;

function fsPathFor(vfsPath: string): string {
  return path.join(workspaceRoot, path.posix.normalize(vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`));
}

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
  const visit = (nodes: UnitDomainNodeSpec[]): UnitDomainNodeSpec | undefined => {
    for (const node of nodes) {
      if (node.id === parsed.id) return node;
      const nested = visit(node.children ?? []);
      if (nested) return nested;
    }
  };
  return visit(unit.domains.config?.nodes ?? [])?.data;
}

describe('callable effect Scope materialization', () => {
  it('dispatches basic-admin through the compact effect bundle and strong runtime API', async () => {
    const bundle = loadHalfcodeUnitBundle(fixtureResolver(), 'vfs://@/basic-admin/', {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: ['elementPlus'],
    });
    expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

    const appRuntime = await createHalfcodeAppRuntime(bundle, {
      resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
      resolveConfig: (ref, context) => configFromDomain(context.unit, ref),
    });
    const usersUnit = bundle.units['dg.admin.basic.UsersPage'];
    const assembly = appRuntime.assemblies[usersUnit.fqn];
    expect(assembly.diagnostics).toEqual([]);
    expect(appRuntime.plans.scopeRuntimePlans.find((plan) => plan.scopeId === 'users-page')?.effects).toEqual({
      impls: 'vfs://./effects/mock-admin.effect-impls.ts#adminEffectImpls',
      bindings: [],
    });

    const result = await appRuntime.dispatchCommand<{
      rows: Array<{ id: string; name: string }>;
      total: number;
    }>({
      unitFqn: usersUnit.fqn,
      elementId: 'keyword-input',
      input: { keyword: 'ada', page: 1, pageSize: 10 },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.output).toEqual({
      rows: [{ id: 'u1', name: 'Ada Lovelace', score: 98, status: 'enabled' }],
      total: 1,
    });
  });
});
