import {
  DataGraph,
  mountGraph,
  type GraphModule,
  type GraphNodeIdLike,
  type MountedGraphModule,
  type NodeFlags,
} from 'depa-data-graph-core';
import type {
  DataGraphMountPlan,
  DataGraphScopePlan,
  HalfcodeRef,
  RuntimeProcessor,
} from 'dg-cell-mvi-halfcode-contract';

export interface MountedHalfcodeDataGraph {
  readonly graph: DataGraph<unknown>;
  readonly module?: GraphModule;
  readonly refs?: MountedGraphModule;
}

export type MountedHalfcodeDataGraphRegistry = Readonly<Record<string, MountedHalfcodeDataGraph>>;

export type DataGraphSymbolRole =
  | 'data-graph-target'
  | 'data-graph-module'
  | 'data-graph-impls'
  | 'data-graph-impl'
  | 'data-graph-extension';

export interface MaterializeDataGraphScopeOptions {
  scopeId: string;
  runtime: unknown;
  getRuntime(): unknown;
  resolveSymbol(ref: HalfcodeRef, role: DataGraphSymbolRole): unknown | Promise<unknown>;
  resolveConfig(ref: HalfcodeRef): unknown | Promise<unknown>;
}

export async function materializeDataGraphScope(
  plan: DataGraphScopePlan | undefined,
  options: MaterializeDataGraphScopeOptions,
): Promise<MountedHalfcodeDataGraphRegistry | undefined> {
  if (!plan) return undefined;
  const targets: Record<string, DataGraph<unknown>> = {};
  const defaultGraph = new DataGraph<unknown>(options.getRuntime);

  for (const object of plan.objects) {
    const factory = await options.resolveSymbol(object.src, 'data-graph-target');
    if (typeof factory !== 'function') {
      throw new Error(`GraphObject #${object.id} src did not resolve to a function.`);
    }
    const config = object.config ? await options.resolveConfig(object.config) : undefined;
    const output = await factory(options.runtime, { id: object.id, scopeId: options.scopeId }, config);
    const graph = output instanceof DataGraph
      ? output
      : (output as { graph?: unknown } | undefined)?.graph;
    if (!(graph instanceof DataGraph)) {
      throw new Error(`GraphObject #${object.id} did not return a depa DataGraph or graph handle.`);
    }
    targets[object.id] = graph;
  }

  const mounts: Record<string, MountedHalfcodeDataGraph> = {};
  for (const mount of plan.mounts) {
    const graph = graphTarget(mount.graph, targets, defaultGraph);
    const moduleValue = mount.module.src
      ? await options.resolveSymbol(mount.module.src, 'data-graph-module')
      : undefined;
    if (!isGraphModule(moduleValue)) {
      throw new Error(`GraphModule #${mount.module.id} src did not resolve to a depa GraphModule value.`);
    }
    const refs = mountGraph(moduleValue, { scope: mount.scopeId });
    const logic = await resolveLogic(mount, options);
    installModule(graph, refs, mount, logic);
    mounts[mount.id] = { graph, module: moduleValue, refs };
  }

  for (const extension of plan.extensions) {
    const installer = await options.resolveSymbol(extension.src, 'data-graph-extension');
    if (typeof installer !== 'function') {
      throw new Error(`GraphExtension #${extension.id} src did not resolve to a function.`);
    }
    const config = extension.config ? await options.resolveConfig(extension.config) : undefined;
    const graph = graphTarget(extension.graph, targets, defaultGraph);
    await installer(
      options.runtime,
      { id: extension.id, scopeId: options.scopeId, graph },
      config,
    );
    mounts[extension.id] = { graph, refs: untypedGraphRefs(graph, options.scopeId, extension.id) };
  }

  return mounts;
}

function untypedGraphRefs(
  graph: DataGraph<unknown>,
  scopeId: string,
  moduleId: string,
): MountedGraphModule {
  const refs: Record<'inputs' | 'outputs' | 'state' | 'internals', Record<string, GraphNodeIdLike>> = {
    inputs: {},
    outputs: {},
    state: {},
    internals: {},
  };
  for (const node of graph.snapshot().nodes) {
    const parsed = /(?:^|\.)((?:inputs)|(?:outputs)|(?:state)|(?:internals))\.([^.]+)$/.exec(node.id);
    if (!parsed) continue;
    refs[parsed[1] as keyof typeof refs][parsed[2]] = node.id;
  }
  return {
    kind: 'mounted-graph-module',
    moduleId,
    scope: scopeId,
    inputs: refs.inputs,
    outputs: refs.outputs,
    state: refs.state,
    internals: refs.internals,
    public: {
      inputs: refs.inputs,
      outputs: refs.outputs,
    },
    definition: {},
  } as MountedGraphModule;
}

function graphTarget(
  ref: HalfcodeRef | undefined,
  targets: Record<string, DataGraph<unknown>>,
  fallback: DataGraph<unknown>,
): DataGraph<unknown> {
  if (!ref) return fallback;
  const id = String(ref).split('#')[1]?.split('/')[0];
  return (id && targets[id]) || fallback;
}

function isGraphModule(value: unknown): value is GraphModule {
  return !!value && typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'graph-module';
}

