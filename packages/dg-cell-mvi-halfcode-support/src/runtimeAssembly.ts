import {
  HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED,
  HALFCODE_RUNTIME_EXECUTION_FAILED,
  HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
  HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED,
  HALFCODE_RUNTIME_REF_UNRESOLVED,
  HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  parseHalfcodeRef,
  type HalfcodeRef,
  type HalfcodeUnitDiagnosticCode,
  type MaterializedCallableEffectRegistry,
  type RuntimeProcessor,
  type RuntimeInstanceSpec,
  type RuntimeScopeAssembly,
  type RuntimeScopeBindingSpec,
  type ScopeRuntimePlan,
} from 'dg-cell-mvi-halfcode-contract';
import type { LoadedHalfcodeUnit } from './xnlUnitBundle';
import {
  materializeDataGraphScope,
  type DataGraphSymbolRole,
  type MountedHalfcodeDataGraphRegistry,
} from './dataGraphMaterializer';

export interface HalfcodeRuntimeAssemblyDiagnostic {
  severity: 'warning' | 'error';
  code: HalfcodeUnitDiagnosticCode;
  message: string;
  path?: string;
}

export interface RuntimeSymbolResolveContext {
  unit: LoadedHalfcodeUnit;
  runtimeInstance?: RuntimeInstanceSpec;
  scopeBinding?: RuntimeScopeBindingSpec;
  role:
    | 'runtime-src'
    | 'runtime-create'
    | 'runtime-derive'
    | 'effect-impl'
    | 'effect-impls'
    | DataGraphSymbolRole;
}

export interface RuntimeConfigResolveContext {
  unit: LoadedHalfcodeUnit;
  runtimeInstance?: RuntimeInstanceSpec;
  scopeBinding?: RuntimeScopeBindingSpec;
}

export type RuntimeSymbolResolver = (
  ref: HalfcodeRef,
  context: RuntimeSymbolResolveContext,
) => unknown | Promise<unknown>;

export type RuntimeConfigResolver = (
  ref: HalfcodeRef,
  context: RuntimeConfigResolveContext,
) => unknown | Promise<unknown>;

export interface AssembleHalfcodeRuntimeUnitOptions {
  hostRuntime?: unknown;
  /** Compiler-owned lexical Scope plan. Runtime code never reconstructs it from domains. */
  scopeRuntimePlans: ScopeRuntimePlan[];
  resolveSymbol: RuntimeSymbolResolver;
  resolveConfig?: RuntimeConfigResolver;
}

export interface HalfcodeRuntimeUnitAssembly {
  unit: LoadedHalfcodeUnit;
  runtimeInstances: Record<string, unknown>;
  scopeRuntimes: Record<string, unknown>;
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[];
}

export async function assembleHalfcodeRuntimeUnit(
  unit: LoadedHalfcodeUnit,
  options: AssembleHalfcodeRuntimeUnitOptions,
): Promise<HalfcodeRuntimeUnitAssembly> {
  const diagnostics: HalfcodeRuntimeAssemblyDiagnostic[] = [];
  const runtimeInstances: Record<string, unknown> = {};
  const scopeRuntimes: Record<string, unknown> = {};

  // Multi-pass assembly to convergence: RuntimeInstance declaration order is
  // irrelevant (spec/runtime/nodes.md §2) — a derived instance declared before
  // its prototype is deferred until the prototype has settled. A pass with
  // zero progress while instances remain means an unresolvable (missing or
  // cyclic) prototype chain: every remaining instance gets a
  // HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED diagnostic instead of looping.
  const declaredIds = new Set((unit.runtime?.instances ?? []).map((instance) => instance.id));
  const settled = new Set<string>();
  let pending = [...(unit.runtime?.instances ?? [])];
  while (pending.length) {
    const deferred: typeof pending = [];
    for (const instance of pending) {
      const prototypeId = instance.prototype ? prototypeIdOf(instance.prototype) : undefined;
      if (
        prototypeId !== undefined &&
        declaredIds.has(prototypeId) &&
        !settled.has(prototypeId)
      ) {
        deferred.push(instance);
        continue;
      }
      const runtime = await assembleRuntimeInstance(unit, instance, options, runtimeInstances, diagnostics);
      if (runtime !== undefined) runtimeInstances[instance.id] = runtime;
      settled.add(instance.id);
    }
    if (deferred.length === pending.length) {
      for (const instance of deferred) {
        pushDiagnostic(
          diagnostics,
          HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED,
          `RuntimeInstance #${instance.id} prototype "${instance.prototype}" cannot be resolved (missing or cyclic prototype chain).`,
        );
      }
      break;
    }
    pending = deferred;
  }

  const scopePlans = options.scopeRuntimePlans;
  const settledScopes = new Set<string>();
  const visibleScopeRuntimes = new Map<string, unknown>();
  let pendingScopes = [...scopePlans];
  while (pendingScopes.length) {
    const deferred: ScopeRuntimePlan[] = [];
    let progressed = false;
    for (const plan of pendingScopes) {
      if (plan.parentScopeId && !settledScopes.has(plan.parentScopeId)) {
        deferred.push(plan);
        continue;
      }
      const parentRuntime = plan.parentScopeId
        ? visibleScopeRuntimes.get(plan.parentScopeId)
        : options.hostRuntime;
      const runtime = await assembleScopeRuntime(
        unit,
        plan,
        parentRuntime,
        options,
        runtimeInstances,
        diagnostics,
      );
      settledScopes.add(plan.scopeId);
      visibleScopeRuntimes.set(plan.scopeId, runtime);
      if (runtime !== undefined) scopeRuntimes[plan.scopeId] = runtime;
      progressed = true;
    }
    if (!progressed) {
      for (const plan of deferred) {
        pushDiagnostic(
          diagnostics,
          HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
          `Scope #${plan.scopeId} parent Scope #${plan.parentScopeId} cannot be resolved in the lexical Scope plan.`,
        );
      }
      break;
    }
    pendingScopes = deferred;
  }

  return { unit, runtimeInstances, scopeRuntimes, diagnostics };
}

