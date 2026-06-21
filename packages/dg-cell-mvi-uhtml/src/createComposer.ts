/**
 * createComposer — the single assembly point for a slice (store + view + lifecycle), using the
 * project composer shape (`{ ...streams, emitCommand, render }`). This is the only place a
 * slice wires its store to a uhtml view; views only read the viewModel and emit commands.
 *
 * For simple uhtml pages this is all you need. Pages with imperative islands (e.g. Monaco editors)
 * can instead compose `createStreamSignalStore` + `mountView` directly and manage islands in their
 * own composer — see the pipeline-debug slice.
 */
import { createLifecycle, createStreamSignalStore } from 'dg-cell-mvi-core';
import type { AppEvent, StreamSignalStore, StreamSignalStoreOptions } from 'dg-cell-mvi-core';

import { mountView } from './mountView';

export interface ComposerOptions<S, VM = S> extends StreamSignalStoreOptions<S, VM> {
  /** Element to render into. If omitted, the composer has no view (headless). */
  target?: Element | null;
  /** Returns a uhtml template for the view model; `emitCommand` dispatches commands. */
  render?: ((vm: VM, emitCommand: (event: AppEvent) => void) => unknown) | null;
}

export interface Composer<S, VM = S> extends StreamSignalStore<S, VM> {
  /** Dispatch an command event (thin wrapper over `dispatch`). */
  emitCommand(event: AppEvent): void;
  /** Begin rendering the view (no-op if headless or already mounted). */
  mount(): void;
  /** Stop rendering the view (store stays alive until `dispose`). */
  unmount(): void;
}

export function createComposer<S, VM = S>(options: ComposerOptions<S, VM>): Composer<S, VM> {
  const { target = null, render = null, ...storeOptions } = options;

  const store = createStreamSignalStore<S, VM>(storeOptions);
  const lifecycle = createLifecycle();
  lifecycle.add(() => store.dispose());

  function emitCommand(event: AppEvent): void {
    store.dispatch(event);
  }

  let stopView: (() => void) | null = null;

  function mount(): void {
    if (!target || typeof render !== 'function' || stopView) return;
    stopView = mountView<VM>({
      target,
      viewModel: store.viewModel,
      render: (vm) => render(vm, emitCommand),
    });
    lifecycle.add(stopView);
  }

  function unmount(): void {
    stopView?.();
    stopView = null;
  }

  return {
    ...store,
    emitCommand,
    mount,
    unmount,
    dispose: lifecycle.dispose,
  };
}
