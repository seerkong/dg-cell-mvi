/**
 * dg-cell-mvi-core — Stream+Signal MVI micro-framework runtime, ported onto depa-data-graph.
 *
 * Renderer-agnostic: a store exposes `state` / `viewModel` reactive getters; bind them with `watch`
 * (re-exported here) from any renderer. See dg-cell-mvi-uhtml for the uhtml view layer.
 */
export type {
  AppEvent,
  AppMessageDescriptor,
  EffectRequest,
  ReduceResult,
  Reduce,
  EffectRuntime,
  EffectHandler,
  StoreTap,
  FeedbackMeta,
} from './contract';

export {
  appEventMessageKind,
  appEventToMessage,
  appMessageToEvent,
  commandMessage,
  eventMessage,
} from './message';
export type {
  AppMessage,
  AppMessageKind,
  AppMessageOptions,
  CommandMessage,
  EventMessage,
} from './message';

export { createLifecycle } from './lifecycle';
export type { Lifecycle, Disposer } from './lifecycle';

export { createEffectRunner } from './effectRunner';
export type { EffectRunner } from './effectRunner';

export {
  createStreamSignalStore,
  createStreamSignalStoreRuntime,
} from './streamSignalStore';
export type {
  EventHistory,
  GraphObservation,
  GraphOwner,
  StreamSignalStore,
  StreamSignalStoreOptions,
  StreamSignalStoreRuntime,
  RunEffectsContext,
} from './streamSignalStore';

export {
  createServerEventSource,
  createAnimationFrameScheduler,
  normalizeServerEventPayload,
} from './serverEventSource';
export type {
  ServerEventSource,
  ServerEventSourceOptions,
  ServerEnvelope,
  FrameScheduler,
  FrameBufferResult,
} from './serverEventSource';

// Re-export depa reactive primitives consumers commonly need (subscribe to store signals).
export { watch, untracked } from 'depa-data-graph-core';
export type { StopHandle } from 'depa-data-graph-core';