async function resolveLogic(
  mount: DataGraphMountPlan,
  options: MaterializeDataGraphScopeOptions,
): Promise<Record<string, { impl: RuntimeProcessor; config?: unknown }>> {
  const registry: Record<string, { impl: RuntimeProcessor; config?: unknown }> = {};
  if (mount.impls) {
    const bundle = await options.resolveSymbol(mount.impls, 'data-graph-impls');
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      throw new Error(`GraphMount #${mount.id} impls did not resolve to an object map.`);
    }
    for (const [id, impl] of Object.entries(bundle as Record<string, unknown>)) {
      if (typeof impl !== 'function') throw new Error(`Graph logic "${id}" is not callable.`);
      registry[id] = { impl: impl as RuntimeProcessor };
    }
  }
  for (const binding of mount.nodeBindings) {
    const impl = await options.resolveSymbol(binding.impl, 'data-graph-impl');
    if (typeof impl !== 'function') throw new Error(`Graph logic "${binding.id}" is not callable.`);
    registry[binding.id] = {
      impl: impl as RuntimeProcessor,
      ...(binding.config ? { config: await options.resolveConfig(binding.config) } : {}),
    };
  }
  return registry;
}

function installModule(
  graph: DataGraph<unknown>,
  refs: MountedGraphModule,
  mount: DataGraphMountPlan,
  logic: Record<string, { impl: RuntimeProcessor; config?: unknown }>,
): void {
  for (const node of mount.module.nodes) {
    const id = slotRef(refs, node.slot);
    if (node.kind === 'signal') {
      graph.addSignal(id, seedValue(mount, node.slot, node.initial), node.flags as NodeFlags | undefined);
      continue;
    }
    const deps = node.deps.map((dep) => slotRef(refs, dep));
    const binding = logic[node.logicId];
    if (!binding) throw new Error(`GraphMount #${mount.id} has no implementation for "${node.logicId}".`);
    if (node.kind === 'computed') {
      graph.addComputed(
        id,
        deps,
        (ctx) => binding.impl(ctx.bizRuntime, dependencyInput(ctx.graph, refs, node.deps), binding.config),
        node.flags as NodeFlags | undefined,
      );
      continue;
    }
    if (node.kind === 'consumer') {
      graph.addConsumer(
        id,
        deps,
        (ctx) => { binding.impl(ctx.bizRuntime, dependencyInput(ctx.graph, refs, node.deps), binding.config); },
        node.flags as NodeFlags | undefined,
      );
      continue;
    }
    if (node.kind === 'async') {
      const projections = node.projections
        ? Object.fromEntries(
            Object.entries(node.projections).map(([key, slot]) => [key, slotRef(refs, slot)]),
          )
        : undefined;
      graph.addAsync(
        id,
        deps,
        {
          params: (ctx) => [
            ctx.bizRuntime,
            dependencyInput(ctx.graph, refs, node.deps),
            binding.config,
          ] as const,
          task: async (runtime, input, config) => binding.impl(runtime, input, config),
          initial: seedValue(mount, node.projections?.result ?? node.slot, node.initial),
          ...(projections ? { projections } : {}),
        },
        node.flags as NodeFlags | undefined,
      );
      continue;
    }
    const outputs = node.outputs.map((output) => slotRef(refs, output));
    graph.addProcessor(
      id,
      deps,
      outputs,
      (ctx) => {
        const output = binding.impl(ctx.bizRuntime, dependencyInput(ctx.graph, refs, node.deps), binding.config);
        if (output instanceof Promise) throw new Error(`Processor "${node.logicId}" must be synchronous.`);
        if (outputs.length === 1) {
          ctx.graph.set(outputs[0], output);
          return;
        }
        for (let index = 0; index < outputs.length; index += 1) {
          const key = node.outputs[index].split('.').at(-1) ?? String(index);
          ctx.graph.set(outputs[index], (output as Record<string, unknown> | undefined)?.[key]);
        }
      },
      node.flags as NodeFlags | undefined,
    );
  }
}

function dependencyInput(
  graph: { get<T>(id: GraphNodeIdLike): T },
  refs: MountedGraphModule,
  deps: string[],
): Record<string, unknown> {
  return Object.fromEntries(deps.map((dep) => [dep.split('.').at(-1) ?? dep, graph.get(slotRef(refs, dep))]));
}

function slotRef(refs: MountedGraphModule, slot: string): GraphNodeIdLike {
  const [section, key] = slot.split('.');
  const map = section === 'inputs'
    ? refs.inputs
    : section === 'outputs'
      ? refs.outputs
      : section === 'state'
        ? refs.state
        : refs.internals;
  const ref = (map as Record<string, GraphNodeIdLike>)[key];
  if (!ref) throw new Error(`GraphModule #${refs.moduleId} has no slot "${slot}".`);
  return ref;
}

function seedValue(mount: DataGraphMountPlan, slot: string, fallback: unknown): unknown {
  const [section, key] = slot.split('.');
  const sectionValue = mount.seedValues?.[section];
  if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) return fallback;
  return key in sectionValue ? (sectionValue as Record<string, unknown>)[key] : fallback;
}
