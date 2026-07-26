/**
 * createStreamSignalStore — the single source-of-truth store.
 *
 * Public surface is `dispatch / state / viewModel / dispose`; the internals sit on
 * **depa-data-graph**:
 *
 *   - event log  → the append-only history owner and replayable graph source
 *   - state      → a graph-owned `StreamDrivenStateSignalNode` current-state projection
 *   - viewModel  → a computed signal derived only from the state-node output
 *   - effects    → a graph sink on the same event source, after the state projection
 *
 * Each timeline entry is reduced once by the state node. Its validated result is handed to the
 * effect sink without re-running the reducer; effect feedback re-enters through the event log.
 */
import { AppendOnlyEventLog, DataGraph } from 'depa-data-graph-core';
import type {
  GraphSnapshot,
  SignalNodeIdLike,
  StopHandle,
  TimelineEntry,
} from 'depa-data-graph-core';

import { createLifecycle } from './lifecycle';
import type { AppEvent, EffectRequest, EffectRuntime, FeedbackMeta, Reduce, StoreTap } from './contract';

const DEFAULT_MAX_FEEDBACK_DEPTH = 25;
const EVENT_SOURCE_ID = 'events';
const STATE_ID = 'state';
const VIEW_MODEL_ID = 'viewModel';
const EFFECT_SINK_ID = 'effects';

function defaultOnDroppedEvent(event: AppEvent): void {
  console.warn('streamSignalStore dropped an event emitted after dispose:', event);
}

/**
 * The runtime passed to `runEffects`. Merged into the single `EffectRuntime<S>` (no twin) —
 * this alias is kept for the store-options field name `runEffects(requests, ctx)`.
 */
export type RunEffectsContext<S> = EffectRuntime<S>;

export interface StreamSignalStoreOptions<S, VM = S> {
  initialState: S;
  /** Pure: `(state, event) => { state, effects }`. Never mutate inputs, never do IO. */
  reduce: Reduce<S>;
  /** Pure projection state → viewModel. Defaults to identity. */
  project?: (state: S) => VM;
  /** Runs effect requests; returned events are re-dispatched via `ctx.dispatch`. */
  runEffects?: (requests: EffectRequest[], ctx: RunEffectsContext<S>) => unknown;
  onError?: (error: unknown) => void;
  onDroppedEvent?: (event: AppEvent) => void;
  maxFeedbackDepth?: number;
  tap?: StoreTap<S>;
}

/** Read-only replay/diagnostic history exposed to ordinary store consumers. */
export interface EventHistory<T> {
  entries(): readonly TimelineEntry<T>[];
}

/** Reactive and diagnostic observation of a store graph, without ownership capabilities. */
export interface GraphObservation {
  get<T>(id: SignalNodeIdLike): T;
  snapshot(): GraphSnapshot;
}

/** Privileged capability for a composition root that owns the actual graph lifecycle. */
export interface GraphOwner {
  readonly graph: DataGraph<unknown>;
}

export interface StreamSignalStore<S, VM = S> {
  /**
   * The single entry for state change. Reduces, updates the state signal, runs effects.
   * Accepts any AppEvent payload (incl. typed interface payloads like SortState) — dispatch is
   * payload-agnostic at runtime, so the type must not require a Record<string, unknown> index sig.
   */
  dispatch(event: AppEvent<any>): void;
  /** Reactive getter for current state (track it inside a depa `watch`/`effect`). */
  state(): S;
  /** Reactive getter for the projected view model. */
  viewModel(): VM;
  dispose(): void;
  /** Ordered event timeline — the read-only replay/diagnostics artifact. */
  readonly eventLog: EventHistory<AppEvent>;
  /** Read-only observation of the unified source/state/viewModel/sink graph. */
  readonly graph: GraphObservation;
}

export interface StreamSignalStoreRuntime<S, VM = S> {
  readonly store: StreamSignalStore<S, VM>;
  readonly graphOwner: GraphOwner;
}

interface ReducedTimelineEntry<S> {
  event: AppEvent;
  previousState: S;
  state: S;
  effects: EffectRequest[];
  feedbackMeta: FeedbackMeta;
}

export function createStreamSignalStore<S, VM = S>(
  options: StreamSignalStoreOptions<S, VM>,
): StreamSignalStore<S, VM> {
  return createStreamSignalStoreRuntime(options).store;
}

/**
 * Constructs a store together with the privileged owner of its actual DataGraph.
 *
 * This API is for composition roots. Ordinary consumers should use
 * `createStreamSignalStore`, whose facade exposes observation only.
 */
