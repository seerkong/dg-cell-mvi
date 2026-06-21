import { describe, expect, it } from 'vitest';
import {
  HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED,
  HALFCODE_RUNTIME_DSL_UNSUPPORTED,
  HALFCODE_RUNTIME_EXECUTION_FAILED,
  HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
  HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
  HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
  HALFCODE_UNIT_DIAGNOSTIC_CODES,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  asHalfcodeRef,
  runtimeInstanceSource,
  runtimeInstanceSourceFields,
  validateRuntimeInstanceSpec,
  type HalfcodeRuntimeObject,
  type RuntimeCreate,
  type RuntimeDerive,
  type RuntimeInstanceProcessor,
  type RuntimeProcessor,
  type RuntimeScopeBindingSpec,
  type RuntimeScopeAssembly,
} from '../src';

describe('RuntimeInstance contract source selection', () => {
  it('exports direct Scope runtime binding shape', () => {
    const binding: RuntimeScopeBindingSpec = {
      scopeId: 'counter-page',
      runtime: asHalfcodeRef('runtime://#counter'),
      config: asHalfcodeRef('config://#counter-page'),
      commands: asHalfcodeRef('command://#counter-page-commands'),
      events: asHalfcodeRef('event://#counter-page-events'),
    };
    expect(binding.runtime).toBe('runtime://#counter');
  });

  it('accepts exactly one source field', () => {
    const srcSpec = { id: 'admin', src: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#adminRuntime') };
    const createSpec = { id: 'admin', create: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#createAdminRuntime') };
    const deriveSpec = {
      id: 'users-page',
      prototype: asHalfcodeRef('runtime://#admin-root'),
      derive: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#deriveAdminRuntime'),
    };

    expect(runtimeInstanceSourceFields(srcSpec)).toEqual(['src']);
    expect(runtimeInstanceSource(createSpec)).toEqual({ field: 'create', ref: createSpec.create });
    expect(validateRuntimeInstanceSpec(deriveSpec)).toEqual({ ok: true, issues: [] });
  });

  it('rejects missing or ambiguous runtime sources', () => {
    expect(validateRuntimeInstanceSpec({ id: 'missing' })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: HALFCODE_RUNTIME_SOURCE_AMBIGUOUS })],
    });

    const result = validateRuntimeInstanceSpec({
      id: 'ambiguous',
      src: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#adminRuntime'),
      create: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#createAdminRuntime'),
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toEqual(expect.objectContaining({
      code: HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
    }));
  });

  it('requires prototype when derive is declared', () => {
    const result = validateRuntimeInstanceSpec({
      id: 'invalid',
      create: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#createAdminRuntime'),
      derive: asHalfcodeRef('vfs://./runtime/admin.runtime.ts#deriveAdminRuntime'),
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.derive', code: HALFCODE_RUNTIME_SOURCE_AMBIGUOUS }),
      ]),
    );
  });
});

describe('runtime protocol typing', () => {
  it('models factories and processors as output = fn(runtime, input, config)', async () => {
    interface AdminRuntime extends HalfcodeRuntimeObject {
      value: number;
    }
    const create: RuntimeCreate<AdminRuntime | undefined, RuntimeScopeAssembly<AdminRuntime>, { base: number }, AdminRuntime> = (
      runtime,
      input,
      config,
    ) => ({
      value: (runtime?.value ?? config.base) + (input.bindings?.delta as number),
    });
    const derive: RuntimeDerive<AdminRuntime, RuntimeScopeAssembly<AdminRuntime>, { delta: number }, AdminRuntime> = (
      runtime,
      _input,
      config,
    ) => ({ value: runtime.value + config.delta });
    const run: RuntimeProcessor<AdminRuntime, { by: number }, undefined, number> = (
      runtime,
      input,
      _config,
    ) => runtime.value + input.by;
    const runSelected: RuntimeInstanceProcessor<AdminRuntime, { by: number }, undefined, number> = (
      runtime,
      instanceRefs,
      input,
      _config,
    ) => runtime.value + input.by + instanceRefs.length;

    const root = create(undefined, { scopeId: 'root', bindings: { delta: 2 } }, { base: 10 });
    const child = derive(root, { scopeId: 'child', runtime: root }, { delta: 3 });
    expect(await run(child, { by: 1 }, undefined)).toBe(16);
    expect(await runSelected(child, [{ ref: 'rows://#1' }], { by: 1 }, undefined)).toBe(17);
  });
});

describe('runtime diagnostics', () => {
  it('exports runtime diagnostic codes with error severity', () => {
    expect(HALFCODE_UNIT_DIAGNOSTIC_CODES).toEqual(
      expect.arrayContaining([
        HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
        HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
        HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
        HALFCODE_RUNTIME_EXECUTION_FAILED,
        HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED,
        HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      ]),
    );
    expect(HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_PROTOCOL_MISMATCH]).toBe('error');
    expect(HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_SCOPE_BINDING_FAILED]).toBe('error');
    expect(HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_EXECUTION_FAILED]).toBe('error');
    expect(HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED]).toBe('error');
    expect(HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_DSL_UNSUPPORTED]).toBe('error');
  });
});
