import { describe, expect, it } from 'vitest';
import {
  asHalfcodeRef,
  executeHalfcodeRuntimeCode,
} from '../src';

describe('executeHalfcodeRuntimeCode', () => {
  it('executes output = fn(runtime, input, config)', async () => {
    const runtime = { effects: { inc: (value: number) => value + 1 } };
    const calls: unknown[] = [];
    const result = await executeHalfcodeRuntimeCode<number>({
      src: asHalfcodeRef('vfs://./handlers.ts#increment'),
      runtime,
      input: { value: 4 },
      config: { by: 1 },
      resolveSymbol: () => (
        receivedRuntime: typeof runtime,
        input: { value: number },
        config: { by: number },
      ) => {
        calls.push({ receivedRuntime, input, config });
        return receivedRuntime.effects.inc(input.value) + config.by;
      },
    });

    expect(result).toEqual({ output: 6, diagnostics: [] });
    expect(calls).toEqual([
      {
        receivedRuntime: runtime,
        input: { value: 4 },
        config: { by: 1 },
      },
    ]);
  });

  it('executes output = fn(runtime, instanceRefs, input, config)', async () => {
    const runtime = { kind: 'canvas-runtime' };
    const result = await executeHalfcodeRuntimeCode<number>({
      src: asHalfcodeRef('vfs://./handlers.ts#bulkEdit'),
      runtime,
      instanceRefs: [{ ref: 'canvas://#shape-1' }, { ref: 'canvas://#shape-2' }],
      input: { delta: 3 },
      config: { base: 10 },
      resolveSymbol: () => (
        receivedRuntime: typeof runtime,
        instanceRefs: Array<{ ref: string }>,
        input: { delta: number },
        config: { base: number },
      ) => {
        expect(receivedRuntime).toBe(runtime);
        return instanceRefs.length + input.delta + config.base;
      },
    });

    expect(result).toEqual({ output: 15, diagnostics: [] });
  });

  it('reports protocol mismatch for non-callable symbols', async () => {
    const result = await executeHalfcodeRuntimeCode({
      src: asHalfcodeRef('vfs://./handlers.ts#notCallable'),
      runtime: {},
      resolveSymbol: () => ({ not: 'callable' }),
    });

    expect(result.output).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'HALFCODE_RUNTIME_PROTOCOL_MISMATCH' }),
    ]);
  });

  it('reports thrown resolver and execution errors with their own diagnostic codes', async () => {
    // Symbol resolution failure → HALFCODE_RUNTIME_REF_UNRESOLVED
    // (replan-002 code semantics; was SCOPE_BINDING_FAILED before G2R-T2).
    const resolveFail = await executeHalfcodeRuntimeCode({
      src: asHalfcodeRef('vfs://./handlers.ts#missing'),
      runtime: {},
      resolveSymbol: () => {
        throw new Error('missing module');
      },
    });
    expect(resolveFail.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_REF_UNRESOLVED',
        severity: 'error',
        message: expect.stringContaining('missing module'),
      }),
    ]);

    // Code entry throwing during execution → HALFCODE_RUNTIME_EXECUTION_FAILED.
    const executeFail = await executeHalfcodeRuntimeCode({
      src: asHalfcodeRef('vfs://./handlers.ts#throws'),
      runtime: {},
      resolveSymbol: () => () => {
        throw new Error('boom');
      },
    });
    expect(executeFail.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HALFCODE_RUNTIME_EXECUTION_FAILED',
        severity: 'error',
        message: expect.stringContaining('boom'),
      }),
    ]);
  });
});
