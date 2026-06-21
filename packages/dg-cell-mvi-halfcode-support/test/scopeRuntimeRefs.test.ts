import { describe, expect, it } from 'vitest';
import {
  asHalfcodeRef,
  asUnitFqn,
  resolveScopeRuntimeRef,
  type HalfcodeRuntimeUnitAssembly,
  type LoadedHalfcodeUnit,
} from '../src';

function assemblyWith(
  bindings: LoadedHalfcodeUnit['scopeRuntimeBindings'],
  scopeRuntimes: Record<string, unknown>,
): HalfcodeRuntimeUnitAssembly {
  const fqn = asUnitFqn('dg.runtime.CounterPage');
  return {
    unit: {
      fqn,
      kind: 'page',
      form: 'folder',
      path: '/runtime/counter',
      manifest: { kind: 'page', fqn, version: '1.0.0', domains: [] },
      domains: {},
      scopeRuntimeBindings: bindings,
    },
    runtimeInstances: {},
    scopeRuntimes,
    diagnostics: [],
  };
}

describe('resolveScopeRuntimeRef', () => {
  const counterRuntime = { kind: 'scope-runtime', viewModel: { value: 3 } };

  it('resolves a visible runtime instance through the binding scope', () => {
    const assembly = assemblyWith(
      [
        {
          scopeId: 'counter-page',
          runtime: asHalfcodeRef('runtime://#counter'),
        },
      ],
      { 'counter-page': counterRuntime },
    );

    const result = resolveScopeRuntimeRef(assembly, 'counter-page', 'scope-runtime://#counter');
    expect(result.diagnostics).toEqual([]);
    expect(result.resolved).toEqual({
      runtime: counterRuntime,
      scopeId: 'counter-page',
      runtimeId: 'counter',
      subPath: undefined,
    });
  });

  it('returns the verbatim subPath without interpreting projection values (refs.md boundary)', () => {
    const assembly = assemblyWith(
      [
        {
          scopeId: 'counter-page',
          runtime: asHalfcodeRef('runtime://#counter'),
        },
      ],
      { 'counter-page': counterRuntime },
    );

    const result = resolveScopeRuntimeRef(
      assembly,
      'counter-page',
      'scope-runtime://#counter/viewModel.value',
    );
    expect(result.resolved).toMatchObject({
      runtime: counterRuntime,
      subPath: 'viewModel.value',
    });
    // The helper hands back the object; the projection read is the caller's.
    expect((result.resolved?.runtime as typeof counterRuntime).viewModel.value).toBe(3);
  });

  it('walks an innermost-first scope chain to the nearest binding scope', () => {
    const innerRuntime = { kind: 'inner' };
    const outerRuntime = { kind: 'outer' };
    const assembly = assemblyWith(
      [
        { scopeId: 'outer-scope', runtime: asHalfcodeRef('runtime://#counter') },
        { scopeId: 'inner-scope', runtime: asHalfcodeRef('runtime://#counter') },
        { scopeId: 'plain-scope', config: asHalfcodeRef('config://#plain') },
      ],
      { 'outer-scope': outerRuntime, 'inner-scope': innerRuntime },
    );

    // plain-scope binds nothing → the nearest binder along the chain wins.
    const result = resolveScopeRuntimeRef(
      assembly,
      ['plain-scope', 'inner-scope', 'outer-scope'],
      'scope-runtime://#counter',
    );
    expect(result.resolved).toMatchObject({ runtime: innerRuntime, scopeId: 'inner-scope' });
  });

  it('reports HALFCODE_RUNTIME_REF_UNRESOLVED when the instance is not visible from the chain', () => {
    const assembly = assemblyWith(
      [
        {
          scopeId: 'counter-page',
          runtime: asHalfcodeRef('runtime://#counter'),
        },
      ],
      { 'counter-page': counterRuntime },
    );

    const result = resolveScopeRuntimeRef(assembly, 'counter-page', 'scope-runtime://#other');
    expect(result.resolved).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_REF_UNRESOLVED',
        severity: 'error',
        message: expect.stringContaining('#other'),
      }),
    ]);
  });

  it('does not make a sibling scope binding visible', () => {
    const assembly = assemblyWith(
      [
        { scopeId: 'left-scope', runtime: asHalfcodeRef('runtime://#counter') },
        { scopeId: 'right-scope', runtime: asHalfcodeRef('runtime://#other') },
      ],
      {
        'left-scope': counterRuntime,
        'right-scope': { kind: 'right' },
      },
    );

    const result = resolveScopeRuntimeRef(assembly, 'right-scope', 'scope-runtime://#counter');
    expect(result.resolved).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_REF_UNRESOLVED',
        message: expect.stringContaining('right-scope'),
      }),
    ]);
  });

  it('rejects refs that are not scope-runtime://#<id>', () => {
    const assembly = assemblyWith([], {});
    for (const ref of ['runtime://#counter', 'scope-runtime://counter', 'not-a-ref']) {
      const result = resolveScopeRuntimeRef(assembly, 'counter-page', ref);
      expect(result.resolved, ref).toBeUndefined();
      expect(result.diagnostics[0]).toMatchObject({ code: 'HALFCODE_RUNTIME_REF_UNRESOLVED' });
    }
  });
});
