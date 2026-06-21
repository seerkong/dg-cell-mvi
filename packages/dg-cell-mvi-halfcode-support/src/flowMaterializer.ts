import { BizProcessEngine } from 'biz-process-logic/browser';
import type {
  EagerDataFlowAuthoringPlan,
  EagerDataFlowExecutable,
} from 'eager-data-flow-contract';
import { materializeEagerDataFlowPlan } from 'eager-data-flow-logic/browser';
import type { FlowBundleSpec, UnitFqn } from 'dg-cell-mvi-halfcode-contract';
import { materializeInstantFlowSpec } from 'instant-flow-logic/browser';
import { WorkFlowEngine } from 'work-flow-logic/browser';
import type { WorkFlowRuntime } from 'work-flow-contract';
import type {
  BizProcessHandle,
  EagerDataFlowHandle,
  HalfcodeFlowCodeResolutionRequest,
  HalfcodeFlowHandle,
  HalfcodeFlowHandleFactory,
  HalfcodeFlowHandleFactoryRegistry,
  InstantFlowHandle,
  MaterializeHalfcodeFlowsOptions,
  WorkFlowHandle,
} from './flowHandles';
import type { LoadedHalfcodeUnit, LoadedHalfcodeUnitBundle } from './xnlUnitBundle';

const CONTROL_FORM_BY_SCHEME = {
  'instant-flow': 'InstantFlow',
  'work-flow': 'WorkFlow',
  'biz-process': 'BizProcess',
} as const;

export async function materializeHalfcodeFlows(
  bundle: LoadedHalfcodeUnitBundle,
  options: MaterializeHalfcodeFlowsOptions,
): Promise<HalfcodeFlowHandleFactoryRegistry> {
  const factories: Record<string, HalfcodeFlowHandleFactory> = {};
  const resolveFlow = createBundleLocalFlowResolver(bundle, options);
  const eagerExecutables: Record<string, EagerDataFlowExecutable<unknown>> = {};
  const eagerUnits = Object.values(bundle.units).filter(
    (unit): unit is LoadedHalfcodeUnit & { flow: EagerDataFlowAuthoringPlan } =>
      unit.kind === 'eager-data-flow' && unit.flow?.form === 'EagerDataFlow',
  );
  const eagerByFqn = new Map(eagerUnits.map((unit) => [String(unit.fqn), unit]));

  const materializeEager = async (
    unit: LoadedHalfcodeUnit & { flow: EagerDataFlowAuthoringPlan },
    stack: Set<string>,
  ): Promise<EagerDataFlowExecutable<unknown>> => {
    const fqn = String(unit.fqn);
    const existing = eagerExecutables[fqn];
    if (existing) return existing;
    if (stack.has(fqn)) throw new Error(`EagerDataFlow subflow cycle reached materialization: ${fqn}`);
    const nextStack = new Set(stack).add(fqn);
    const subflows: Record<string, EagerDataFlowExecutable<unknown>> = {};
    for (const edge of unit.flow.subflowEdges) {
      const target = eagerByFqn.get(edge.targetFlowId);
      if (!target) throw new Error(`EagerDataFlow ${fqn} references unloaded subflow ${edge.targetFlowId}.`);
      subflows[edge.targetFlowId] = await materializeEager(target, nextStack);
    }
    const executable = await materializeEagerDataFlowPlan(unit.flow, {
      resolveCode: (request) => resolveFlowCode(options, unit, request),
      subflows,
    });
    eagerExecutables[fqn] = executable;
    return executable;
  };

  for (const unit of eagerUnits) await materializeEager(unit, new Set());

  for (const unit of Object.values(bundle.units)) {
    if (!unit.flow) continue;
    const fqn = unit.fqn;
    switch (unit.kind) {
      case 'instant-flow': {
        const spec = requireControlSpec(unit, 'InstantFlow');
        const flow = materializeInstantFlowSpec(
          spec,
          (request) => resolveFlowCode(options, unit, request),
          resolveFlow,
        );
        factories[fqn] = cachedFactory('instant-flow', fqn, (runtime): InstantFlowHandle => ({
          kind: 'instant-flow',
          fqn,
          spec,
          invoke: <TOutput>(input?: unknown) => flow.run({ input, runtime: runtime as WorkFlowRuntime }) as Promise<TOutput>,
        }));
        break;
      }
      case 'eager-data-flow': {
        if (unit.flow.form !== 'EagerDataFlow') throw new Error(`Flow ${fqn} is not an EagerDataFlow plan.`);
        const executable = eagerExecutables[fqn];
        factories[fqn] = cachedFactory('eager-data-flow', fqn, (runtime): EagerDataFlowHandle => ({
          kind: 'eager-data-flow',
          fqn,
          plan: unit.flow as EagerDataFlowAuthoringPlan,
          invoke: (input, invocationOptions) => executable.invoke(runtime, input, invocationOptions),
        }));
        break;
      }
      case 'work-flow': {
        const spec = requireControlSpec(unit, 'WorkFlow');
        const dependencies = await options.resolveWorkFlowDependencies?.(unit);
        if (!dependencies) throw new Error(`WorkFlow ${fqn} requires injected snapshot store dependencies.`);
        factories[fqn] = cachedFactory('work-flow', fqn, (runtime): WorkFlowHandle => {
          const engine = new WorkFlowEngine({
            definition: {
              spec,
              resolveCode: (request) => resolveFlowCode(options, unit, request),
              resolveFlow,
            },
            store: dependencies.store,
            runtime: runtime as WorkFlowRuntime,
            clock: dependencies.clock,
            durableChildren: dependencies.durableChildren,
          });
          return {
            kind: 'work-flow', fqn, spec,
            start: (treeId, startOptions) => engine.start(treeId, startOptions),
            resume: (treeId, signal) => engine.resume(treeId, signal),
            refresh: (treeId) => engine.refresh(treeId),
            fireDueDeadlines: (treeId) => engine.fireDueDeadlines(treeId),
            getOutcome: (treeId) => engine.getOutcome(treeId),
          };
        });
        break;
      }
      case 'biz-process': {
        const spec = requireControlSpec(unit, 'BizProcess');
        const dependencies = await options.resolveBizProcessDependencies?.(unit);
        if (!dependencies) throw new Error(`BizProcess ${fqn} requires injected snapshot/task dependencies.`);
        factories[fqn] = cachedFactory('biz-process', fqn, (runtime): BizProcessHandle => {
          const engine = new BizProcessEngine({
            definition: {
              spec,
              resolveCode: (request) => resolveFlowCode(options, unit, request),
              resolveFlow,
            },
            store: dependencies.store,
            taskStore: dependencies.taskStore,
            tasks: dependencies.tasks,
            runtime: runtime as WorkFlowRuntime,
            clock: dependencies.clock,
            durableChildren: dependencies.durableChildren,
          });
          return {
            kind: 'biz-process', fqn, spec,
            start: (treeId, startOptions) => engine.start(treeId, startOptions),
            refresh: (treeId) => engine.refresh(treeId),
            getOutcome: (treeId) => engine.getOutcome(treeId),
            tasks: (treeId) => engine.tasks(treeId),
            operateTask: (treeId, request) => engine.operateTask(treeId, request),
          };
        });
        break;
      }
    }
  }
  return factories;
}

