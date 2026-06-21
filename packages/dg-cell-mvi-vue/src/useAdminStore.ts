/**
 * dg-cell-mvi-vue · useAdminStore — the GENERIC admin data-ownership-actor binding composable.
 *
 * The admin counterpart of `useCrud`, but UI-library-neutral AND domain-neutral: it binds ANY
 * `dg-cell-mvi-core` single-atom store (each admin actor — session/tabs/permission/settings — is one)
 * to a Vue reactive view. It owns NOTHING of the actor's vocabulary; the caller composes commands from
 * the contract's event creators (see `bindCommands` for an optional sugar that maps an event-creator map
 * to bound dispatchers). The store is created/injected by the CONSUMER (the app装配 point), so the
 * Effect-维 port injection (StoragePort/HttpPort) stays at the consumer — this layer is pure binding.
 *
 * Mechanism mirrors `useCrud` exactly (the proven crud pattern):
 *   - THE bridge: `useGraphSignal(store.graph, 'viewModel')` lifts the depa `viewModel` graph signal
 *     into a Vue `Ref` (a depa `watch` under the hood) — same line as useCrud.ts ~L282.
 *   - lifecycle: disposes the store on unmount ONLY when `opts.dispose === true` (default false — the
 *     store is externally owned; a SHARED chassis actor must outlive any single view, unlike useCrud
 *     which creates+owns its store internally).
 *
 * Stays UI-neutral (vue + dg-cell-mvi-core types only — NO element-plus, NO admin-contract dep): the
 * signature is generic over the actor's `<S, VM>`, so it works for every admin actor without this
 * package learning any admin schema.
 */
import { onScopeDispose, type Ref } from 'vue';
import { useGraphSignal } from 'depa-data-graph-vue';

import type { AppEvent, StreamSignalStore } from 'dg-cell-mvi-core';

export interface UseAdminStoreRet<S, VM> {
  /** the actor's viewModel as a Vue Ref (depa `viewModel` graph signal bridged via useGraphSignal). */
  binding: Ref<VM>;
  /** the actor's single write path — dispatch a command built from the contract's event creators. */
  dispatch: (event: AppEvent<any>) => void;
  /** the underlying store (escape hatch: `state()` read, `eventLog`, etc.). */
  store: StreamSignalStore<S, VM>;
}

/**
 * Bind an admin data-ownership actor store to a Vue reactive view.
 *
 * @example
 *   const store = createSessionStore();            // logic layer (consumer-assembled)
 *   const { binding, dispatch } = useAdminStore(store);
 *   dispatch(setToken({ token }));                 // command from admin-contract event creators
 *   // template: binding.token / binding.authenticated …
 */
export interface UseAdminStoreOptions {
  /**
   * Dispose the store when the binding's scope (component) unmounts. DEFAULT false: useAdminStore
   * receives an EXTERNALLY-created store and does NOT own it — disposing a SHARED chassis actor
   * (session/tabs/…) when one view unmounts would tear down app-wide state and break the nav guard /
   * other views. Pass `true` ONLY when the caller created an ephemeral store just for this binding.
   */
  dispose?: boolean;
}

export function useAdminStore<S, VM>(
  store: StreamSignalStore<S, VM>,
  options: UseAdminStoreOptions = {},
): UseAdminStoreRet<S, VM> {
  // THE bridge: store.viewModel signal -> Vue Ref (depa watch under the hood). Identical mechanism to
  // useCrud's `crudBinding = useGraphSignal<CrudBinding<R>, unknown>(store.graph, 'viewModel')`.
  const binding = useGraphSignal<VM, unknown>(store.graph, 'viewModel');

  // Ownership: the store is created by the caller (chassis root / consumer), so by DEFAULT we do not
  // dispose it — a shared singleton actor outlives any single view (disposing it on unmount would kill
  // app-wide session/tabs state). Opt in only for ephemeral, binding-owned stores.
  if (options.dispose) {
    onScopeDispose(() => store.dispose());
  }

  return { binding, dispatch: store.dispatch, store };
}

/**
 * OPTIONAL sugar: turn a map of event-creator functions into a map of bound dispatchers (each call
 * dispatches the created event through the store). Mirrors useCrud's `Object.assign(commands, {...})`
 * (useCrud.ts ~L244) but derived generically from the creator map, so a caller can do:
 *
 *   const commands = bindCommands(store, { setToken, clearSession });
 *   commands.setToken({ token });   // === store.dispatch(setToken({ token }))
 *
 * Kept separate from `useAdminStore` (composition over a fat return) — callers that prefer raw
 * `dispatch(creator(...))` simply skip it.
 */
export type EventCreatorMap = Record<string, (...args: any[]) => AppEvent<any>>;

export type BoundCommands<M extends EventCreatorMap> = {
  [K in keyof M]: (...args: Parameters<M[K]>) => void;
};

export function bindCommands<S, VM, M extends EventCreatorMap>(
  store: StreamSignalStore<S, VM>,
  creators: M,
): BoundCommands<M> {
  const out = {} as BoundCommands<M>;
  for (const key of Object.keys(creators) as (keyof M)[]) {
    const creator = creators[key];
    out[key] = ((...args: Parameters<typeof creator>) =>
      store.dispatch(creator(...args))) as BoundCommands<M>[typeof key];
  }
  return out;
}
