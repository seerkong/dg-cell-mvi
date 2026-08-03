import { describe, expect, it } from 'vitest';
import {
  createDefaultHalfcodeRuntime,
  type DefaultHalfcodeRuntimeObject,
  type HalfcodeFlowHandleFactory,
  type InstantCtrlFlowHandle,
  type MaterializedCallableEffect,
  type RuntimeScopeAssembly,
} from '../src';

function callableEffect(id: string): MaterializedCallableEffect {
  return {
    id,
    kind: 'function',
    impl: async (runtime, input) => ({ id, input, scopeId: (runtime as { scopeId: string }).scopeId }),
  };
}

function flowFactory(fqn: string, label: string): HalfcodeFlowHandleFactory {
  return {
    kind: 'instant-ctrl-flow',
    fqn: fqn as never,
    bind: (runtime) => ({
      kind: 'instant-ctrl-flow',
      fqn: fqn as never,
      spec: {} as never,
      invoke: async <TOutput>(input?: unknown) => ({
        input,
        label,
        scopeId: (runtime as { scopeId: string }).scopeId,
      }) as TOutput,
    }),
  };
}

function graph(id: string): unknown {
  return { id };
}

function bindScope(
  runtime: DefaultHalfcodeRuntimeObject,
  input: RuntimeScopeAssembly<DefaultHalfcodeRuntimeObject>,
): DefaultHalfcodeRuntimeObject {
  return runtime.bindScope?.(input) as DefaultHalfcodeRuntimeObject;
}

