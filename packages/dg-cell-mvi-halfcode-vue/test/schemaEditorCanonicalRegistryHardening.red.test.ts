import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  RenderNodePlan,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';
import type { HalfcodeAppRuntime } from 'dg-cell-mvi-halfcode-support';
import {
  createSchemaEditorCanonicalRegistry,
  createSchemaEditorPresenterRegistry,
  renderCanonicalHalfcodeNode,
  type CanonicalComponentRegistry,
  type CanonicalComponentResolutionContext,
  type CanonicalRenderContext,
} from '../src';

const ProbePresenter = defineComponent({
  name: 'CanonicalRegistryHardeningProbe',
  setup: () => () => h('span', 'probe'),
});

function presenterRegistry() {
  const result = createSchemaEditorPresenterRegistry(
    Object.freeze({}),
    {
      entries: [{
        id: 'probe.field',
        adapter: Object.freeze({ component: ProbePresenter }),
      }],
    },
    { duplicate: 'reject' },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.registry;
}

function createRegistry(parentRegistry?: CanonicalComponentRegistry) {
  const result = createSchemaEditorCanonicalRegistry(
    { presenterRegistry: presenterRegistry() },
    { parentRegistry },
    { componentIdentity: 'Editor' },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.registry;
}

function fakeContext(
  runtime: object,
  plan: object,
  node: object,
): CanonicalComponentResolutionContext {
  return {
    runtime: runtime as HalfcodeAppRuntime,
    plan: plan as UnitRenderPlan,
    node: node as RenderNodePlan,
  };
}

describe('Schema Editor T4.2 canonical registry hardening', () => {
  it('rejects accessor and revoked factory inputs without executing user code', () => {
    let accessorReads = 0;
    const accessorRuntime = Object.defineProperty({}, 'presenterRegistry', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return presenterRegistry();
      },
    });
    const accessorParent = Object.defineProperty({}, 'resolve', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return () => undefined;
      },
    });
    const revokedRuntime = Proxy.revocable({}, {});
    const revokedInput = Proxy.revocable({}, {});
    const revokedConfig = Proxy.revocable({}, {});
    revokedRuntime.revoke();
    revokedInput.revoke();
    revokedConfig.revoke();

    expect(createSchemaEditorCanonicalRegistry(
      accessorRuntime as never,
      {},
      { componentIdentity: 'Editor' },
    )).toEqual(expect.objectContaining({ ok: false }));
    expect(createSchemaEditorCanonicalRegistry(
      { presenterRegistry: presenterRegistry() },
      { parentRegistry: accessorParent as CanonicalComponentRegistry },
      { componentIdentity: 'Editor' },
    )).toEqual(expect.objectContaining({ ok: false }));
    expect(accessorReads).toBe(0);

    for (const [runtime, input, config] of [
      [revokedRuntime.proxy, {}, { componentIdentity: 'Editor' }],
      [{ presenterRegistry: presenterRegistry() }, revokedInput.proxy, { componentIdentity: 'Editor' }],
      [{ presenterRegistry: presenterRegistry() }, {}, revokedConfig.proxy],
    ] as const) {
      expect(() => createSchemaEditorCanonicalRegistry(
        runtime as never,
        input as never,
        config as never,
      )).not.toThrow();
      expect(createSchemaEditorCanonicalRegistry(
        runtime as never,
        input as never,
        config as never,
      )).toEqual(expect.objectContaining({ ok: false }));
    }
  });

  it('preserves one-argument parent registries and fails closed for hostile delegation', () => {
    const legacyResolve = vi.fn((name: unknown) => (
      name === 'LegacyButton' ? 'button' : undefined
    ));
    const legacyParent: CanonicalComponentRegistry = { resolve: legacyResolve };
    const registry = createRegistry(legacyParent);

    expect(registry.resolve('LegacyButton')).toBe('button');
    expect(legacyResolve).toHaveBeenCalledWith('LegacyButton', undefined);

    const hostile = createRegistry({
      resolve() {
        throw new Error('hostile parent');
      },
    });
    expect(() => hostile.resolve('Unknown')).not.toThrow();
    expect(hostile.resolve('Unknown')).toBeUndefined();
  });

  it('snapshots parent resolution and does not re-read a revoked or replaced descriptor', () => {
    const resolve = vi.fn(() => 'legacy-component');
    const revocable = Proxy.revocable({ resolve }, {});
    const registry = createRegistry(revocable.proxy);
    revocable.revoke();

    expect(() => registry.resolve('Legacy')).not.toThrow();
    expect(registry.resolve('Legacy')).toBe('legacy-component');
    expect(resolve).toHaveBeenCalledTimes(2);

    const mutable = { resolve: () => 'initial-component' };
    const snapshotted = createRegistry(mutable);
    let accessorReads = 0;
    Object.defineProperty(mutable, 'resolve', {
      configurable: true,
      get() {
        accessorReads += 1;
        throw new Error('must not re-read');
      },
    });
    expect(snapshotted.resolve('Legacy')).toBe('initial-component');
    expect(accessorReads).toBe(0);
  });

  it('keeps shell components local to registry, runtime, unit plan and node identity', () => {
    const firstRegistry = createRegistry();
    const secondRegistry = createRegistry();
    const runtimeA = {};
    const runtimeB = {};
    const planA = {};
    const planB = {};
    const nodeA = {};
    const nodeB = {};
    const first = firstRegistry.resolve(
      'Editor',
      fakeContext(runtimeA, planA, nodeA),
    );

    expect(firstRegistry.resolve(
      'Editor',
      fakeContext(runtimeA, planA, nodeA),
    )).toBe(first);
    expect(firstRegistry.resolve(
      'Editor',
      fakeContext(runtimeA, planB, nodeA),
    )).not.toBe(first);
    expect(firstRegistry.resolve(
      'Editor',
      fakeContext(runtimeA, planA, nodeB),
    )).not.toBe(first);
    expect(firstRegistry.resolve(
      'Editor',
      fakeContext(runtimeB, planA, nodeA),
    )).not.toBe(first);
    expect(secondRegistry.resolve(
      'Editor',
      fakeContext(runtimeA, planA, nodeA),
    )).not.toBe(first);
  });

  it('fails closed for accessor and revoked resolution contexts', () => {
    const registry = createRegistry();
    let accessorReads = 0;
    const accessorContext = Object.defineProperty({}, 'runtime', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return {};
      },
    });
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();

    expect(registry.resolve(
      'Editor',
      accessorContext as CanonicalComponentResolutionContext,
    )).toBeUndefined();
    expect(accessorReads).toBe(0);
    expect(() => registry.resolve(
      'Editor',
      revocable.proxy as CanonicalComponentResolutionContext,
    )).not.toThrow();
    expect(registry.resolve(
      'Editor',
      revocable.proxy as CanonicalComponentResolutionContext,
    )).toBeUndefined();
  });

  it('passes the current unit, runtime and node context through the sole canonical renderer', () => {
    const node = {
      kind: 'atom',
      id: 'schema-editor-shell',
      tag: 'schemaEditor.Editor',
      library: 'schemaEditor',
      scopeId: 'editor-scope',
      inlineProps: {},
    } as unknown as RenderNodePlan;
    const plan = {
      unitFqn: 'dg.schemaEditor.$CurrentUnit',
      root: [node],
    } as unknown as UnitRenderPlan;
    const runtime = {} as HalfcodeAppRuntime;
    const resolve = vi.fn(() => 'section');
    const registry: CanonicalComponentRegistry = { resolve };
    const context: CanonicalRenderContext = {
      plan,
      runtime,
      registry,
      compositionStack: [String(plan.unitFqn)],
      updated: vi.fn(),
    };

    renderCanonicalHalfcodeNode(node, context);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('Editor', {
      plan,
      runtime,
      node,
    });
  });
});