function createBundleLocalFlowResolver(
  bundle: LoadedHalfcodeUnitBundle,
  options: MaterializeHalfcodeFlowsOptions,
) {
  return async (reference: string, caller: FlowBundleSpec) => {
    const callerUnit = bundle.units[caller.fqn];
    if (!callerUnit || callerUnit.flow !== caller) {
      throw new Error(
        `CallFlow ${reference} caller ${caller.form} #${caller.fqn} is not loaded from this AppBundle.`,
      );
    }

    const parsed = /^(instant-flow|work-flow|biz-process):\/\/([\w.-]+)$/.exec(reference);
    if (!parsed) {
      throw new Error(
        `CallFlow ${reference} from ${caller.form} #${caller.fqn} is not a canonical CtrlFlow URI.`,
      );
    }
    const scheme = parsed[1] as keyof typeof CONTROL_FORM_BY_SCHEME;
    const targetFqn = parsed[2];
    const targetUnit = bundle.units[targetFqn];
    if (!targetUnit?.flow || targetUnit.flow.form === 'EagerDataFlow') {
      throw new Error(
        `CallFlow ${reference} from ${caller.form} #${caller.fqn} has no CtrlFlow target in the same AppBundle.`,
      );
    }

    const expectedForm = CONTROL_FORM_BY_SCHEME[scheme];
    if (targetUnit.flow.form !== expectedForm) {
      throw new Error(
        `CallFlow ${reference} expected ${expectedForm} #${targetFqn}, but the same AppBundle contains `
        + `${targetUnit.flow.form} #${targetUnit.flow.fqn}.`,
      );
    }

    return {
      spec: targetUnit.flow,
      resolveCode: (request: HalfcodeFlowCodeResolutionRequest) =>
        resolveFlowCode(options, targetUnit, request),
    };
  };
}

export function bindHalfcodeFlows(
  factories: HalfcodeFlowHandleFactoryRegistry,
  runtime: unknown,
): Readonly<Record<string, HalfcodeFlowHandle>> {
  return Object.fromEntries(Object.entries(factories).map(([fqn, factory]) => [fqn, factory.bind(runtime)]));
}

function requireControlSpec(
  unit: LoadedHalfcodeUnit,
  form: 'InstantFlow' | 'WorkFlow' | 'BizProcess',
): FlowBundleSpec {
  if (!unit.flow || unit.flow.form !== form) {
    throw new Error(`Flow ${unit.fqn} is not a ${form} spec.`);
  }
  return unit.flow;
}

async function resolveFlowCode(
  options: MaterializeHalfcodeFlowsOptions,
  unit: LoadedHalfcodeUnit,
  request: HalfcodeFlowCodeResolutionRequest,
) {
  const code = await options.resolveCode(request, { unit });
  if (typeof code !== 'function') throw new TypeError(`${request.reference} did not resolve to flow code.`);
  return code;
}

function cachedFactory<THandle extends HalfcodeFlowHandle>(
  kind: THandle['kind'],
  fqn: UnitFqn,
  create: (runtime: unknown) => THandle,
): HalfcodeFlowHandleFactory {
  const objects = new WeakMap<object, THandle>();
  const primitives = new Map<unknown, THandle>();
  return {
    kind,
    fqn,
    bind(runtime) {
      if ((typeof runtime === 'object' && runtime !== null) || typeof runtime === 'function') {
        const key = runtime as object;
        const known = objects.get(key);
        if (known) return known;
        const handle = create(runtime);
        objects.set(key, handle);
        return handle;
      }
      const known = primitives.get(runtime);
      if (known) return known;
      const handle = create(runtime);
      primitives.set(runtime, handle);
      return handle;
    },
  };
}
