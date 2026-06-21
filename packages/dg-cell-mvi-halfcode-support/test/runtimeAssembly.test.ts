import { describe, expect, it } from 'vitest';
import {
  HALFCODE_APP_BUNDLE_API_VERSION,
  asHalfcodeRef,
  asUnitFqn,
  assembleHalfcodeRuntimeUnit,
  type AssembleHalfcodeRuntimeUnitOptions,
  type LoadedHalfcodeUnit,
} from '../src';

function unitWithRuntime(partial: Pick<LoadedHalfcodeUnit, 'runtime' | 'scopeRuntimeBindings'>): LoadedHalfcodeUnit {
  const fqn = asUnitFqn('dg.runtime.CounterPage');
  return {
    fqn,
    kind: 'page',
    form: 'folder',
    path: '/runtime/counter',
    manifest: {
      kind: 'page',
      fqn,
      version: '1.0.0',
      domains: [],
    },
    domains: {},
    scopeRuntimeBindings: partial.scopeRuntimeBindings,
    runtime: partial.runtime,
  };
}

function assembleRuntimeUnit(
  unit: LoadedHalfcodeUnit,
  options: Omit<AssembleHalfcodeRuntimeUnitOptions, 'scopeRuntimePlans'> &
    Partial<Pick<AssembleHalfcodeRuntimeUnitOptions, 'scopeRuntimePlans'>>,
) {
  const { scopeRuntimePlans, ...runtimeOptions } = options;
  return assembleHalfcodeRuntimeUnit(unit, {
    ...runtimeOptions,
    scopeRuntimePlans: scopeRuntimePlans ?? unit.scopeRuntimeBindings.map((binding) => {
      if (binding.dataGraphs) {
        throw new Error('DataGraph source bindings require compiler-produced ScopeRuntimePlan input.');
      }
      return {
        scopeId: binding.scopeId,
        ownerElementId: binding.scopeId,
        unitFqn: unit.fqn,
        runtime: binding.runtime,
        config: binding.config,
        commands: binding.commands,
        events: binding.events,
        messagePolicy: binding.messagePolicy,
        effects: binding.effects,
      };
    }),
  });
}