/** Prototype ref → runtime instance id, without emitting diagnostics (used for pass scheduling). */
function prototypeIdOf(ref: HalfcodeRef): string | undefined {
  try {
    const parsed = parseHalfcodeRef(ref);
    return parsed.scheme === 'runtime' ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

async function assembleRuntimeInstance(
  unit: LoadedHalfcodeUnit,
  instance: RuntimeInstanceSpec,
  options: AssembleHalfcodeRuntimeUnitOptions,
  runtimeInstances: Record<string, unknown>,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
): Promise<unknown> {
  const config = await resolveConfig(unit, options, { runtimeInstance: instance }, instance.config, diagnostics);
  const input: RuntimeScopeAssembly = {
    scopeId: `runtime:${instance.id}`,
    runtime: options.hostRuntime,
    config,
    bindings: {},
  };

  if (instance.src) {
    return resolveSymbol(unit, options, instance.src, { runtimeInstance: instance, role: 'runtime-src' }, diagnostics);
  }

  if (instance.create) {
    const create = await resolveSymbol(
      unit,
      options,
      instance.create,
      { runtimeInstance: instance, role: 'runtime-create' },
      diagnostics,
    );
    if (!isCallable(create)) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
        `RuntimeInstance #${instance.id} create ref did not resolve to a function.`,
      );
      return undefined;
    }
    return callRuntimeCode(
      diagnostics,
      HALFCODE_RUNTIME_EXECUTION_FAILED,
      `RuntimeInstance #${instance.id} create`,
      () => create(options.hostRuntime, input, config),
    );
  }

  if (instance.prototype) {
    const prototypeId = runtimeIdFromRef(instance.prototype, diagnostics, HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED);
    const prototypeRuntime = prototypeId ? runtimeInstances[prototypeId] : undefined;
    if (prototypeId && prototypeRuntime === undefined) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_RUNTIME_PROTOTYPE_UNRESOLVED,
        `RuntimeInstance #${instance.id} prototype runtime "${prototypeId}" has not been assembled.`,
      );
      return undefined;
    }
    const deriveInput: RuntimeScopeAssembly = {
      ...input,
      runtime: prototypeRuntime,
    };
    if (instance.derive) {
      const derive = await resolveSymbol(
        unit,
        options,
        instance.derive,
        { runtimeInstance: instance, role: 'runtime-derive' },
        diagnostics,
      );
      if (!isCallable(derive)) {
        pushDiagnostic(
          diagnostics,
          HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
          `RuntimeInstance #${instance.id} derive ref did not resolve to a function.`,
        );
        return undefined;
      }
      return callRuntimeCode(
        diagnostics,
        HALFCODE_RUNTIME_EXECUTION_FAILED,
        `RuntimeInstance #${instance.id} derive`,
        () => derive(prototypeRuntime, deriveInput, config),
      );
    }
    const prototypeProtocol = runtimeObjectProtocol(prototypeRuntime);
    if (prototypeProtocol?.deriveScope) {
      return callRuntimeCode(
        diagnostics,
        HALFCODE_RUNTIME_EXECUTION_FAILED,
        `RuntimeInstance #${instance.id} prototype.deriveScope`,
        () => prototypeProtocol.deriveScope?.(deriveInput),
      );
    }
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
      `RuntimeInstance #${instance.id} requires derive or a prototype runtime with deriveScope(input).`,
    );
  }

  return undefined;
}

