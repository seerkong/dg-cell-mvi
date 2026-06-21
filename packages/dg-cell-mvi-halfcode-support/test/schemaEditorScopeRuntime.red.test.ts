import { describe, expect, it } from 'vitest';
import {
  createDefaultHalfcodeRuntime,
  type DefaultHalfcodeRuntimeObject,
  type RuntimeScopeAssembly,
} from '../src';

type ScopeBridgeConfig = Readonly<{
  valueHostId: string;
  sessionId: string;
}>;

interface ResolvedScopeBridge {
  readonly valueHostId: string;
  readonly sessionId: string;
  readonly valueHost: unknown;
  readonly session: unknown;
}

type ResolveSchemaEditorScopeBridge = (
  runtime: unknown,
  input: Readonly<Record<string, unknown>>,
  config: ScopeBridgeConfig,
) => ResolvedScopeBridge | undefined;

const support = await import('../src') as unknown as Record<string, unknown>;
const resolveSchemaEditorScopeBridge =
  typeof support.resolveSchemaEditorScopeBridge === 'function'
    ? support.resolveSchemaEditorScopeBridge as ResolveSchemaEditorScopeBridge
    : undefined;
const bridgeApiAvailable = resolveSchemaEditorScopeBridge !== undefined;

function bindScope(
  runtime: DefaultHalfcodeRuntimeObject,
  input: RuntimeScopeAssembly<DefaultHalfcodeRuntimeObject>,
): DefaultHalfcodeRuntimeObject {
  return runtime.bindScope?.(input) as DefaultHalfcodeRuntimeObject;
}

function localCapabilities(
  valueHosts: Readonly<Record<string, unknown>>,
  sessions: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { schemaEditor: { valueHosts, sessions } };
}

function resolve(
  runtime: DefaultHalfcodeRuntimeObject,
  valueHostId: string,
  sessionId: string,
  input: Readonly<Record<string, unknown>> = Object.freeze({}),
): ResolvedScopeBridge | undefined {
  return resolveSchemaEditorScopeBridge!(runtime, input, { valueHostId, sessionId });
}

describe('Schema Editor Scope bridge T2.1 public surface', () => {
  it('exports a three-parameter stable-id Scope bridge resolver', () => {
    expect(
      support.resolveSchemaEditorScopeBridge,
      'support root must export resolveSchemaEditorScopeBridge before scoped capability behavior can run',
    ).toBeTypeOf('function');
    expect(support.resolveSchemaEditorScopeBridge).toHaveLength(3);
  });
});

describe.runIf(bridgeApiAvailable)('Schema Editor Scope bridge T2.1 red behavior', () => {
  it('inherits parent capabilities, applies the nearest child override, and isolates siblings', () => {
    const parentHost = Object.freeze({ id: 'parent-host' });
    const childHost = Object.freeze({ id: 'child-host' });
    const siblingHost = Object.freeze({ id: 'sibling-host' });
    const parentSession = Object.freeze({ id: 'parent-session' });
    const childSession = Object.freeze({ id: 'child-session' });
    const siblingSession = Object.freeze({ id: 'sibling-session' });
    const host = createDefaultHalfcodeRuntime();
    const root = bindScope(host, {
      scopeId: 'root',
      runtime: host,
      bindings: localCapabilities(
        { parentOnly: parentHost, shared: parentHost },
        { parentOnly: parentSession, shared: parentSession },
      ),
    });
    const child = bindScope(root, {
      scopeId: 'child',
      runtime: root,
      bindings: localCapabilities(
        { childOnly: childHost, shared: childHost },
        { childOnly: childSession, shared: childSession },
      ),
    });
    const sibling = bindScope(root, {
      scopeId: 'sibling',
      runtime: root,
      bindings: localCapabilities(
        { siblingOnly: siblingHost },
        { siblingOnly: siblingSession },
      ),
    });

    expect(resolve(child, 'parentOnly', 'parentOnly')).toEqual({
      valueHostId: 'parentOnly',
      sessionId: 'parentOnly',
      valueHost: parentHost,
      session: parentSession,
    });
    expect(resolve(child, 'shared', 'shared')).toEqual({
      valueHostId: 'shared',
      sessionId: 'shared',
      valueHost: childHost,
      session: childSession,
    });
    expect(resolve(sibling, 'shared', 'shared')).toEqual({
      valueHostId: 'shared',
      sessionId: 'shared',
      valueHost: parentHost,
      session: parentSession,
    });
    expect(resolve(sibling, 'childOnly', 'childOnly')).toBeUndefined();
    expect(resolve(child, 'siblingOnly', 'siblingOnly')).toBeUndefined();
  });

  it('uses opaque ids and only the preassembled runtime chain, without reading provenance or sources', () => {
    const valueHost = Object.freeze({ id: 'string-host' });
    const session = Object.freeze({ id: 'string-session' });
    const numericHost = Object.freeze({ id: 'numeric-looking-host' });
    const numericSession = Object.freeze({ id: 'numeric-looking-session' });
    const runtime = createDefaultHalfcodeRuntime(
      'safe-scope',
      undefined,
      localCapabilities({ '01': valueHost, '1': numericHost }, { '02': session, '2': numericSession }),
    );
    const input = Object.defineProperties({}, {
      plan: {
        enumerable: true,
        get() {
          throw new Error('Scope bridge must not read EditorPlan.provenance');
        },
      },
      source: {
        enumerable: true,
        get() {
          throw new Error('Scope bridge must not rescan source');
        },
      },
      scopeRuntimePlans: {
        enumerable: true,
        get() {
          throw new Error('Scope bridge must not reassemble scopes');
        },
      },
    });

    expect(() => resolve(runtime, '01', '02', input)).not.toThrow();
    expect(resolve(runtime, '01', '02', input)).toEqual({
      valueHostId: '01',
      sessionId: '02',
      valueHost,
      session,
    });
    expect(resolve(runtime, '1', '2', input)).toEqual({
      valueHostId: '1',
      sessionId: '2',
      valueHost: numericHost,
      session: numericSession,
    });
  });

  it('keeps callable hosts and session instances as the exact capability values', () => {
    const valueHost = () => Promise.resolve({ kind: 'rejected' as const });
    const session = new class SessionProbe {
      readonly id = 'session-instance';
    }();
    const runtime = createDefaultHalfcodeRuntime(
      'identity-scope',
      undefined,
      localCapabilities({ host: valueHost }, { session }),
    );

    const bridge = resolve(runtime, 'host', 'session');

    expect(bridge?.valueHost).toBe(valueHost);
    expect(bridge?.session).toBe(session);
    expect(Object.isFrozen(valueHost)).toBe(false);
    expect(Object.isFrozen(session)).toBe(false);
  });
});
