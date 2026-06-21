/**
 * Runtime object contracts for halfcode v3.
 *
 * This file intentionally models only the serializable assembly inputs and the
 * minimal code protocol that the runner can recognize. It does not describe a
 * runtime object's fields, inheritance, mixins, actor routing, visibility, or
 * data graph/effect lookup rules; those stay in project TypeScript.
 */

import type { SerializableRecord } from './common';
import type { HalfcodeRef } from './refs';
import type { MessagePolicySpec } from './messages';
import type { DataGraphBindingsSpec } from './dataGraph';
import {
  HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
  type HalfcodeUnitDiagnosticCode,
} from './diagnostics';
import type {
  HalfcodeUnitValidationIssue,
  HalfcodeUnitValidationResult,
} from './validation';

/** Mutually exclusive ways to obtain a RuntimeInstance. */
export const RUNTIME_INSTANCE_SOURCE_FIELDS = ['src', 'create', 'prototype'] as const;
export type RuntimeInstanceSourceField = (typeof RUNTIME_INSTANCE_SOURCE_FIELDS)[number];

/** RuntimeInstance declaration from the runtime domain. */
export interface RuntimeInstanceSpec {
  /** Node id from `<RuntimeInstance #id>`. */
  id: string;
  /** Existing runtime object exported from code. */
  src?: HalfcodeRef;
  /** Factory code entry. Its signature follows output = fn(runtime, input, config). */
  create?: HalfcodeRef;
  /** RuntimeInstance ref used as the prototype runtime object. */
  prototype?: HalfcodeRef;
  /** Optional derive entry. When absent, the runner may call runtime.deriveScope. */
  derive?: HalfcodeRef;
  /** Static config ref passed as the third function argument. */
  config?: HalfcodeRef;
  metadata?: SerializableRecord;
}

export interface RuntimeInstanceSource {
  field: RuntimeInstanceSourceField;
  ref: HalfcodeRef;
}

/** Named bundle of RuntimeInstance declarations. */
export interface RuntimeSpec {
  id: string;
  instances: RuntimeInstanceSpec[];
  metadata?: SerializableRecord;
}

/** Bindings collected from sibling Scope assembly nodes. */
export interface RuntimeScopeBindings {
  effects?: MaterializedCallableEffectRegistry;
  dataGraphs?: unknown;
  /** Runtime-owned Flow handle factories. Flows are domain objects, not effects. */
  flows?: unknown;
  commands?: unknown;
  events?: unknown;
  messagePolicy?: unknown;
  config?: unknown;
  [name: string]: unknown;
}

export type CallableEffectKind = 'function' | 'interface';

export interface CallableEffectBindingSpec {
  id: string;
  kind: CallableEffectKind;
  type?: HalfcodeRef;
  impl: HalfcodeRef;
  config?: HalfcodeRef;
}

export interface CallableEffectBindingsSpec {
  /** Compact tier: code-owned effect id to implementation map. */
  impls?: HalfcodeRef;
  /** Quick/Split tiers: explicit function or interface bindings. */
  bindings: CallableEffectBindingSpec[];
}

export interface MaterializedCallableEffect {
  id: string;
  kind: CallableEffectKind;
  impl: RuntimeProcessor;
  config?: unknown;
}

export type MaterializedCallableEffectRegistry = Readonly<Record<string, MaterializedCallableEffect>>;

/** Direct runtime-related refs declared on a `<Scope #id { ... }>` node. */
export interface RuntimeScopeBindingSpec {
  scopeId: string;
  runtime?: HalfcodeRef;
  config?: HalfcodeRef;
  commands?: HalfcodeRef;
  events?: HalfcodeRef;
  messagePolicy?: MessagePolicySpec;
  effects?: CallableEffectBindingsSpec;
  dataGraphs?: DataGraphBindingsSpec;
  metadata?: SerializableRecord;
}

/** Assembly input passed to runtime factories/protocol methods for a Scope. */
export interface RuntimeScopeAssembly<TRuntime = unknown> {
  scopeId: string;
  /** Parent/current visible runtime object, if there is one. */
  runtime?: TRuntime;
  /** Static config value resolved from the Scope or RuntimeInstance config ref. */
  config?: unknown;
  /** Raw binding payloads resolved from Scope siblings. */
  bindings?: RuntimeScopeBindings;
  metadata?: SerializableRecord;
}

/** Stable refs to selected UI instances, ECS entities, canvas nodes, etc. */
export interface RuntimeInstanceRef {
  ref: string;
  kind?: string;
  metadata?: SerializableRecord;
}