async function assembleScopeRuntime(
  unit: LoadedHalfcodeUnit,
  plan: ScopeRuntimePlan,
  parentRuntime: unknown,
  options: AssembleHalfcodeRuntimeUnitOptions,
  runtimeInstances: Record<string, unknown>,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
): Promise<unknown> {
  const binding: RuntimeScopeBindingSpec = {
    scopeId: plan.scopeId,
    runtime: plan.runtime,
    config: plan.config,
    commands: plan.commands,
    events: plan.events,
    messagePolicy: plan.messagePolicy,
    effects: plan.effects,
  };
  let selectedRuntime = parentRuntime;
  if (plan.runtime) {
    const runtimeId = runtimeIdFromRef(plan.runtime, diagnostics, HALFCODE_RUNTIME_REF_UNRESOLVED);
    selectedRuntime = runtimeId ? runtimeInstances[runtimeId] : undefined;
    if (!runtimeId || selectedRuntime === undefined) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_RUNTIME_REF_UNRESOLVED,
        `Scope #${plan.scopeId} runtime ref "${plan.runtime}" did not resolve to an assembled RuntimeInstance.`,
      );
      return undefined;
    }
  }
  if (selectedRuntime === undefined) return undefined;

  const config = await resolveConfig(unit, options, { scopeBinding: binding }, plan.config, diagnostics);
  const effects = await materializeCallableEffects(unit, plan, binding, options, diagnostics);
  const runtimeBox: { current: unknown } = { current: selectedRuntime };
  const dataGraphs = await callRuntimeCode(
    diagnostics,
    HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
    `Scope #${plan.scopeId} data graph materialization`,
    () => materializeDataGraphScope(plan.dataGraphs, {
      scopeId: plan.scopeId,
      runtime: selectedRuntime,
      getRuntime: () => runtimeBox.current,
      resolveSymbol: (ref, role) => resolveSymbol(
        unit,
        options,
        ref,
        { scopeBinding: binding, role },
        diagnostics,
      ),
      resolveConfig: (ref) => resolveConfig(
        unit,
        options,
        { scopeBinding: binding },
        ref,
        diagnostics,
      ),
    }),
  ) as MountedHalfcodeDataGraphRegistry | undefined;
  const input: RuntimeScopeAssembly = {
    scopeId: plan.scopeId,
    runtime: parentRuntime,
    config,
    bindings: {
      config: plan.config,
      effects,
      dataGraphs,
      commands: plan.commands,
      events: plan.events,
      messagePolicy: plan.messagePolicy,
    },
    metadata: {
      ownerElementId: plan.ownerElementId,
      unitFqn: plan.unitFqn,
      ...(plan.parentScopeId ? { parentScopeId: plan.parentScopeId } : {}),
    },
  };
  let assembledRuntime: unknown = selectedRuntime;
  const protocol = runtimeObjectProtocol(selectedRuntime);
  if (protocol?.bindScope) {
    assembledRuntime = await callRuntimeCode(
      diagnostics,
      HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
      `Scope #${plan.scopeId} runtime.bindScope`,
      () => protocol.bindScope?.(input),
    );
  } else if (protocol?.deriveScope) {
    assembledRuntime = await callRuntimeCode(
      diagnostics,
      HALFCODE_RUNTIME_SCOPE_BINDING_FAILED,
      `Scope #${plan.scopeId} runtime.deriveScope`,
      () => protocol.deriveScope?.(input),
    );
  }
  runtimeBox.current = assembledRuntime;
  return assembledRuntime;
}

