/**
 * dg-cell-mvi-element-plus · useCrud — the Element-defaulting wrapper around dg-cell-mvi-vue's useCrud.
 *
 * THE wiring that keeps `dg-cell-mvi-vue` UI-neutral while preserving behavior: vue's `useCrud` takes a
 * `uiRegistry` with NO element default (it must not import element-plus). This wrapper supplies
 * `elementUiRegistry` as the default when the caller doesn't pass one, so an Element-Plus app importing
 * `useCrud` from `dg-cell-mvi-element-plus` gets the Element registry provided to descendants (component
 * resolution + confirm/notify/message) automatically — byte-identical to the pre-split behavior where
 * vue's useCrud defaulted to `elementUiRegistry` itself.
 *
 * A caller-provided `uiRegistry` (or back-compat `uiAdapter`) still wins (passed straight through). All
 * other options + the return shape are unchanged — this is a pure default-injecting passthrough.
 */
import { useCrud as useVueCrud, type UseCrudOptions, type UseCrudRet } from 'dg-cell-mvi-vue';
import { elementUiRegistry } from './support/elementUiRegistry';

export function useCrud<R = any>(options: UseCrudOptions<R>): UseCrudRet<R> {
  // Default the swappable UI registry to the Element impl unless the caller injected one (uiRegistry) or
  // a back-compat imperative-only adapter (uiAdapter) — in either of those cases vue's useCrud resolves
  // the registry itself, so we must NOT clobber it.
  const uiRegistry =
    options.uiRegistry ?? (options.uiAdapter ? undefined : elementUiRegistry);
  return useVueCrud<R>({ ...options, uiRegistry });
}

// Re-export the useCrud-related types so they are importable from this package alongside the wrapper
// (the package index also star-re-exports them from dg-cell-mvi-vue; these explicit re-exports keep a
// direct `import { UseCrudOptions } from 'dg-cell-mvi-element-plus'` working without ambiguity).
export type { UseCrudOptions, UseCrudRet, CrudCommands, CreateCrudContext } from 'dg-cell-mvi-vue';