export interface RuntimeMessage<TPayload = unknown> {
  type: string;
  payload?: TPayload;
  instanceRefs?: RuntimeInstanceRef[];
  metadata?: SerializableRecord;
}

/**
 * Minimal runtime object protocol. Apps can and should define stronger typed
 * interfaces that extend this shape.
 */
export interface HalfcodeRuntimeObject {
  dispose?(): void;
  bindScope?(input: RuntimeScopeAssembly<this>): HalfcodeRuntimeObject;
  deriveScope?(input: RuntimeScopeAssembly<this>): HalfcodeRuntimeObject;
  call?<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    config?: unknown,
  ): Promise<TOutput> | TOutput;
  effect?<TInput = unknown, TOutput = unknown>(
    name: string,
  ): ((input: TInput, config?: unknown) => Promise<TOutput> | TOutput) | undefined;
  callEffect?<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    config?: unknown,
  ): Promise<TOutput> | TOutput;
  graph?<TGraph = unknown>(name: string): TGraph | undefined;
  flow?(name: string): unknown;
  send?<TPayload = unknown, TOutput = unknown>(
    message: RuntimeMessage<TPayload>,
  ): Promise<TOutput> | TOutput;
}

/** Factory shape: output = fn(runtime, input, config). */
export type RuntimeCreate<THostRuntime = unknown, TInput = RuntimeScopeAssembly<THostRuntime>, TConfig = unknown, TOutput = unknown> = (
  runtime: THostRuntime,
  input: TInput,
  config: TConfig,
) => TOutput;

/** Derive shape: output = fn(runtime, input, config), where runtime is the prototype object. */
export type RuntimeDerive<TPrototypeRuntime = unknown, TInput = RuntimeScopeAssembly<TPrototypeRuntime>, TConfig = unknown, TOutput = unknown> = (
  runtime: TPrototypeRuntime,
  input: TInput,
  config: TConfig,
) => TOutput;

/** Dynamic code entry without instance selection: output = fn(runtime, input, config). */
export type RuntimeProcessor<TRuntime = unknown, TInput = unknown, TConfig = unknown, TOutput = unknown> = (
  runtime: TRuntime,
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

/** Dynamic code entry with selected instances: output = fn(runtime, instanceRefs, input, config). */
export type RuntimeInstanceProcessor<TRuntime = unknown, TInput = unknown, TConfig = unknown, TOutput = unknown> = (
  runtime: TRuntime,
  instanceRefs: RuntimeInstanceRef[],
  input: TInput,
  config: TConfig,
) => TOutput | Promise<TOutput>;

export function runtimeInstanceSourceFields(spec: Pick<RuntimeInstanceSpec, RuntimeInstanceSourceField>): RuntimeInstanceSourceField[] {
  return RUNTIME_INSTANCE_SOURCE_FIELDS.filter((field) => spec[field] !== undefined);
}

export function runtimeInstanceSource(spec: Pick<RuntimeInstanceSpec, RuntimeInstanceSourceField>): RuntimeInstanceSource | null {
  const fields = runtimeInstanceSourceFields(spec);
  if (fields.length !== 1) return null;
  const field = fields[0];
  return { field, ref: spec[field] as HalfcodeRef };
}

/** Local shape validation only; ref resolution and protocol checks belong to loader/runner tracks. */
export function validateRuntimeInstanceSpec(spec: RuntimeInstanceSpec): HalfcodeUnitValidationResult {
  const issues: HalfcodeUnitValidationIssue[] = [];
  const sources = runtimeInstanceSourceFields(spec);
  if (sources.length === 0) {
    issues.push(runtimeSourceIssue('RuntimeInstance must declare one of src/create/prototype.'));
  } else if (sources.length > 1) {
    issues.push(runtimeSourceIssue(`RuntimeInstance source is ambiguous: ${sources.join(', ')} are mutually exclusive.`));
  }
  if (spec.derive !== undefined && spec.prototype === undefined) {
    issues.push({
      path: '$.derive',
      message: 'RuntimeInstance.derive requires prototype; create/src instances do not use derive.',
      code: HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
    });
  }
  return { ok: issues.length === 0, issues };
}

function runtimeSourceIssue(message: string): HalfcodeUnitValidationIssue {
  return {
    path: '$',
    message,
    code: HALFCODE_RUNTIME_SOURCE_AMBIGUOUS as HalfcodeUnitDiagnosticCode,
  };
}
