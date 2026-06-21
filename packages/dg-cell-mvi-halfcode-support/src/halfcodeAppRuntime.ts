import {
  HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
  HALFCODE_RUNTIME_REF_UNRESOLVED,
  type HalfcodeRef,
  type RenderNodePlan,
  type RuntimeInstanceRef,
  type UnitCompileResult,
  type UnitFqn,
} from 'dg-cell-mvi-halfcode-contract';
import {
  appEventToMessage,
  appMessageToEvent,
  commandMessage,
  type AppEvent,
} from 'dg-cell-mvi-core';
import { compileHalfcodeUnitBundle } from 'dg-cell-mvi-halfcode-logic';
import {
  assembleHalfcodeRuntimeUnit,
  type HalfcodeRuntimeUnitAssembly,
  type RuntimeConfigResolveContext,
  type RuntimeSymbolResolveContext,
} from './runtimeAssembly';
import {
  executeHalfcodeRuntimeCode,
  type ExecuteHalfcodeRuntimeCodeResult,
} from './runtimeExecution';
import {
  loadHalfcodeUnitBundle,
  type HalfcodeUnitBundleResolver,
  type LoadHalfcodeUnitBundleOptions,
  type LoadedHalfcodeUnit,
  type LoadedHalfcodeUnitBundle,
} from './xnlUnitBundle';
import { createDefaultHalfcodeRuntime } from './defaultRuntime';
import { bindHalfcodeFlows, materializeHalfcodeFlows } from './flowMaterializer';
import type {
  HalfcodeFlowHandle,
  HalfcodeFlowHandleFactoryRegistry,
  HalfcodeFlowHandleRegistry,
  MaterializeHalfcodeFlowsOptions,
  ResolveHalfcodeFlowOptions,
} from './flowHandles';

export type HalfcodeAppSymbolRole = RuntimeSymbolResolveContext['role'] | 'runtime-code-entry';

export interface HalfcodeAppSymbolResolveContext {
  unit: LoadedHalfcodeUnit;
  role: HalfcodeAppSymbolRole;
  runtimeInstance?: RuntimeSymbolResolveContext['runtimeInstance'];
  scopeBinding?: RuntimeSymbolResolveContext['scopeBinding'];
}

export interface HalfcodeAppConfigResolveContext extends RuntimeConfigResolveContext {}

export interface CreateHalfcodeAppRuntimeOptions {
  hostRuntime?: unknown;
  /** Required when the bundle contains Flow units. */
  flows?: MaterializeHalfcodeFlowsOptions;
  resolveSymbol(
    ref: HalfcodeRef,
    context: HalfcodeAppSymbolResolveContext,
  ): unknown | Promise<unknown>;
  resolveConfig?(
    ref: HalfcodeRef,
    context: HalfcodeAppConfigResolveContext,
  ): unknown | Promise<unknown>;
}

export interface DispatchHalfcodeCommandOptions<TInput = unknown> {
  unitFqn: UnitFqn | string;
  elementId: string;
  input?: TInput;
  instanceRefs?: RuntimeInstanceRef[];
}

export interface HalfcodeAppRuntime {
  readonly bundle: LoadedHalfcodeUnitBundle;
  readonly plans: UnitCompileResult;
  readonly assemblies: Readonly<Record<string, HalfcodeRuntimeUnitAssembly>>;
  readonly flows: HalfcodeFlowHandleRegistry;
  resolveScope(unitFqn: UnitFqn | string, scopeId: string): unknown;
  resolveFlow(
    flowFqn: UnitFqn | string,
    options?: ResolveHalfcodeFlowOptions,
  ): HalfcodeFlowHandle | undefined;
  resolveConfig(unitFqn: UnitFqn | string, ref: HalfcodeRef | string): unknown;
  dispatchCommand<TOutput = unknown, TInput = unknown>(
    options: DispatchHalfcodeCommandOptions<TInput>,
  ): Promise<ExecuteHalfcodeRuntimeCodeResult<TOutput> & {
    commandEvent?: AppEvent<TInput | undefined>;
  }>;
  dispose(): void;
}