export function createStreamSignalStoreRuntime<S, VM = S>(
  options: StreamSignalStoreOptions<S, VM>,
): StreamSignalStoreRuntime<S, VM> {
  const {
    initialState,
    reduce,
    project = (state: S) => state as unknown as VM,
    runEffects = async () => null,
    onError = console.error,
    onDroppedEvent,
    maxFeedbackDepth = DEFAULT_MAX_FEEDBACK_DEPTH,
    tap,
  } = options;

  if (typeof reduce !== 'function') {
    throw new Error('createStreamSignalStore requires reduce');
  }

  const lifecycle = createLifecycle();
  const dropHandler = typeof onDroppedEvent === 'function' ? onDroppedEvent : defaultOnDroppedEvent;

  // The event log owns replayable history. The graph owns only the live source/state/sink topology.
  const log = new AppendOnlyEventLog<AppEvent>();
  const graph = new DataGraph<unknown>(() => ({}));
  lifecycle.add(() => graph.dispose());

  const dispatchMetaStack: FeedbackMeta[] = [];
  const reducedEntries = new WeakMap<TimelineEntry<AppEvent>, ReducedTimelineEntry<S>>();

  const tapOnEvent = typeof tap?.onEvent === 'function' ? tap.onEvent : null;
  const tapOnState = typeof tap?.onState === 'function' ? tap.onState : null;
  const tapOnEffect = typeof tap?.onEffect === 'function' ? tap.onEffect : null;

  function invokeTap(callback: (...args: any[]) => void, ...args: any[]): void {
    try {
      callback(...args);
    } catch (error) {
      onError(error);
    }
  }

  function currentDispatchMeta(event: AppEvent): FeedbackMeta {
    return (
      dispatchMetaStack.at(-1) ?? {
        depth: 0,
        chain: [String(event?.type || '(unknown)')],
      }
    );
  }

  function dispatchEvent(event: AppEvent<any>, parentMeta?: FeedbackMeta): void {
    if (lifecycle.disposed) {
      dropHandler(event);
      return;
    }
    let meta: FeedbackMeta;
    if (parentMeta) {
      const depth = parentMeta.depth + 1;
      const chain = [...parentMeta.chain, String(event?.type || '(unknown)')];
      if (depth > maxFeedbackDepth) {
        onError(
          new Error(
            `streamSignalStore exceeded max feedback depth ${maxFeedbackDepth}; event chain: ${chain.join(' -> ')}`,
          ),
        );
        return;
      }
      meta = { depth, chain };
    } else {
      meta = { depth: 0, chain: [String(event?.type || '(unknown)')] };
    }
    dispatchMetaStack.push(meta);
    try {
      log.append(event);
    } finally {
      dispatchMetaStack.pop();
    }
  }

  const eventSource = graph.addSource<TimelineEntry<AppEvent>>(EVENT_SOURCE_ID, log.stream());
  const stateNode = graph.addStreamDrivenStateSignalNode<TimelineEntry<AppEvent>, S>({
    id: STATE_ID,
    input: eventSource.ref,
    initial: initialState,
    reducer(previousState, entry) {
      const event = entry.value;
      try {
        const result = reduce(previousState, event);
        if (
          !result ||
          typeof result !== 'object' ||
          !Object.prototype.hasOwnProperty.call(result, 'state')
        ) {
          throw new Error(
            `streamSignalStore reduce must return { state, effects }; got a bare value for event type "${String(
              event?.type || '(unknown)',
            )}"`,
          );
        }
        const state = result.state;
        const requests: EffectRequest[] =
          result.effects === undefined || result.effects === null ? [] : result.effects;

        reducedEntries.set(entry, {
          event,
          previousState,
          state,
          effects: requests,
          feedbackMeta: currentDispatchMeta(event),
        });
        return state;
      } catch (error) {
        onError(error);
        return previousState;
      }
    },
  });
  graph.addComputed<VM>(VIEW_MODEL_ID, [stateNode.output], (ctx) =>
    project(ctx.graph.get(stateNode.output)),
  );
  graph.addSink<TimelineEntry<AppEvent>>(EFFECT_SINK_ID, [eventSource.ref], (entry) => {
    const reduced = reducedEntries.get(entry);
    reducedEntries.delete(entry);
    if (!reduced) {
      return;
    }

    const { event, previousState, state, effects, feedbackMeta: meta } = reduced;
    try {
      if (tapOnState && !Object.is(state, previousState)) {
        invokeTap(tapOnState, state, previousState);
      }
      if (tapOnEvent) invokeTap(tapOnEvent, event, state, meta);
      if (tapOnEffect && Array.isArray(effects) && effects.length > 0) {
        invokeTap(tapOnEffect, effects, event);
      }

      Promise.resolve(
        runEffects(effects, {
          event,
          state,
          dispatch: (feedbackEvent: AppEvent) => dispatchEvent(feedbackEvent, meta),
        }),
      ).catch(onError);
    } catch (error) {
      onError(error);
    }
  });

  const eventLog: EventHistory<AppEvent> = {
    entries() {
      return log.entries();
    },
  };
  const graphObservation: GraphObservation = {
    get<T>(id: SignalNodeIdLike) {
      return graph.get<T>(id);
    },
    snapshot() {
      return graph.snapshot();
    },
  };
  const store: StreamSignalStore<S, VM> = {
    dispatch: dispatchEvent,
    state: () => graph.get(stateNode.output),
    viewModel: () => graph.get<VM>(VIEW_MODEL_ID),
    dispose: lifecycle.dispose,
    eventLog,
    graph: graphObservation,
  };

  return {
    store,
    graphOwner: { graph },
  };
}

export type { StopHandle };
