import { describe, expect, it } from 'vitest';

import * as core from 'dg-cell-mvi-core';
import {
  createSSEStream,
  untracked as upstreamUntracked,
  watch as upstreamWatch,
} from 'depa-data-graph-core';
import type { DataGraph } from 'depa-data-graph-core';
import type {
  AppEvent,
  AppMessage,
  AppMessageDescriptor,
  AppMessageKind,
  AppMessageOptions,
  CommandMessage,
  Disposer,
  EffectHandler,
  EffectRequest,
  EffectRunner,
  EffectRuntime,
  EventHistory,
  EventMessage,
  FeedbackMeta,
  FrameBufferResult,
  FrameScheduler,
  GraphObservation,
  GraphOwner,
  Lifecycle,
  Reduce,
  ReduceResult,
  RunEffectsContext,
  ServerEnvelope,
  ServerEventSource,
  ServerEventSourceOptions,
  StopHandle,
  StoreTap,
  StreamSignalStore,
  StreamSignalStoreOptions,
  StreamSignalStoreRuntime,
} from 'dg-cell-mvi-core';

type Assert<T extends true> = T;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;

type TargetSseStream = ReturnType<typeof createSSEStream<{ kind: string }>>;
type _TargetStreamIsConnectable = Assert<
  TargetSseStream extends Parameters<ServerEventSource['connect']>[0] ? true : false
>;
type _StopHandleMatchesTarget = Assert<Equal<StopHandle, () => void>>;
type _StateRemainsAValueGetter = Assert<
  Equal<ReturnType<StreamSignalStore<{ count: number }>['state']>, { count: number }>
>;
type _NoStateHandleInPublicStore = Assert<
  Equal<Extract<keyof StreamSignalStore<unknown>, 'stateNode' | 'stateHandle'>, never>
>;
type _EventHistoryHasNoWriter = Assert<
  Equal<Extract<keyof EventHistory<AppEvent>, 'append' | 'stream' | 'dispose'>, never>
>;
type _GraphObservationHasNoOwnerCapability = Assert<
  Equal<
    Extract<keyof GraphObservation, 'set' | 'addSignal' | 'addComputed' | 'addSource' | 'dispose'>,
    never
  >
>;
type _OrdinaryStoreHasNoGraphOwner = Assert<
  Equal<Extract<keyof StreamSignalStore<unknown>, 'graphOwner'>, never>
>;
type _RuntimeOwnerHasActualDataGraph = Assert<
  Equal<StreamSignalStoreRuntime<unknown>['graphOwner']['graph'], DataGraph<unknown>>
>;

// Resolving this tuple through the package self-reference freezes every public type re-export.
type _PublicTypeSurfaceResolves = [
  AppEvent,
  AppMessage,
  AppMessageDescriptor,
  AppMessageKind,
  AppMessageOptions,
  CommandMessage,
  Disposer,
  EffectHandler,
  EffectRequest,
  EffectRunner,
  EffectRuntime<unknown>,
  EventMessage,
  FeedbackMeta,
  FrameBufferResult,
  FrameScheduler,
  GraphObservation,
  GraphOwner,
  Lifecycle,
  Reduce<unknown>,
  ReduceResult<unknown>,
  RunEffectsContext<unknown>,
  ServerEnvelope,
  ServerEventSource,
  ServerEventSourceOptions,
  StopHandle,
  StoreTap<unknown>,
  EventHistory<AppEvent>,
  StreamSignalStore<unknown>,
  StreamSignalStoreOptions<unknown>,
  StreamSignalStoreRuntime<unknown>,
];

describe('dg-cell-mvi-core public exports', () => {
  it('keeps the documented runtime surface available from the package root', () => {
    expect(Object.keys(core).sort()).toEqual([
      'appEventMessageKind',
      'appEventToMessage',
      'appMessageToEvent',
      'commandMessage',
      'createAnimationFrameScheduler',
      'createEffectRunner',
      'createLifecycle',
      'createServerEventSource',
      'createStreamSignalStore',
      'createStreamSignalStoreRuntime',
      'eventMessage',
      'normalizeServerEventPayload',
      'untracked',
      'watch',
    ]);
  });

  it('re-exports the target reactive primitives without wrapping them', () => {
    expect(core.watch).toBe(upstreamWatch);
    expect(core.untracked).toBe(upstreamUntracked);
  });
});