export async function loadHalfcodeAppRuntime(
  resolver: HalfcodeUnitBundleResolver,
  bundleSrc: string,
  loadOptions: LoadHalfcodeUnitBundleOptions,
  runtimeOptions: CreateHalfcodeAppRuntimeOptions,
): Promise<HalfcodeAppRuntime> {
  return createHalfcodeAppRuntime(
    loadHalfcodeUnitBundle(resolver, bundleSrc, loadOptions),
    runtimeOptions,
  );
}

export async function createHalfcodeAppRuntime(
  bundle: LoadedHalfcodeUnitBundle,
  options: CreateHalfcodeAppRuntimeOptions,
): Promise<HalfcodeAppRuntime> {
  const plans = compileHalfcodeUnitBundle(bundle);
  const assemblies: Record<string, HalfcodeRuntimeUnitAssembly> = {};
  const flowFactories = await materializeAppFlows(bundle, options.flows);
  const hostRuntime = options.hostRuntime ?? createDefaultHalfcodeRuntime(
    'halfcode:host',
    undefined,
    appRuntimeBindings(bundle, flowFactories),
  );
  const flows = bindHalfcodeFlows(flowFactories, hostRuntime);
  const renderConfigBindings = await resolveRenderConfigBindings(bundle, plans, options);

  for (const unit of Object.values(bundle.units)) {
    assemblies[unit.fqn] = await assembleHalfcodeRuntimeUnit(unit, {
      hostRuntime,
      scopeRuntimePlans: plans.scopeRuntimePlans.filter((plan) => plan.unitFqn === unit.fqn),
      resolveSymbol: (ref, context) => options.resolveSymbol(ref, context),
      resolveConfig: options.resolveConfig
        ? (ref, context) => options.resolveConfig?.(ref, context)
        : undefined,
    });
  }

  let disposed = false;
  return {
    bundle,
    plans,
    assemblies,
    flows,

    resolveScope(unitFqn, scopeId) {
      return assemblies[unitFqn]?.scopeRuntimes[scopeId];
    },

    resolveFlow(flowFqn, resolveOptions) {
      if (!resolveOptions) return flows[flowFqn];
      const runtime = assemblies[resolveOptions.unitFqn]?.scopeRuntimes[resolveOptions.scopeId];
      if (runtime === undefined) return undefined;
      const runtimeFlow = (runtime as {
        flow?: (name: string) => HalfcodeFlowHandle | undefined;
      }).flow?.(String(flowFqn));
      return runtimeFlow ?? flowFactories[flowFqn]?.bind(runtime);
    },

    resolveConfig(unitFqn, ref) {
      return renderConfigBindings.get(renderConfigBindingKey(unitFqn, ref));
    },

    async dispatchCommand<TOutput = unknown, TInput = unknown>(
      dispatchOptions: DispatchHalfcodeCommandOptions<TInput>,
    ): Promise<ExecuteHalfcodeRuntimeCodeResult<TOutput> & {
      commandEvent?: AppEvent<TInput | undefined>;
    }> {
      const entry = plans.messageDispatchPlan.entries.find((candidate) =>
        candidate.unitFqn === dispatchOptions.unitFqn &&
        candidate.elementId === dispatchOptions.elementId);
      const unit = bundle.units[dispatchOptions.unitFqn];
      if (!entry || !entry.handler || !unit) {
        return {
          diagnostics: [{
            severity: 'error',
            code: HALFCODE_RUNTIME_REF_UNRESOLVED,
            message: `Command element "${dispatchOptions.elementId}" in unit "${dispatchOptions.unitFqn}" has no compiled handler.`,
          }],
        };
      }
      const runtime = assemblies[unit.fqn]?.scopeRuntimes[entry.scopeId];
      if (runtime === undefined) {
        return {
          diagnostics: [{
            severity: 'error',
            code: HALFCODE_RUNTIME_REF_UNRESOLVED,
            message: `Scope #${entry.scopeId} for command element "${entry.elementId}" is not assembled.`,
          }],
        };
      }
      const policy = visibleMessagePolicyId(
        plans,
        String(entry.unitFqn),
        entry.scopeId,
      );
      const commandEvent = appMessageToEvent(commandMessage(
        entry.commandType,
        dispatchOptions.input,
        {
          ...(entry.payloadDef ? { payloadDef: String(entry.payloadDef) } : {}),
          ...(policy ? { policy } : {}),
        },
      ));
      const command = appEventToMessage(commandEvent);
      if (!command || command.kind !== 'command') {
        return {
          commandEvent,
          diagnostics: [{
            severity: 'error',
            code: HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
            message: `Compiled Command "${entry.commandType}" could not be decoded from its canonical dg-cell-mvi transport.`,
          }],
        };
      }
      const execution = await executeHalfcodeRuntimeCode<TOutput, TInput | undefined>({
        src: entry.handler,
        runtime,
        input: command.payload,
        config: entry.config,
        instanceRefs: dispatchOptions.instanceRefs,
        resolveSymbol: (ref) => options.resolveSymbol(ref, { unit, role: 'runtime-code-entry' }),
      });
      return { ...execution, commandEvent };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      const seen = new Set<unknown>();
      for (const assembly of Object.values(assemblies)) {
        for (const runtime of [
          ...Object.values(assembly.scopeRuntimes),
          ...Object.values(assembly.runtimeInstances),
        ]) {
          if (!runtime || seen.has(runtime)) continue;
          seen.add(runtime);
          const dispose = (runtime as { dispose?: () => void }).dispose;
          if (typeof dispose === 'function') dispose.call(runtime);
        }
      }
    },
  };
}

