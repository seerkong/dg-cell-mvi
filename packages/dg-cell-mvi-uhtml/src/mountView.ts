/**
 * Bind a store's `viewModel` signal to a uhtml render. The view subscribes to the projected
 * view model via depa's `watch`; whenever it changes, the template is re-rendered into `target`.
 * This is the renderer-specific half of the framework's main line (`viewModel signal → view`).
 */
import { watch } from 'dg-cell-mvi-core';
import type { StopHandle } from 'dg-cell-mvi-core';

import { renderInto } from './html/renderInto';

export interface MountViewOptions<VM> {
  target: Element;
  /** The store's `viewModel` reactive getter. */
  viewModel: () => VM;
  /** Returns a uhtml template (Hole) for the given view model. */
  render: (vm: VM) => unknown;
  /** Render immediately on mount (default true). */
  immediate?: boolean;
}

export function mountView<VM>(options: MountViewOptions<VM>): StopHandle {
  const { target, viewModel, render, immediate = true } = options;
  return watch(
    () => viewModel(),
    (vm) => renderInto(target, render(vm)),
    { immediate },
  );
}
