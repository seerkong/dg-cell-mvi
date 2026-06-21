import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createApp, defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  resolveUnitConfigRef,
  type HalfcodeRef,
  type HalfcodeUnitBundleResolver,
  type LoadedHalfcodeUnit,
} from 'dg-cell-mvi-halfcode-support';
import { CanonicalHalfcodeRenderer, type CanonicalComponentRegistry } from '../src';

const fixtureWorkspace = path.resolve(
  __dirname,
  '../../dg-cell-mvi-halfcode-support/test/fixtures/xnl-bundles',
);

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

async function createRuntimeCounter() {
  const bundle = loadHalfcodeUnitBundle(fixtureResolver(), 'vfs://@/runtime-counter/manifest.xnl', {
    baseDir: '/',
    workspaceRoot: '/',
    uiLibraries: ['elementPlus'],
  });
  expect(bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  return createHalfcodeAppRuntime(bundle, {
    resolveSymbol: (ref, context) => importUnitSymbol(context.unit, ref),
    resolveConfig: (ref, context) => resolveUnitConfigRef(context.unit, ref),
  });
}

const CounterStatistic = defineComponent({
  name: 'CounterStatistic',
  props: {
    value: { type: Number, required: true },
    title: { type: String, required: true },
  },
  setup(props) {
    return () => h('output', {
      'data-testid': 'counter-value',
      'data-title': props.title,
    }, String(props.value));
  },
});

describe('canonical Vue render adapter', () => {
  it('mounts the real runtime-counter fixture and updates the DOM from 0 to 1', async () => {
    const runtime = await createRuntimeCounter();
    const plan = runtime.plans.renderPlans.find(
      (candidate) => candidate.unitFqn === 'dg.demo.runtime.CounterPage',
    );
    expect(plan).toBeDefined();

    const resolvedIdentities: unknown[] = [];
    const registry: CanonicalComponentRegistry = {
      resolve(identity) {
        resolvedIdentities.push(identity);
        if (identity === 'Statistic') return CounterStatistic;
        if (identity === 'ElButton') return 'button';
        return identity;
      },
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const app = createApp(CanonicalHalfcodeRenderer, { plan, runtime, registry });

    try {
      app.mount(target);
      expect(target.querySelector('[data-testid="counter-value"]')?.textContent).toBe('0');
      expect(target.querySelector('[data-testid="counter-value"]')?.getAttribute('data-title'))
        .toBe('count = 0');

      target.querySelector('button')?.click();

      await vi.waitFor(() => {
        expect(target.querySelector('[data-testid="counter-value"]')?.textContent).toBe('1');
        expect(target.querySelector('[data-testid="counter-value"]')?.getAttribute('data-title'))
          .toBe('count = 1');
      });
      expect(resolvedIdentities).toEqual(expect.arrayContaining(['Statistic', 'ElButton']));
      expect(resolvedIdentities).not.toEqual(expect.arrayContaining([
        'elementPlus.Statistic',
        'elementPlus.ElButton',
      ]));
    } finally {
      app.unmount();
      runtime.dispose();
      target.remove();
    }
  });
});
