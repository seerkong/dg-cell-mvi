import type { TaskOperationRequest, TaskOperationResult } from 'biz-process-contract';
import type {
  EagerDataFlowAuthoringPlan,
  EagerDataFlowInvocationOptions,
  EagerDataFlowRecord,
} from 'eager-data-flow-contract';
import type { FlowBundleSpec, UnitFqn } from 'dg-cell-mvi-halfcode-contract';
import type { TaskDTO, TaskSpaceStore } from 'task-manager-contract';
import type {
  DurableChildFlowResolver,
  ResumeSignal,
  TickOutcome,
  WorkFlowClock,
  WorkFlowStartOptions,
  WorkFlowStore,
} from 'work-flow-contract';
import type { BizProcessTaskDependencies } from 'biz-process-logic/browser';
import type { LoadedHalfcodeUnit } from './xnlUnitBundle';

export type HalfcodeFlowKind = 'instant-flow' | 'work-flow' | 'biz-process' | 'eager-data-flow';

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

export interface InstantFlowHandle extends HalfcodeFlowHandleBase<'instant-flow'> {
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

export interface WorkFlowHandle extends HalfcodeFlowHandleBase<'work-flow'> {
  readonly spec: FlowBundleSpec;
  start(treeId: string, options?: WorkFlowStartOptions): Promise<TickOutcome>;
  resume(treeId: string, signal: ResumeSignal): Promise<TickOutcome>;
  refresh(treeId: string): Promise<TickOutcome>;
  fireDueDeadlines(treeId: string): Promise<TickOutcome>;
  getOutcome(treeId: string): Promise<TickOutcome | undefined>;
}

export interface BizProcessHandle extends HalfcodeFlowHandleBase<'biz-process'> {
  readonly spec: FlowBundleSpec;
  start(treeId: string, options?: { input?: Record<string, unknown> }): Promise<TickOutcome>;
  refresh(treeId: string): Promise<TickOutcome>;
  getOutcome(treeId: string): Promise<TickOutcome | undefined>;
  tasks(treeId: string): Promise<TaskDTO[]>;
  operateTask(treeId: string, request: TaskOperationRequest): Promise<TaskOperationResult>;
}

export type HalfcodeFlowHandle =
  | InstantFlowHandle
  | EagerDataFlowHandle
  | WorkFlowHandle
  | BizProcessHandle;

export interface HalfcodeFlowHandleFactory {
  readonly kind: HalfcodeFlowKind;
  readonly fqn: UnitFqn;
  bind(runtime: unknown): HalfcodeFlowHandle;
}

export type HalfcodeFlowHandleFactoryRegistry = Readonly<Record<string, HalfcodeFlowHandleFactory>>;
export type HalfcodeFlowHandleRegistry = Readonly<Record<string, HalfcodeFlowHandle>>;

export interface WorkFlowLifecycleDependencies {
  store: WorkFlowStore;
  clock?: WorkFlowClock;
  durableChildren?: DurableChildFlowResolver;
}

export interface BizProcessLifecycleDependencies {
  store: WorkFlowStore;
  taskStore: TaskSpaceStore;
  tasks: BizProcessTaskDependencies;
  clock?: WorkFlowClock;
  durableChildren?: DurableChildFlowResolver;
}

export interface MaterializeHalfcodeFlowsOptions {
  resolveCode: HalfcodeFlowCodeResolver;
  resolveWorkFlowDependencies?(
    unit: LoadedHalfcodeUnit,
  ): WorkFlowLifecycleDependencies | Promise<WorkFlowLifecycleDependencies>;
  resolveBizProcessDependencies?(
    unit: LoadedHalfcodeUnit,
  ): BizProcessLifecycleDependencies | Promise<BizProcessLifecycleDependencies>;
}

export interface ResolveHalfcodeFlowOptions {
  unitFqn: UnitFqn | string;
  scopeId: string;
}
