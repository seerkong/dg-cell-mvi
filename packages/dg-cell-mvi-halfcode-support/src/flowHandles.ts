import type { TaskOperationRequest, TaskOperationResult } from 'bp-ctrl-flow-contract';
import type {
  EagerDataFlowAuthoringPlan,
  EagerDataFlowInvocationOptions,
  EagerDataFlowRecord,
} from 'eager-data-flow-contract';
import type { FlowBundleSpec, UnitFqn } from 'dg-cell-mvi-halfcode-contract';
import type { TaskSpaceOwnerPort } from 'task-manager-contract';
import type { BPTaskDTO } from 'bp-ctrl-flow-contract';
import type {
  DurableChildFlowResolver,
  ResumeSignal,
  TickOutcome,
  WorkCtrlFlowClock,
  WorkCtrlFlowStartOptions,
  WorkCtrlFlowStore,
} from 'work-ctrl-flow-contract';
import type { BPCtrlFlowTaskDependencies } from 'bp-ctrl-flow-logic/browser';
import type { LoadedHalfcodeUnit } from './xnlUnitBundle';

export type HalfcodeFlowKind = 'instant-ctrl-flow' | 'work-ctrl-flow' | 'bp-ctrl-flow' | 'eager-data-flow';

export interface HalfcodeFlowCodeResolutionRequest {
  reference: string;
  flowId: string;
  nodeId: string;
  baseUri?: string;
}

export type HalfcodeFlowCode = (
  runtime: unknown,
  input: unknown,
  config: Readonly<Record<string, unknown>>,
) => unknown | Promise<unknown>;

export type HalfcodeFlowCodeResolver = (
  request: HalfcodeFlowCodeResolutionRequest,
  context: { unit: LoadedHalfcodeUnit },
) => HalfcodeFlowCode | Promise<HalfcodeFlowCode>;

interface HalfcodeFlowHandleBase<TKind extends HalfcodeFlowKind> {
  readonly kind: TKind;
  readonly fqn: UnitFqn;
}

export interface InstantCtrlFlowHandle extends HalfcodeFlowHandleBase<'instant-ctrl-flow'> {
  readonly spec: FlowBundleSpec;
  invoke<TOutput = unknown>(input?: unknown): Promise<TOutput>;
}

export interface EagerDataFlowHandle extends HalfcodeFlowHandleBase<'eager-data-flow'> {
  readonly plan: EagerDataFlowAuthoringPlan;
  invoke(
    input: Readonly<EagerDataFlowRecord>,
    options?: EagerDataFlowInvocationOptions<unknown>,
  ): Promise<EagerDataFlowRecord>;
}

export interface WorkCtrlFlowHandle extends HalfcodeFlowHandleBase<'work-ctrl-flow'> {
  readonly spec: FlowBundleSpec;
  start(treeId: string, options?: WorkCtrlFlowStartOptions): Promise<TickOutcome>;
  resume(treeId: string, signal: ResumeSignal): Promise<TickOutcome>;
  refresh(treeId: string): Promise<TickOutcome>;
  fireDueDeadlines(treeId: string): Promise<TickOutcome>;
  getOutcome(treeId: string): Promise<TickOutcome | undefined>;
}

export interface BPCtrlFlowHandle extends HalfcodeFlowHandleBase<'bp-ctrl-flow'> {
  readonly spec: FlowBundleSpec;
  start(treeId: string, options?: { input?: Record<string, unknown> }): Promise<TickOutcome>;
  refresh(treeId: string): Promise<TickOutcome>;
  getOutcome(treeId: string): Promise<TickOutcome | undefined>;
  tasks(treeId: string): Promise<BPTaskDTO[]>;
  operateTask(treeId: string, request: TaskOperationRequest): Promise<TaskOperationResult>;
}

export type HalfcodeFlowHandle =
  | InstantCtrlFlowHandle
  | EagerDataFlowHandle
  | WorkCtrlFlowHandle
  | BPCtrlFlowHandle;

export interface HalfcodeFlowHandleFactory {
  readonly kind: HalfcodeFlowKind;
  readonly fqn: UnitFqn;
  bind(runtime: unknown): HalfcodeFlowHandle;
}

export type HalfcodeFlowHandleFactoryRegistry = Readonly<Record<string, HalfcodeFlowHandleFactory>>;
export type HalfcodeFlowHandleRegistry = Readonly<Record<string, HalfcodeFlowHandle>>;

export interface WorkCtrlFlowLifecycleDependencies {
  store: WorkCtrlFlowStore;
  clock?: WorkCtrlFlowClock;
  durableChildren?: DurableChildFlowResolver;
}

export interface BPCtrlFlowLifecycleDependencies {
  store: WorkCtrlFlowStore;
  taskStore: TaskSpaceOwnerPort;
  tasks?: BPCtrlFlowTaskDependencies;
  clock?: WorkCtrlFlowClock;
  durableChildren?: DurableChildFlowResolver;
}

export interface MaterializeHalfcodeFlowsOptions {
  resolveCode: HalfcodeFlowCodeResolver;
  resolveWorkCtrlFlowDependencies?(
    unit: LoadedHalfcodeUnit,
  ): WorkCtrlFlowLifecycleDependencies | Promise<WorkCtrlFlowLifecycleDependencies>;
  resolveBPCtrlFlowDependencies?(
    unit: LoadedHalfcodeUnit,
  ): BPCtrlFlowLifecycleDependencies | Promise<BPCtrlFlowLifecycleDependencies>;
}

export interface ResolveHalfcodeFlowOptions {
  unitFqn: UnitFqn | string;
  scopeId: string;
}