async function materializeCallableEffects(
  unit: LoadedHalfcodeUnit,
  plan: ScopeRuntimePlan,
  scopeBinding: RuntimeScopeBindingSpec,
  options: AssembleHalfcodeRuntimeUnitOptions,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
): Promise<MaterializedCallableEffectRegistry | undefined> {
  if (!plan.effects) return undefined;
  const registry: Record<string, {
    id: string;
    kind: 'function' | 'interface';
    impl: RuntimeProcessor;
    config?: unknown;
  }> = {};

  if (plan.effects.impls) {
    const bundle = await resolveSymbol(
      unit,
      options,
      plan.effects.impls,
      { scopeBinding, role: 'effect-impls' },
      diagnostics,
    );
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
        `Scope #${plan.scopeId} EffectBindings.impls did not resolve to an object map.`,
      );
    } else {
      for (const [id, impl] of Object.entries(bundle as Record<string, unknown>)) {
        if (!isCallable(impl)) {
          pushDiagnostic(
            diagnostics,
            HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
            `Scope #${plan.scopeId} effect bundle entry "${id}" is not callable.`,
          );
          continue;
        }
        registry[id] = { id, kind: 'function', impl: impl as RuntimeProcessor };
      }
    }
  }

  for (const effect of plan.effects.bindings) {
    const impl = await resolveSymbol(
      unit,
      options,
      effect.impl,
      { scopeBinding, role: 'effect-impl' },
      diagnostics,
    );
    if (!isCallable(impl)) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
        `Scope #${plan.scopeId} effect "${effect.id}" implementation is not callable.`,
      );
      continue;
    }
    const config = await resolveConfig(
      unit,
      options,
      { scopeBinding },
      effect.config,
      diagnostics,
    );
    registry[effect.id] = {
      id: effect.id,
      kind: effect.kind,
      impl: impl as RuntimeProcessor,
      ...(config !== undefined ? { config } : {}),
    };
  }

  return registry;
}

async function resolveSymbol(
  unit: LoadedHalfcodeUnit,
  options: AssembleHalfcodeRuntimeUnitOptions,
  ref: HalfcodeRef,
  context: Omit<RuntimeSymbolResolveContext, 'unit'>,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
): Promise<unknown> {
  try {
    return await options.resolveSymbol(ref, { unit, ...context });
  } catch (error) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_REF_UNRESOLVED,
      `Failed to resolve runtime symbol "${ref}": ${toErrorMessage(error)}`,
    );
    return undefined;
  }
}

async function resolveConfig(
  unit: LoadedHalfcodeUnit,
  options: AssembleHalfcodeRuntimeUnitOptions,
  context: Omit<RuntimeConfigResolveContext, 'unit'>,
  ref: HalfcodeRef | undefined,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
): Promise<unknown> {
  if (!ref || !options.resolveConfig) return undefined;
  try {
    return await options.resolveConfig(ref, { unit, ...context });
  } catch (error) {
    const owner = context.runtimeInstance
      ? `RuntimeInstance #${context.runtimeInstance.id}`
      : `Scope #${context.scopeBinding?.scopeId ?? 'unknown'}`;
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_CONFIG_RESOLUTION_FAILED,
      `${owner} failed to resolve config "${ref}": ${toErrorMessage(error)}`,
    );
    return undefined;
  }
}

/**
 * Run runtime code with the failure category supplied by the call site:
 * create/derive/prototype.deriveScope execution throws are
 * HALFCODE_RUNTIME_EXECUTION_FAILED; bindScope/deriveScope failures while
 * assembling a Scope stay HALFCODE_RUNTIME_SCOPE_BINDING_FAILED.
 */
async function callRuntimeCode(
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
  label: string,
  fn: () => unknown | Promise<unknown>,
): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    pushDiagnostic(diagnostics, code, `${label} failed: ${toErrorMessage(error)}`);
    return undefined;
  }
}

function runtimeIdFromRef(
  ref: HalfcodeRef,
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
): string | undefined {
  try {
    const parsed = parseHalfcodeRef(ref);
    if (parsed.scheme === 'runtime' && parsed.id) return parsed.id;
  } catch {
    // Fall through to one stable diagnostic below.
  }
  pushDiagnostic(diagnostics, code, `Runtime ref "${ref}" must be runtime://#<id>.`);
  return undefined;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

interface RuntimeObjectProtocol {
  bindScope?: (input: RuntimeScopeAssembly<unknown>) => unknown | Promise<unknown>;
  deriveScope?: (input: RuntimeScopeAssembly<unknown>) => unknown | Promise<unknown>;
}

function runtimeObjectProtocol(value: unknown): RuntimeObjectProtocol | undefined {
  return value && typeof value === 'object' ? value as RuntimeObjectProtocol : undefined;
}

function pushDiagnostic(
  diagnostics: HalfcodeRuntimeAssemblyDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
  message: string,
): void {
  diagnostics.push({
    severity: HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[code],
    code,
    message,
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
