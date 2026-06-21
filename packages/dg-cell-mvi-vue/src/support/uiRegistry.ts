/**
 * dg-cell-mvi-vue · support/uiRegistry — the UI registry CONTRACT (UI-library-neutral).
 *
 * THE single module that declares the view layer's swappable UI seam, WITHOUT binding any concrete UI
 * framework. It unifies the two seams the crud view goes through instead of touching a UI library
 * directly:
 *
 *   1. COMPONENT RESOLUTION — `resolveComponent(logicalName)` maps an authoring/logical input name
 *      ('text' | 'select' | 'input' | a raw concrete name | ...) to the concrete component to render.
 *      This is the contract DgComponentRender (in a UI package) consults.
 *   2. IMPERATIVE UI — `confirm` / `notify` / `message` (the prior `UiAdapter`, F10). Components and
 *      `useCrud` call these instead of a UI library's `ElMessageBox` / `ElNotification` / `ElMessage`.
 *
 * Folding both into ONE injectable object means a different UI layer can be supplied wholesale (its own
 * components + its own message/modal) by providing a different `UiRegistry`. Per this monorepo's
 * "UI split by PACKAGE" architecture, the CONCRETE implementation lives in a UI package — the Element
 * impl is `elementUiRegistry` in the Element UI package; a hypothetical `dg-cell-mvi-antd`
 * package would export its own `antdUiRegistry`. This `dg-cell-mvi-vue` package keeps ZERO UI-library
 * dependency: it owns only the interface + injection keys + the neutral types
 * (see `codument/tracks/add-crud-view-extensions/design/ui-registry-rfc.md`).
 *
 * BACK-COMPAT: the F10 type surface — `UiAdapter`, `UiKind`, `UiConfirmOptions`, `UiNotifyOptions`,
 * `UiMessageOptions` — is still exported unchanged. `UiRegistry` is a strict superset (it EXTENDS
 * `UiAdapter`), and `UI_ADAPTER_KEY` is re-used as the provide/inject key so existing
 * `inject(UI_ADAPTER_KEY, ...)` call sites resolve the registry transparently (a registry IS a valid
 * `UiAdapter`). `UI_REGISTRY_KEY` is an alias for new call sites. The concrete `elementUiRegistry` /
 * `elementUiAdapter` / `COMPONENT_ALIASES` / `resolveElementComponentSpec` now live in the Element UI
 * package (the package that depends on the UI library).
 */
import type { Component, InjectionKey } from 'vue';

/** The four kinds shared by notify/message — `info` is included (the prior notify fell back to it). */
export type UiKind = 'success' | 'warning' | 'info' | 'error';

export interface UiConfirmOptions {
  title?: string;
  message: string;
  /** message-box type passthrough (e.g. 'warning'); defaults to 'warning' in the Element adapter. */
  type?: string;
}

export interface UiNotifyOptions {
  kind?: UiKind;
  title?: string;
  message: string;
}

export interface UiMessageOptions {
  kind?: UiKind;
  message: string;
}

/**
 * The imperative-UI port for the Vue view layer (the F10 seam). Covers exactly the calls that were
 * scattered across `useCrud` / `DgRowHandle` / `DgFormWrapper`. `confirm` ALWAYS resolves (true on
 * accept / false on cancel) — it never rejects, so call sites stay a plain `if (await ui.confirm(...))`.
 *
 * Retained as a named interface (and exported) for back-compat: prior code + the previous track's
 * tests may import `UiAdapter`. `UiRegistry` extends it.
 */
export interface UiAdapter {
  confirm(opts: UiConfirmOptions): Promise<boolean>;
  notify(opts: UiNotifyOptions): void;
  message(opts: UiMessageOptions): void;
}

/**
 * The resolved component spec: the concrete component to render + any name-derived baked props
 * (e.g. 'textarea' bakes `{ type: 'textarea' }`). This is the shape DgComponentRender consumes — it
 * mirrors the entry shape the old inline NAME_MAP / COMPONENT_ALIASES produced, so resolution stays
 * byte-identical. `name` is the concrete component (a string the consumer hands to Vue's
 * `resolveComponent`, OR a passed-through Component).
 */
export interface ResolvedComponentSpec {
  name: Component | string;
  props?: Record<string, any>;
}

/**
 * The unified, injectable UI registry: component resolution + imperative UI. A single object so a
 * whole UI framework can be swapped by providing a different one. Extends `UiAdapter` (so a registry
 * is always a valid imperative-UI port — back-compat).
 */
export interface UiRegistry extends UiAdapter {
  /**
   * Resolve a logical/authoring component name to the concrete component to render. Returns a string
   * (a concrete name the caller resolves via Vue's `resolveComponent`), a Component, or `undefined`
   * when the name is unknown (the caller then falls back to the raw name).
   */
  resolveComponent(name: string): Component | string | undefined;
  /**
   * Resolve a logical name to the full spec (concrete component + baked props). The richer companion
   * to `resolveComponent` that DgComponentRender uses (it needs the baked props). Returns `undefined`
   * when the name has no mapping — the caller falls back to the raw name. Optional so a minimal
   * custom registry can implement just `resolveComponent`; the Element default implements both.
   */
  resolveComponentSpec?(name: string): ResolvedComponentSpec | undefined;
}

/**
 * Injection key so descendant components resolve the active registry. KEPT as `UI_ADAPTER_KEY` (typed
 * to `UiRegistry` now) for back-compat: existing `inject(UI_ADAPTER_KEY, elementUiRegistry)` call sites
 * keep working — a `UiRegistry` IS a `UiAdapter`. `UI_REGISTRY_KEY` is an alias for new call sites.
 */
export const UI_ADAPTER_KEY: InjectionKey<UiRegistry> = Symbol('dg-cell-mvi:uiRegistry');
/** Alias of `UI_ADAPTER_KEY` for new call sites that prefer the registry name. Same symbol. */
export const UI_REGISTRY_KEY: InjectionKey<UiRegistry> = UI_ADAPTER_KEY;