describe('createDefaultHalfcodeRuntime', () => {
  it('rebinds inherited flow factories to each scope and applies nearest overrides', async () => {
    const host = createDefaultHalfcodeRuntime('host', undefined, {
      flows: {
        'demo.flow.Inherited': flowFactory('demo.flow.Inherited', 'host-inherited'),
        'demo.flow.Shared': flowFactory('demo.flow.Shared', 'host-shared'),
      },
    });
    const child = bindScope(host, {
      scopeId: 'child',
      runtime: host,
      bindings: {
        flows: {
          'demo.flow.Shared': flowFactory('demo.flow.Shared', 'child-shared'),
        },
      },
    });
    const sibling = bindScope(host, { scopeId: 'sibling', runtime: host, bindings: {} });

    await expect((child.flow('demo.flow.Inherited') as InstantCtrlFlowHandle).invoke({ value: 1 })).resolves.toEqual({
      input: { value: 1 },
      label: 'host-inherited',
      scopeId: 'child',
    });
    await expect((child.flow('demo.flow.Shared') as InstantCtrlFlowHandle).invoke()).resolves.toEqual({
      input: undefined,
      label: 'child-shared',
      scopeId: 'child',
    });
    await expect((sibling.flow('demo.flow.Shared') as InstantCtrlFlowHandle).invoke()).resolves.toEqual({
      input: undefined,
      label: 'host-shared',
      scopeId: 'sibling',
    });
    expect(sibling.localFlowFactories).toEqual({});
  });

  it('retains every Scope family with parent visibility, nearest override, and sibling isolation', async () => {
    const host = createDefaultHalfcodeRuntime();
    const root = bindScope(host, {
      scopeId: 'root',
      runtime: host,
      config: { rootOnly: true, shared: 'root' },
      bindings: {
        commands: { rootOnly: 'root.command', shared: 'root.command.shared' },
        events: { rootOnly: 'root.event', shared: 'root.event.shared' },
        messagePolicy: { id: 'root-policy' },
        effects: {
          rootOnly: callableEffect('root-only'),
          shared: callableEffect('root-shared'),
        },
        dataGraphs: {
          rootOnly: graph('root-only'),
          shared: graph('root-shared'),
        },
      },
    });
    const child = bindScope(root, {
      scopeId: 'child',
      runtime: root,
      config: { childOnly: true, shared: 'child' },
      bindings: {
        commands: { childOnly: 'child.command', shared: 'child.command.shared' },
        events: { childOnly: 'child.event', shared: 'child.event.shared' },
        messagePolicy: { id: 'child-policy' },
        effects: {
          childOnly: callableEffect('child-only'),
          shared: callableEffect('child-shared'),
        },
        dataGraphs: {
          childOnly: graph('child-only'),
          shared: graph('child-shared'),
        },
      },
    });
    const sibling = bindScope(root, {
      scopeId: 'sibling',
      runtime: root,
      config: { siblingOnly: true },
      bindings: {
        commands: { siblingOnly: 'sibling.command' },
        effects: { siblingOnly: callableEffect('sibling-only') },
        dataGraphs: { siblingOnly: graph('sibling-only') },
      },
    });

    expect(child.config).toEqual({ rootOnly: true, childOnly: true, shared: 'child' });
    expect(child.commands).toEqual({
      rootOnly: 'root.command',
      childOnly: 'child.command',
      shared: 'child.command.shared',
    });
    expect(child.events).toEqual({
      rootOnly: 'root.event',
      childOnly: 'child.event',
      shared: 'child.event.shared',
    });
    expect(child.messagePolicy).toEqual({ id: 'child-policy' });
    expect(Object.keys(child.effects).sort()).toEqual(['childOnly', 'rootOnly', 'shared']);
    expect(Object.keys(child.dataGraphs).sort()).toEqual(['childOnly', 'rootOnly', 'shared']);
    await expect(child.callEffect('shared', { value: 1 })).resolves.toEqual({
      id: 'child-shared',
      input: { value: 1 },
      scopeId: 'child',
    });
    expect(child.graph('shared')).toEqual(graph('child-shared'));

    expect(sibling.config).toEqual({ rootOnly: true, siblingOnly: true, shared: 'root' });
    expect(sibling.commands).toEqual({
      rootOnly: 'root.command',
      siblingOnly: 'sibling.command',
      shared: 'root.command.shared',
    });
    expect(sibling.events).toEqual({ rootOnly: 'root.event', shared: 'root.event.shared' });
    expect(sibling.messagePolicy).toEqual({ id: 'root-policy' });
    expect(sibling.effects.childOnly).toBeUndefined();
    expect(sibling.dataGraphs.childOnly).toBeUndefined();
    expect(sibling.graph('shared')).toEqual(graph('root-shared'));
  });

  it('fails closed for hostile schema-editor capability reflection without executing accessors', () => {
    let registryReads = 0;
    const hostileCapability = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('hostile capability prototype');
      },
    });
    const accessorRegistry = Object.defineProperty({}, 'host', {
      enumerable: true,
      get() {
        registryReads += 1;
        return () => undefined;
      },
    });
    const host = createDefaultHalfcodeRuntime('host', undefined, {
      schemaEditor: {
        valueHosts: { inherited: () => undefined },
        sessions: { inherited: Object.create(null) },
      },
    });

    expect(() => createDefaultHalfcodeRuntime('hostile', host, {
      schemaEditor: hostileCapability,
    })).not.toThrow();
    expect(createDefaultHalfcodeRuntime('hostile', host, {
      schemaEditor: hostileCapability,
    }).schemaEditor).toBeUndefined();
    expect(createDefaultHalfcodeRuntime('accessor', host, {
      schemaEditor: { valueHosts: accessorRegistry },
    }).schemaEditor).toBeUndefined();
    expect(registryReads).toBe(0);
  });

  it('freezes capability ownership shells, isolates overlays, and preserves implementation identities', () => {
    const parentHost = () => 'parent';
    const childHost = () => 'child';
    const parentSession = { dispatch: () => undefined };
    const root = createDefaultHalfcodeRuntime('root', undefined, {
      schemaEditor: {
        valueHosts: { shared: parentHost },
        sessions: { shared: parentSession },
      },
    });
    const inherited = bindScope(root, { scopeId: 'inherited', runtime: root, bindings: {} });
    const sibling = bindScope(root, { scopeId: 'sibling', runtime: root, bindings: {} });
    const child = bindScope(root, {
      scopeId: 'child',
      runtime: root,
      bindings: {
        schemaEditor: {
          valueHosts: { shared: childHost },
          sessions: { childOnly: { dispatch: () => undefined } },
        },
      },
    });

    expect(Object.isFrozen(root.schemaEditor)).toBe(true);
    expect(Object.isFrozen(root.schemaEditor?.valueHosts)).toBe(true);
    expect(Object.isFrozen(root.schemaEditor?.sessions)).toBe(true);
    expect(inherited.schemaEditor).toBe(root.schemaEditor);
    expect(sibling.schemaEditor?.valueHosts).toBe(root.schemaEditor?.valueHosts);
    expect(child.schemaEditor).not.toBe(root.schemaEditor);
    expect(child.schemaEditor?.valueHosts).not.toBe(root.schemaEditor?.valueHosts);
    expect(Object.isFrozen(child.schemaEditor)).toBe(true);
    expect(Object.isFrozen(child.schemaEditor?.valueHosts)).toBe(true);
    expect(Object.isFrozen(child.schemaEditor?.sessions)).toBe(true);
    expect(root.schemaEditor?.valueHosts?.shared).toBe(parentHost);
    expect(root.schemaEditor?.sessions?.shared).toBe(parentSession);
    expect(child.schemaEditor?.valueHosts?.shared).toBe(childHost);

    expect(() => {
      (inherited.schemaEditor!.valueHosts as Record<string, unknown>).leaked = childHost;
    }).toThrow(TypeError);
    expect(sibling.schemaEditor?.valueHosts?.leaked).toBeUndefined();
    expect(root.schemaEditor?.valueHosts?.leaked).toBeUndefined();
  });
});