describe('assembleHalfcodeRuntimeUnit', () => {
  it('creates and derives RuntimeInstance objects with output = fn(runtime, input, config)', async () => {
    const hostRuntime = { kind: 'host' };
    const calls: unknown[] = [];
    const unit = unitWithRuntime({
      runtime: {
        id: 'counter-runtime',
        instances: [
          {
            id: 'base',
            create: asHalfcodeRef('vfs://./runtime.ts#createBase'),
            config: asHalfcodeRef('config://#base'),
          },
          {
            id: 'child',
            prototype: asHalfcodeRef('runtime://#base'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
            config: asHalfcodeRef('config://#child'),
          },
        ],
      },
      scopeRuntimeBindings: [
        {
          scopeId: 'counter-page',
          runtime: asHalfcodeRef('runtime://#child'),
          config: asHalfcodeRef('config://#scope'),
          commands: asHalfcodeRef('command://#counter-commands'),
        },
      ],
    });

    const symbols = {
      'vfs://./runtime.ts#createBase': (runtime, input, config) => {
        calls.push({ fn: 'createBase', runtime, input, config });
        return {
          kind: 'base',
          config,
        };
      },
      'vfs://./runtime.ts#deriveChild': (runtime, input, config) => {
        calls.push({ fn: 'deriveChild', runtime, input, config });
        return {
          kind: 'child',
          prototype: runtime,
          config,
          bindScope(scopeInput: unknown) {
            calls.push({ fn: 'bindScope', input: scopeInput });
            return { kind: 'scope-runtime', scopeInput, parent: this };
          },
        };
      },
    } satisfies Record<string, (...args: any[]) => unknown>;

    const result = await assembleRuntimeUnit(unit, {
      hostRuntime,
      resolveSymbol: (ref) => symbols[String(ref) as keyof typeof symbols],
      resolveConfig: (ref) => ({ ref }),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.runtimeInstances.base).toMatchObject({ kind: 'base', config: { ref: 'config://#base' } });
    expect(result.runtimeInstances.child).toMatchObject({
      kind: 'child',
      prototype: result.runtimeInstances.base,
      config: { ref: 'config://#child' },
    });
    expect(result.scopeRuntimes['counter-page']).toMatchObject({
      kind: 'scope-runtime',
      parent: result.runtimeInstances.child,
    });
    expect(calls).toEqual([
      {
        fn: 'createBase',
        runtime: hostRuntime,
        input: {
          scopeId: 'runtime:base',
          runtime: hostRuntime,
          config: { ref: 'config://#base' },
          bindings: {},
        },
        config: { ref: 'config://#base' },
      },
      {
        fn: 'deriveChild',
        runtime: result.runtimeInstances.base,
        input: {
          scopeId: 'runtime:child',
          runtime: result.runtimeInstances.base,
          config: { ref: 'config://#child' },
          bindings: {},
        },
        config: { ref: 'config://#child' },
      },
      {
        fn: 'bindScope',
        input: {
          scopeId: 'counter-page',
          runtime: hostRuntime,
          config: { ref: 'config://#scope' },
          bindings: {
            config: 'config://#scope',
            commands: 'command://#counter-commands',
            events: undefined,
            messagePolicy: undefined,
          },
          metadata: {
            ownerElementId: 'counter-page',
            unitFqn: 'dg.runtime.CounterPage',
          },
        },
      },
    ]);
  });

  it('assembles lexical Scope plans parent-first with nearest override and sibling isolation', async () => {
    const hostRuntime = { kind: 'host' };
    const bindScope = function (this: unknown, input: any) {
      const inherited = input.runtime?.capabilities ?? {};
      return {
        scopeId: input.scopeId,
        parent: input.runtime,
        capabilities: { ...inherited, ...(input.config ?? {}) },
        bindScope,
      };
    };
    const baseRuntime = { kind: 'base', bindScope };
    const unit = unitWithRuntime({
      runtime: {
        id: 'scope-tree-runtime',
        instances: [{ id: 'base', src: asHalfcodeRef('vfs://./runtime.ts#base') }],
      },
      scopeRuntimeBindings: [],
    });

    const result = await assembleRuntimeUnit(unit, {
      hostRuntime,
      scopeRuntimePlans: [
        {
          scopeId: 'root',
          ownerElementId: 'root-elements',
          unitFqn: asUnitFqn('dg.runtime.CounterPage'),
          runtime: asHalfcodeRef('runtime://#base'),
          config: asHalfcodeRef('config://#root'),
        },
        {
          scopeId: 'child',
          parentScopeId: 'root',
          ownerElementId: 'child-capsule',
          unitFqn: asUnitFqn('dg.runtime.CounterPage'),
          config: asHalfcodeRef('config://#child'),
        },
        {
          scopeId: 'sibling',
          parentScopeId: 'root',
          ownerElementId: 'sibling-capsule',
          unitFqn: asUnitFqn('dg.runtime.CounterPage'),
          config: asHalfcodeRef('config://#sibling'),
        },
      ],
      resolveSymbol: () => baseRuntime,
      resolveConfig: (ref) => ({
        'config://#root': { root: true, shared: 'root' },
        'config://#child': { child: true, shared: 'child' },
        'config://#sibling': { sibling: true },
      })[String(ref) as 'config://#root' | 'config://#child' | 'config://#sibling'],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scopeRuntimes.root).toMatchObject({
      parent: hostRuntime,
      capabilities: { root: true, shared: 'root' },
    });
    expect(result.scopeRuntimes.child).toMatchObject({
      parent: result.scopeRuntimes.root,
      capabilities: { root: true, child: true, shared: 'child' },
    });
    expect(result.scopeRuntimes.sibling).toMatchObject({
      parent: result.scopeRuntimes.root,
      capabilities: { root: true, sibling: true, shared: 'root' },
    });
    expect((result.scopeRuntimes.sibling as any).capabilities.child).toBeUndefined();
  });

  it('reuses src runtime objects for scopes without bindScope/deriveScope', async () => {
    const existingRuntime = { kind: 'existing' };
    const unit = unitWithRuntime({
      runtime: {
        id: 'src-runtime',
        instances: [
          {
            id: 'existing',
            src: asHalfcodeRef('vfs://./runtime.ts#existingRuntime'),
          },
        ],
      },
      scopeRuntimeBindings: [
        {
          scopeId: 'plain-scope',
          runtime: asHalfcodeRef('runtime://#existing'),
        },
      ],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => existingRuntime,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.runtimeInstances.existing).toBe(existingRuntime);
    expect(result.scopeRuntimes['plain-scope']).toBe(existingRuntime);
  });

  it('reports missing prototypes and protocol mismatches as runtime diagnostics', async () => {
    const unit = unitWithRuntime({
      runtime: {
        id: 'bad-runtime',
        instances: [
          {
            id: 'child',
            prototype: asHalfcodeRef('runtime://#missing'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
          },
          {
            id: 'bad-create',
            create: asHalfcodeRef('vfs://./runtime.ts#notAFunction'),
          },
        ],
      },
      scopeRuntimeBindings: [
        {
          scopeId: 'bad-scope',
          runtime: asHalfcodeRef('runtime://#child'),
        },
      ],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => ({ not: 'callable' }),
    });

    expect(result.runtimeInstances).toEqual({});
    expect(result.scopeRuntimes).toEqual({});
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED',
      'HALFCODE_RUNTIME_PROTOCOL_MISMATCH',
      'HALFCODE_RUNTIME_REF_UNRESOLVED',
    ]);
  });

  it('assembles derived instances declared before their prototype (declaration order irrelevant)', async () => {
    const unit = unitWithRuntime({
      runtime: {
        id: 'reverse-runtime',
        instances: [
          {
            id: 'child',
            prototype: asHalfcodeRef('runtime://#base'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
          },
          {
            id: 'grandchild',
            prototype: asHalfcodeRef('runtime://#child'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
          },
          {
            id: 'base',
            create: asHalfcodeRef('vfs://./runtime.ts#createBase'),
          },
        ],
      },
      scopeRuntimeBindings: [],
    });

    const symbols: Record<string, (...args: any[]) => unknown> = {
      'vfs://./runtime.ts#createBase': () => ({ kind: 'base' }),
      'vfs://./runtime.ts#deriveChild': (runtime) => ({ kind: 'derived', prototype: runtime }),
    };
    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: (ref) => symbols[String(ref) as keyof typeof symbols],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.runtimeInstances.base).toEqual({ kind: 'base' });
    expect(result.runtimeInstances.child).toEqual({
      kind: 'derived',
      prototype: result.runtimeInstances.base,
    });
    expect(result.runtimeInstances.grandchild).toEqual({
      kind: 'derived',
      prototype: result.runtimeInstances.child,
    });
  });

  it('reports prototype cycles as HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED instead of looping', async () => {
    const unit = unitWithRuntime({
      runtime: {
        id: 'cyclic-runtime',
        instances: [
          {
            id: 'a',
            prototype: asHalfcodeRef('runtime://#b'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
          },
          {
            id: 'b',
            prototype: asHalfcodeRef('runtime://#a'),
            derive: asHalfcodeRef('vfs://./runtime.ts#deriveChild'),
          },
        ],
      },
      scopeRuntimeBindings: [],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => (runtime: unknown) => ({ prototype: runtime }),
    });

    expect(result.runtimeInstances).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED',
        message: expect.stringContaining('#a'),
      }),
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED',
        message: expect.stringContaining('#b'),
      }),
    ]);
  });

  it('reports create/derive execution throws as HALFCODE_RUNTIME_EXECUTION_FAILED', async () => {
    const unit = unitWithRuntime({
      runtime: {
        id: 'throwing-runtime',
        instances: [
          {
            id: 'boom',
            create: asHalfcodeRef('vfs://./runtime.ts#createBoom'),
          },
        ],
      },
      scopeRuntimeBindings: [],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => () => {
        throw new Error('factory exploded');
      },
    });

    expect(result.runtimeInstances).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_EXECUTION_FAILED',
        severity: 'error',
        message: expect.stringContaining('factory exploded'),
      }),
    ]);
  });

  it('converts runtime and Scope config resolver throws into diagnostics without aborting assembly', async () => {
    const runtime = {
      bindScope(input: unknown) {
        return { kind: 'scope-runtime', input };
      },
    };
    const unit = unitWithRuntime({
      runtime: {
        id: 'config-runtime',
        instances: [
          {
            id: 'existing',
            src: asHalfcodeRef('vfs://./runtime.ts#existingRuntime'),
            config: asHalfcodeRef('config://#runtime-config'),
          },
        ],
      },
      scopeRuntimeBindings: [
        {
          scopeId: 'configured-scope',
          runtime: asHalfcodeRef('runtime://#existing'),
          config: asHalfcodeRef('config://#scope-config'),
        },
        {
          scopeId: 'missing-runtime-scope',
          runtime: asHalfcodeRef('runtime://#missing'),
        },
      ],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => runtime,
      resolveConfig: (ref) => {
        throw new Error(`cannot load ${ref}`);
      },
    });

    expect(result.runtimeInstances.existing).toBe(runtime);
    expect(result.scopeRuntimes['configured-scope']).toEqual({
      kind: 'scope-runtime',
      input: expect.objectContaining({ config: undefined }),
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED',
        message: expect.stringContaining('config://#runtime-config'),
      }),
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED',
        message: expect.stringContaining('config://#scope-config'),
      }),
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_REF_UNRESOLVED',
        message: expect.stringContaining('missing'),
      }),
    ]));
  });

  it('keeps bindScope failures as HALFCODE_RUNTIME_SCOPE_BINDING_FAILED', async () => {
    const unit = unitWithRuntime({
      runtime: {
        id: 'scope-fail-runtime',
        instances: [
          {
            id: 'existing',
            src: asHalfcodeRef('vfs://./runtime.ts#existingRuntime'),
          },
        ],
      },
      scopeRuntimeBindings: [
        {
          scopeId: 'bad-scope',
          runtime: asHalfcodeRef('runtime://#existing'),
        },
      ],
    });

    const result = await assembleRuntimeUnit(unit, {
      resolveSymbol: () => ({
        bindScope() {
          throw new Error('binding rejected');
        },
      }),
    });

    expect(result.scopeRuntimes).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_SCOPE_BINDING_FAILED',
        message: expect.stringContaining('binding rejected'),
      }),
    ]);
  });

  it('keeps package root exports available beside contract constants', () => {
    expect(HALFCODE_APP_BUNDLE_API_VERSION).toBe('halfcode.dg-cell-mvi/v1');
  });
});
