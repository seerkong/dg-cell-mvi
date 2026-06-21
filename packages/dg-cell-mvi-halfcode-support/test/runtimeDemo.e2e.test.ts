/**
 * runtime-counter demo E2E (track add-halfcode-runtime-demo-execution,
 * mission evolve-halfcode-non-frontend-dsl G2R-T2).
 *
 * Inherits the two slicing track-4 acceptance criteria on the *real on-disk*
 * fixture: load runtime-counter through the AppBundle loader (G2R-T1) →
 * assembleHalfcodeRuntimeUnit with a symbol resolver that imports the actual
 * fixture TypeScript modules → executeHalfcodeRuntimeCode on the command
 * handler declared in commands.xnl → runtime state increments →
 * resolveScopeRuntimeRef('scope-runtime://#counter/viewModel.value') is
 * visible and the updated view model is read through the runtime object.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ImportResolver } from 'xnl-core';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  parseHalfcodeRef,
  resolveScopeRuntimeRef,
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
      try {
        return readFileSync(fsPathFor(vfsPath), 'utf8');
      } catch {
        return null;
      }
    },
    isDir(vfsPath) {
      try {
        return statSync(fsPathFor(vfsPath)).isDirectory();
      } catch {
        return false;
      }
    },
    readDir(vfsPath) {
      try {
        return readdirSync(fsPathFor(vfsPath));
      } catch {
        return null;
      }
    },
  };
}

/** Import a `vfs://./<file>.ts#<export>` ref as the real fixture module export. */
async function importUnitSymbol(unit: LoadedHalfcodeUnit, ref: HalfcodeRef | string): Promise<unknown> {
  const body = String(ref).replace(/^vfs:\/\//, '');
  const [relPath, symbolName] = body.split('#');
  if (!relPath || !symbolName) throw new Error(`Not a vfs://<path>#<symbol> ref: ${ref}`);
  const module = await import(path.join(fsPathFor(unit.path), relPath));
  const symbol = (module as Record<string, unknown>)[symbolName];
  if (symbol === undefined) throw new Error(`Module "${relPath}" has no export "${symbolName}"`);
  return symbol;
}

/** Resolve a config://#id ref from the unit's loaded config domain. */
function configFromDomain(unit: LoadedHalfcodeUnit, ref: HalfcodeRef | string): unknown {
  const parsed = parseHalfcodeRef(String(ref));
  if (parsed.scheme !== 'config' || !parsed.id) throw new Error(`Not a config://#id ref: ${ref}`);
  const nodes = unit.domains.config?.nodes ?? [];
  let found: UnitDomainNodeSpec | undefined;
  const visit = (node: UnitDomainNodeSpec): void => {
    if (node.id === parsed.id) found = found ?? node;
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of nodes) visit(node);
  if (!found) throw new Error(`Config entry #${parsed.id} not found in the config domain`);
  return found.data;
}

describe('runtime-counter demo end-to-end (real fixture, real code modules)', () => {
  async function assembleCounterUnit() {
    const bundle = loadHalfcodeUnitBundle(fixtureResolver(), 'vfs://@/runtime-counter/', {
      baseDir: '/',
      workspaceRoot: '/',
      uiLibraries: ['elementPlus'],
    });
    expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const unit = bundle.units['dg.demo.runtime.CounterPage'];
    expect(unit).toBeDefined();

    const appRuntime = await createHalfcodeAppRuntime(bundle, {
      resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
      resolveConfig: (ref, context) => configFromDomain(context.unit, ref),
    });
    const assembly = appRuntime.assemblies[unit.fqn];
    expect(assembly.diagnostics).toEqual([]);
    return { unit, assembly, appRuntime };
  }

  it('assembles counter-base and counter from the real runtime modules', async () => {
    const { assembly } = await assembleCounterUnit();

    expect(Object.keys(assembly.runtimeInstances).sort()).toEqual(['counter', 'counter-base']);
    expect(assembly.runtimeInstances['counter-base']).toMatchObject({ kind: 'CounterRuntime' });
    // config://#counter-initial-state seeds the created runtime.
    expect(
      (assembly.runtimeInstances['counter-base'] as { viewModel: { value: number } }).viewModel.value,
    ).toBe(0);
    expect(assembly.scopeRuntimes['counter-page']).toMatchObject({ scopeId: 'counter-page' });
  });

  it('increments runtime state through the commands.xnl handler (slicing track-4 acceptance 1)', async () => {
    const { unit, appRuntime } = await assembleCounterUnit();
    const first = await appRuntime.dispatchCommand<{ value: number; label: string }>({
      unitFqn: unit.fqn,
      elementId: 'increment-button',
      input: {},
    });
    expect(first.diagnostics).toEqual([]);
    expect(first.output).toEqual({ value: 1, label: 'count = 1' });

    const second = await appRuntime.dispatchCommand<{ value: number; label: string }>({
      unitFqn: unit.fqn,
      elementId: 'increment-button',
      input: {},
    });
    expect(second.output).toEqual({ value: 2, label: 'count = 2' });
  });

  it('resolves scope-runtime://#counter/viewModel.value to the updated view model (slicing track-4 acceptance 2)', async () => {
    const { unit, assembly, appRuntime } = await assembleCounterUnit();
    await appRuntime.dispatchCommand({
      unitFqn: unit.fqn,
      elementId: 'increment-button',
      input: {},
    });

    // The ref comes verbatim from elements.xnl (<elementPlus.Statistic value=…>).
    const result = resolveScopeRuntimeRef(
      assembly,
      'counter-page',
      'scope-runtime://#counter/viewModel.value',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.resolved).toMatchObject({
      scopeId: 'counter-page',
      runtimeId: 'counter',
      subPath: 'viewModel.value',
    });

    // The helper resolves visibility only; the projection value is read
    // through the runtime object protocol by the caller (refs.md boundary).
    const runtime = result.resolved?.runtime as { viewModel: { value: number; label: string } };
    expect(runtime.viewModel.value).toBe(1);
    expect(runtime.viewModel.label).toBe('count = 1');

    // Not-visible instances stay diagnosable on the same assembly.
    const invisible = resolveScopeRuntimeRef(assembly, 'counter-page', 'scope-runtime://#counter-base');
    expect(invisible.resolved).toBeUndefined();
    expect(invisible.diagnostics[0]).toMatchObject({ code: 'HALFCODE_RUNTIME_REF_UNRESOLVED' });
  });
});