async function resolveRenderConfigBindings(
  bundle: LoadedHalfcodeUnitBundle,
  plans: UnitCompileResult,
  options: CreateHalfcodeAppRuntimeOptions,
): Promise<ReadonlyMap<string, unknown>> {
  const bindings = new Map<string, unknown>();
  if (!options.resolveConfig) return bindings;

  for (const plan of plans.renderPlans) {
    const unit = bundle.units[plan.unitFqn];
    if (!unit) continue;
    for (const ref of collectRenderConfigRefs(plan.root)) {
      const key = renderConfigBindingKey(plan.unitFqn, ref);
      if (bindings.has(key)) continue;
      bindings.set(key, await options.resolveConfig(ref, { unit }));
    }
  }
  return bindings;
}

function collectRenderConfigRefs(nodes: readonly RenderNodePlan[]): HalfcodeRef[] {
  const refs: HalfcodeRef[] = [];
  const visit = (node: RenderNodePlan): void => {
    if ((node.kind === 'atom' || node.kind === 'component') && node.propsBinding) {
      refs.push(node.propsBinding);
    }
    if (node.kind === 'page-embed' && node.urlInputsBinding) {
      refs.push(node.urlInputsBinding);
    }
    for (const child of node.children ?? []) visit(child);
    for (const slot of node.slots ?? []) {
      for (const child of slot.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return refs;
}

function renderConfigBindingKey(unitFqn: UnitFqn | string, ref: HalfcodeRef | string): string {
  return `${String(unitFqn)}\u0000${String(ref)}`;
}

function appRuntimeBindings(
  bundle: LoadedHalfcodeUnitBundle,
  flows: HalfcodeFlowHandleFactoryRegistry,
): Record<string, unknown> {
  const fixtures = bundle.app.domains.fixtures?.data.mockRecords;
  return {
    ...(fixtures === undefined ? {} : { fixtures }),
    ...(Object.keys(flows).length === 0 ? {} : { flows }),
  };
}

async function materializeAppFlows(
  bundle: LoadedHalfcodeUnitBundle,
  options: MaterializeHalfcodeFlowsOptions | undefined,
): Promise<HalfcodeFlowHandleFactoryRegistry> {
  const hasFlows = Object.values(bundle.units).some((unit) => unit.flow !== undefined);
  if (!hasFlows) return {};
  if (!options) throw new Error('Halfcode AppRuntime Flow units require injected flow materialization options.');
  return materializeHalfcodeFlows(bundle, options);
}

function visibleMessagePolicyId(
  plans: UnitCompileResult,
  unitFqn: string,
  scopeId: string,
): string | undefined {
  const visited = new Set<string>();
  let currentScopeId: string | undefined = scopeId;
  while (currentScopeId && !visited.has(currentScopeId)) {
    visited.add(currentScopeId);
    const plan = plans.scopeRuntimePlans.find((candidate) =>
      candidate.unitFqn === unitFqn && candidate.scopeId === currentScopeId);
    if (!plan) return undefined;
    if (plan.messagePolicy) return plan.messagePolicy.id;
    currentScopeId = plan.parentScopeId;
  }
  return undefined;
}
