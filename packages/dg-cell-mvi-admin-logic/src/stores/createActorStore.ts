/**
 * dg-cell-mvi-admin-logic · stores/createActorStore — the shared assembly helper for a data-ownership
 * actor (DEPA Actor 维 = `dg-cell-mvi-core` single-atom store: single-write + command entry + pure
 * reduce). Mirrors crud/contract/store.ts (`createCrudStore`) but parameterized over the actor's
 * (initialState, reduce, project) so each of the four actors is one thin call.
 *
 * **Injection seam (Effect 维, design §C):** `effects` is an OPTIONAL injected handler map. In T1.2 no
 * actor passes any (the actors are pure state machines — IO lands in P2/P3 via injected handlers).
 * When supplied, handlers run at the effect boundary and their returned events re-dispatch through the
 * closed loop. The logic layer NEVER imports a concrete IO/support module — handlers arrive as data.
 */
import { createEffectRunner, createStreamSignalStore } from 'dg-cell-mvi-core';
import type { AppEvent, EffectHandler, ReduceResult, StreamSignalStore } from 'dg-cell-mvi-core';

export interface CreateActorStoreOptions<S, VM> {
  initialState: S;
  /** PURE reducer — the actor's single writer. */
  reduce: (state: S, event: AppEvent) => ReduceResult<S>;
  /** PURE projection state → viewModel. */
  project: (state: S) => VM;
  /**
   * OPTIONAL injected effect handlers (the Effect-维 seam). Absent → a pure state machine (T1.2).
   * Keyed by effect-request `type`; each `fn(runtime, request)` runs IO and may return feedback events.
   */
  effects?: Record<string, EffectHandler<S>>;
  onError?: (error: unknown) => void;
}

/**
 * Build a data-ownership actor store. The returned store's `dispatch` is the ONLY write path; external
 * parties dispatch the actor's commands (they cannot mutate the fact directly).
 */
export function createActorStore<S, VM>(
  options: CreateActorStoreOptions<S, VM>,
): StreamSignalStore<S, VM> {
  const { initialState, reduce, project, effects, onError } = options;
  const runner = effects ? createEffectRunner<S>(effects) : null;
  return createStreamSignalStore<S, VM>({
    initialState,
    reduce,
    project,
    runEffects: runner ? (reqs, ctx) => runner.runAll(reqs, ctx) : undefined,
    onError,
  });
}
