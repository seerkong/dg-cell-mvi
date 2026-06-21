/**
 * `scope-runtime://` resolution helper (track add-halfcode-runtime-demo-execution).
 *
 * Boundary (docs spec/runtime/refs.md): this helper only resolves *visibility* —
 * walking the scope chain from the innermost scope outward to the nearest
 * Scope that binds the addressed RuntimeInstance — and returns the bound
 * runtime object plus the verbatim sub-path. It never interprets sub-path
 * projection values (`viewModel.value` …); reading them belongs to the runtime
 * object protocol and the caller.
 */

import {
  HALFCODE_RUNTIME_REF_UNRESOLVED,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  parseHalfcodeRef,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  HalfcodeRuntimeAssemblyDiagnostic,
  HalfcodeRuntimeUnitAssembly,
} from './runtimeAssembly';

export interface ResolvedScopeRuntimeRef {
  /** The scope-visible runtime object bound at the resolving scope. */
  runtime: unknown;
  /** Nearest scope along the chain that binds the addressed RuntimeInstance. */
  scopeId: string;
  /** RuntimeInstance id the ref addresses. */
  runtimeId: string;
  /** Verbatim sub-path after `#<id>/`; interpretation is the runtime object's. */
  subPath?: string;
}

export interface ResolveScopeRuntimeRefResult {
  resolved?: ResolvedScopeRuntimeRef;
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[];
}

/**
 * Resolve a `scope-runtime://#<id>[/sub]` ref against an assembled unit.
 *
 * `fromScope` is the scope the reference occurs in: either a single scope id
 * or an innermost-first scope-chain array. Within this track the chain comes
 * from the unit's scopes-domain declarations / element tree and the fixtures
 * only have a single scope, so accepting a caller-supplied chain array is the
 * whole scope-chain contract (no tree projection here by design).
 */
export function resolveScopeRuntimeRef(
  assembly: HalfcodeRuntimeUnitAssembly,
  fromScope: string | readonly string[],
  ref: string,
): ResolveScopeRuntimeRefResult {
  const diagnostics: HalfcodeRuntimeAssemblyDiagnostic[] = [];
  const fail = (message: string): ResolveScopeRuntimeRefResult => {
    diagnostics.push({
      severity: HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[HALFCODE_RUNTIME_REF_UNRESOLVED],
      code: HALFCODE_RUNTIME_REF_UNRESOLVED,
      message,
    });
    return { diagnostics };
  };

  let parsed;
  try {
    parsed = parseHalfcodeRef(ref);
  } catch (error) {
    return fail(`Malformed scope-runtime ref "${ref}": ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed.scheme !== 'scope-runtime' || !parsed.id) {
    return fail(`Ref "${ref}" must be scope-runtime://#<id>[/sub].`);
  }

  const chain = typeof fromScope === 'string' ? [fromScope] : [...fromScope];
  for (const scopeId of chain) {
    const binding = assembly.unit.scopeRuntimeBindings.find((candidate) => candidate.scopeId === scopeId);
    if (!binding?.runtime) continue;
    let bound;
    try {
      bound = parseHalfcodeRef(binding.runtime);
    } catch {
      continue;
    }
    if (bound.scheme !== 'runtime' || bound.id !== parsed.id) continue;
    const runtime = assembly.scopeRuntimes[scopeId];
    if (runtime === undefined) {
      return fail(
        `Scope #${scopeId} binds RuntimeInstance #${parsed.id} but no scope runtime was assembled for it ("${ref}").`,
      );
    }
    return {
      resolved: {
        runtime,
        scopeId,
        runtimeId: parsed.id,
        subPath: parsed.subPath,
      },
      diagnostics,
    };
  }

  return fail(
    `Ref "${ref}" is not visible from scope chain [${chain.join(' -> ')}]: no scope binds RuntimeInstance #${parsed.id}.`,
  );
}
