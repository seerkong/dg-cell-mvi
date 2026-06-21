/**
 * Contract shapes for the Stream+Signal MVI micro-framework.
 *
 * These are the strong conventions from the attractor doc (frontend-stream-signal-framework.md):
 * a single AppEvent shape, a pure Reduce returning `{ state, effects }`, and EffectRequest/Handler
 * for the async side-effect loop. The runtime underneath is depa-data-graph.
 */

/** Canonical protocol identity carried by the Command/Event bridge. */
export interface AppMessageDescriptor {
  kind: 'command' | 'event';
  id: string;
  payloadDef?: string;
  policy?: string;
}

/** Transport shape. Domain protocol identity is preserved by the optional message descriptor. */
export interface AppEvent<TPayload = Record<string, unknown>> {
  type: string;
  payload: TPayload;
  message?: AppMessageDescriptor;
}

/** A described side-effect. `type` must be a contract-layer constant, never a bare string. */
export interface EffectRequest<TPayload = Record<string, unknown>> {
  type: string;
  payload: TPayload;
}

/** The only shape a reducer may return. Pure: never mutate inputs, never do IO. */
export interface ReduceResult<S> {
  state: S;
  effects?: EffectRequest[];
}

export type Reduce<S> = (state: S, event: AppEvent) => ReduceResult<S>;

/**
 * Runtime handed to an effect handler — the pure runtime capabilities `{ event, state, dispatch }`.
 * `dispatch` re-feeds results into the closed loop. This single type is the merged successor of the
 * old `EffectContext` + `RunEffectsContext` twins (runtime-first standard-component alignment).
 */
export interface EffectRuntime<S = unknown> {
  event: AppEvent;
  state: S;
  // dispatch is payload-agnostic at runtime: accept any AppEvent payload (incl. typed interface
  // payloads like SortState that lack a string index signature), not just Record<string, unknown>.
  dispatch: (event: AppEvent<any>) => void;
}

/**
 * Effect handler. Returned events are auto re-dispatched by the framework — the standard loop for
 * async results. Signature is always `(runtime, request)`; never `({...payload})` / `(param)`.
 */
export type EffectHandler<S = unknown> = (
  runtime: EffectRuntime<S>,
  request: EffectRequest,
) => Promise<AppEvent[] | AppEvent | void> | AppEvent[] | AppEvent | void;

/** Observation hooks. Business and observability streams stay separate; install one tap, not scattered records. */
export interface StoreTap<S> {
  onEvent?: (event: AppEvent, state: S, meta: FeedbackMeta) => void;
  onState?: (state: S, prev: S) => void;
  onEffect?: (requests: EffectRequest[], event: AppEvent) => void;
}

/** Feedback-loop bookkeeping carried per event for depth guarding + diagnostics. */
export interface FeedbackMeta {
  depth: number;
  chain: string[];
}
