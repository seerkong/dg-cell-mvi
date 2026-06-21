import type {
  HalfcodeRuntimeObject,
  MaterializedCallableEffect,
  MaterializedCallableEffectRegistry,
  RuntimeScopeAssembly,
  RuntimeScopeBindings,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  MountedHalfcodeDataGraph,
  MountedHalfcodeDataGraphRegistry,
} from './dataGraphMaterializer';
import { bindHalfcodeFlows } from './flowMaterializer';
import type {
  HalfcodeFlowHandle,
  HalfcodeFlowHandleFactoryRegistry,
  HalfcodeFlowHandleRegistry,
} from './flowHandles';
import type { SchemaEditorScopeCapabilities } from './schema-editor/scopeRuntime';

export interface DefaultHalfcodeRuntimeObject extends HalfcodeRuntimeObject {
  readonly scopeId: string;
  readonly parent?: HalfcodeRuntimeObject;
  readonly localBindings: Readonly<RuntimeScopeBindings>;
  readonly fixtures?: unknown;
  readonly config?: unknown;
  readonly commands?: unknown;
  readonly events?: unknown;
  readonly messagePolicy?: unknown;
  readonly schemaEditor?: SchemaEditorScopeCapabilities;
  readonly localEffects: MaterializedCallableEffectRegistry;
  readonly localDataGraphs: MountedHalfcodeDataGraphRegistry;
  readonly localFlowFactories: HalfcodeFlowHandleFactoryRegistry;
  readonly effects: MaterializedCallableEffectRegistry;
  readonly dataGraphs: MountedHalfcodeDataGraphRegistry;
  readonly flowFactories: HalfcodeFlowHandleFactoryRegistry;
  readonly flows: HalfcodeFlowHandleRegistry;
  effect<TInput = unknown, TOutput = unknown>(
    name: string,
  ): ((input: TInput, config?: unknown) => Promise<TOutput> | TOutput) | undefined;
  callEffect<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    config?: unknown,
  ): Promise<TOutput> | TOutput;
  graph<TGraph = MountedHalfcodeDataGraph>(name: string): TGraph | undefined;
  flow(name: string): HalfcodeFlowHandle | undefined;
}

interface PlainDataEntry {
  readonly name: string;
  readonly value: unknown;
  readonly enumerable: boolean;
}

const ownedSchemaEditorCapabilities = new WeakSet<object>();
const ownedSchemaEditorRegistries = new WeakSet<object>();

