/**
 * createStreamSignalStore — the single source-of-truth store.
 *
 * Public surface is `dispatch / state / viewModel / dispose`; the internals sit on
 * **depa-data-graph**:
 *
 *   - state      → a depa `DataGraph` signal node (its `set` already does Object.is change-detection)
 *   - viewModel  → a depa `addComputed([state], project)` node (lazy; pulled by the view's `watch`)
 *   - event bus  → a depa `AppendOnlyEventLog` (its `stream({replay:false})` is a live-only hot bus,
 *                  and `.entries()` doubles as the replay/diagnostics artifact)
 *
 * The core loop is unchanged: dispatch → reduce → state signal → project → viewModel signal, with
 * `reduce` also returning effects that run async and re-dispatch their results (closed loop). The
 * feedback-depth guard is preserved verbatim.
 */
import { AppendOnlyEventLog, DataGraph } from 'depa-data-graph-core';
import type { StopHandle, TimelineEntry } from 'depa-data-graph-core';

import { createLifecycle } from './lifecycle';
import type { AppEvent, EffectRequest, EffectRuntime, FeedbackMeta, Reduce, StoreTap } from './contract';

const DEFAULT_MAX_FEEDBACK_DEPTH = 25;
const STATE_ID = 'state';
const VIEW_MODEL_ID = 'viewModel';

function readGraphValue<T>(ctx: unknown, id: string): T {
  const runtime = ctx as {
    graph?: { get?: <TValue>(nodeId: string) => TValue };
    get?: <TValue>(nodeId: string) => TValue;
  };
  const get = runtime.graph?.get ?? runtime.get;
  if (!get) {
    throw new Error('depa-data-graph computed context does not expose a readable graph API');
  }
  return get<T>(id);
}

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
  /** Append-only event timeline — the replay/diagnostics artifact (spec: 事件序列即重放素材). */
  readonly eventLog: AppendOnlyEventLog<AppEvent>;
  /** Underlying depa DataGraph holding the `state` + `viewModel` nodes. Read-only escape hatch. */
  readonly graph: DataGraph<unknown>;
}

export function createStreamSignalStore<S, VM = S>(
  options: StreamSignalStoreOptions<S, VM>,
): StreamSignalStore<S, VM> {
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

  // --- signal layer: state + derived viewModel as depa DataGraph nodes ---
  const graph = new DataGraph<unknown>(() => ({}));
  graph.addSignal<S>(STATE_ID, initialState);
  graph.addComputed<VM>(VIEW_MODEL_ID, [STATE_ID], (ctx) => project(readGraphValue<S>(ctx, STATE_ID)));
  lifecycle.add(() => graph.dispose());

  // --- stream layer: event bus + replay artifact ---
  const log = new AppendOnlyEventLog<AppEvent>();
  const feedbackMeta = new WeakMap<AppEvent, FeedbackMeta>();

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

  function resolveEventMeta(event: AppEvent): FeedbackMeta {
    if (event && typeof event === 'object') {
      const meta = feedbackMeta.get(event);
      if (meta) return meta;
    }
    return { depth: 0, chain: [String(event?.type || '(unknown)')] };
  }

  function dispatchFeedback(event: AppEvent, parentMeta: FeedbackMeta): void {
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
    if (event && typeof event === 'object') {
      feedbackMeta.set(event, { depth, chain });
    }
    log.append(event);
  }

  const subscription = log.stream({ replay: false }).subscribe({
    next(entry: TimelineEntry<AppEvent>) {
      const event = entry.value;
      try {
        const meta = resolveEventMeta(event);
        const prevState = graph.peek<S>(STATE_ID);
        const result = reduce(prevState, event);
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
        const nextState = result.state;
        const requests: EffectRequest[] =
          result.effects === undefined || result.effects === null ? [] : result.effects;

        graph.set<S>(STATE_ID, nextState);

        if (tapOnState && !Object.is(nextState, prevState)) invokeTap(tapOnState, nextState, prevState);
        if (tapOnEvent) invokeTap(tapOnEvent, event, nextState, meta);
        if (tapOnEffect && Array.isArray(requests) && requests.length > 0) {
          invokeTap(tapOnEffect, requests, event);
        }

        Promise.resolve(
          runEffects(requests, {
            event,
            state: nextState,
            dispatch: (feedbackEvent: AppEvent) => dispatchFeedback(feedbackEvent, meta),
          }),
        ).catch(onError);
      } catch (error) {
        onError(error);
      }
    },
    error: onError,
    complete() {},
  });
  lifecycle.add(() => subscription?.unsubscribe?.());

  return {
    dispatch(event: AppEvent) {
      if (lifecycle.disposed) {
        dropHandler(event);
        return;
      }
      log.append(event);
    },
    state: () => graph.get<S>(STATE_ID),
    viewModel: () => graph.get<VM>(VIEW_MODEL_ID),
    dispose: lifecycle.dispose,
    eventLog: log,
    graph,
  };
}

export type { StopHandle };