export function createDefaultHalfcodeRuntime(
  scopeId = 'halfcode:host',
  parent?: HalfcodeRuntimeObject,
  localBindings: RuntimeScopeBindings = {},
): DefaultHalfcodeRuntimeObject {
  const parentBindings = parent as Partial<DefaultHalfcodeRuntimeObject> | undefined;
  const localEffects = (localBindings.effects ?? {}) as MaterializedCallableEffectRegistry;
  const localDataGraphs = (localBindings.dataGraphs ?? {}) as MountedHalfcodeDataGraphRegistry;
  const localFlowFactories = (localBindings.flows ?? {}) as HalfcodeFlowHandleFactoryRegistry;
  const effects = {
    ...(parentBindings?.effects ?? {}),
    ...localEffects,
  };
  const dataGraphs = {
    ...(parentBindings?.dataGraphs ?? {}),
    ...localDataGraphs,
  };
  const flowFactories = {
    ...(parentBindings?.flowFactories ?? {}),
    ...localFlowFactories,
  };
  const flows: Record<string, HalfcodeFlowHandle> = {};
  const bindScope = (input: RuntimeScopeAssembly<DefaultHalfcodeRuntimeObject>) => {
    const bindings = {
      ...(input.bindings ?? {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
    };
    return createDefaultHalfcodeRuntime(input.scopeId, input.runtime ?? runtime, bindings);
  };
  const runtime: DefaultHalfcodeRuntimeObject = {
    scopeId,
    parent,
    localBindings,
    fixtures: mergeVisibleBinding(parentBindings?.fixtures, localBindings.fixtures),
    config: mergeVisibleBinding(parentBindings?.config, localBindings.config),
    commands: mergeVisibleBinding(parentBindings?.commands, localBindings.commands),
    events: mergeVisibleBinding(parentBindings?.events, localBindings.events),
    messagePolicy: localBindings.messagePolicy ?? parentBindings?.messagePolicy,
    schemaEditor: mergeSchemaEditorCapabilities(
      parentBindings?.schemaEditor,
      localBindings.schemaEditor,
    ),
    localEffects,
    localDataGraphs,
    localFlowFactories,
    effects,
    dataGraphs,
    flowFactories,
    flows,

    bindScope,
    deriveScope: bindScope,

    effect<TInput = unknown, TOutput = unknown>(name: string) {
      const binding = runtime.effects[name];
      if (binding) return bindEffect<TInput, TOutput>(runtime, binding);
      return undefined;
    },

    callEffect<TInput = unknown, TOutput = unknown>(name: string, input: TInput, config?: unknown) {
      const effect = runtime.effect<TInput, TOutput>(name);
      if (!effect) throw new Error(`No callable effect is visible for "${name}" in Scope #${scopeId}.`);
      return effect(input, config);
    },

    call<TInput = unknown, TOutput = unknown>(name: string, input: TInput, config?: unknown) {
      return runtime.callEffect<TInput, TOutput>(name, input, config);
    },

    graph<TGraph = MountedHalfcodeDataGraph>(name: string) {
      return runtime.dataGraphs[name] as TGraph | undefined;
    },

    flow(name: string) {
      return runtime.flows[name];
    },

    dispose() {
      const graphs = new Set(Object.values(runtime.localDataGraphs).map((mounted) => mounted.graph));
      for (const graph of graphs) graph.dispose();
    },
  };
  Object.assign(flows, bindHalfcodeFlows(flowFactories, runtime));
  return runtime;
}

function mergeSchemaEditorCapabilities(
  parent: SchemaEditorScopeCapabilities | undefined,
  local: unknown,
): SchemaEditorScopeCapabilities | undefined {
  const inherited = snapshotSchemaEditorCapabilities(parent);
  if (local === undefined) return inherited;

  const overlay = snapshotSchemaEditorCapabilities(local);
  if (overlay === undefined) return undefined;

  return freezeSchemaEditorCapabilities(
    mergeCapabilityRegistry(inherited?.valueHosts, overlay.valueHosts),
    mergeCapabilityRegistry(inherited?.sessions, overlay.sessions),
  );
}

function mergeCapabilityRegistry<TCapability>(
  parent: Readonly<Record<string, TCapability>> | undefined,
  local: Readonly<Record<string, TCapability>> | undefined,
): Readonly<Record<string, TCapability>> | undefined {
  if (local === undefined) return parent;
  const entries = new Map<string, PlainDataEntry>();
  for (const entry of inspectPlainDataRecord(parent) ?? []) entries.set(entry.name, entry);
  for (const entry of inspectPlainDataRecord(local) ?? []) entries.set(entry.name, entry);
  return freezeCapabilityRegistry<TCapability>([...entries.values()]);
}

function snapshotSchemaEditorCapabilities(
  value: unknown,
): SchemaEditorScopeCapabilities | undefined {
  if (value === undefined) return undefined;
  if (isObject(value) && ownedSchemaEditorCapabilities.has(value)) {
    return value as SchemaEditorScopeCapabilities;
  }

  const entries = inspectPlainDataRecord(value);
  if (entries === undefined) return undefined;
  const fields = new Map(entries.map((entry) => [entry.name, entry.value]));
  const valueHosts = snapshotCapabilityRegistry(fields.get('valueHosts'));
  const sessions = snapshotCapabilityRegistry(fields.get('sessions'));
  if (!valueHosts.ok || !sessions.ok) return undefined;
  return freezeSchemaEditorCapabilities(
    valueHosts.value,
    sessions.value,
  ) as SchemaEditorScopeCapabilities;
}

function snapshotCapabilityRegistry<TCapability>(
  value: unknown,
): { readonly ok: true; readonly value: Readonly<Record<string, TCapability>> | undefined }
  | { readonly ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (isObject(value) && ownedSchemaEditorRegistries.has(value)) {
    return { ok: true, value: value as Readonly<Record<string, TCapability>> };
  }

  const entries = inspectPlainDataRecord(value);
  if (entries === undefined) return { ok: false };
  return { ok: true, value: freezeCapabilityRegistry<TCapability>(entries) };
}

function freezeSchemaEditorCapabilities<TValueHost, TSession>(
  valueHosts: Readonly<Record<string, TValueHost>> | undefined,
  sessions: Readonly<Record<string, TSession>> | undefined,
): SchemaEditorScopeCapabilities<TValueHost, TSession> {
  const capabilities = Object.freeze({ valueHosts, sessions });
  ownedSchemaEditorCapabilities.add(capabilities);
  return capabilities;
}

function freezeCapabilityRegistry<TCapability>(
  entries: readonly PlainDataEntry[],
): Readonly<Record<string, TCapability>> {
  const registry: Record<string, TCapability> = {};
  for (const entry of entries) {
    Object.defineProperty(registry, entry.name, {
      value: entry.value,
      enumerable: entry.enumerable,
      configurable: true,
      writable: true,
    });
  }
  Object.freeze(registry);
  ownedSchemaEditorRegistries.add(registry);
  return registry;
}

function inspectPlainDataRecord(value: unknown): readonly PlainDataEntry[] | undefined {
  if (!isObject(value)) return undefined;
  try {
    if (Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const names = Object.getOwnPropertyNames(value);
    const entries: PlainDataEntry[] = [];
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || !('value' in descriptor)) return undefined;
      entries.push({ name, value: descriptor.value, enumerable: descriptor.enumerable ?? false });
    }
    return entries;
  } catch {
    return undefined;
  }
}

function mergeVisibleBinding(parent: unknown, local: unknown): unknown {
  if (local === undefined) return parent;
  if (isPlainRecord(parent) && isPlainRecord(local)) return { ...parent, ...local };
  return local;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return inspectPlainDataRecord(value) !== undefined;
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function bindEffect<TInput, TOutput>(
  runtime: DefaultHalfcodeRuntimeObject,
  binding: MaterializedCallableEffect,
): (input: TInput, config?: unknown) => Promise<TOutput> | TOutput {
  return (input, config) => binding.impl(
    runtime,
    input,
    config === undefined ? binding.config ?? {} : config,
  ) as Promise<TOutput> | TOutput;
}
