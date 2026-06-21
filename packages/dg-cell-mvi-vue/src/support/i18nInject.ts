/**
 * dg-cell-mvi-vue · support/i18nInject — the crud translator INJECTION seam.
 *
 * Most built-in chrome is localized in the PURE projector (which carries `config.t`) and reaches the
 * Vue components through the projected `CrudBinding` (the buttons / form / search / editable bindings).
 * A few "virtual model" form components (notably `DgSubTable`) are rendered by name deep in the form
 * tree via `DgComponentRender` and receive only plain config data — they never see the binding NOR
 * `config.t`. So `useCrud` ALSO `provide`s the resolved translator under this key (purely additive,
 * alongside `UI_ADAPTER_KEY`); such components `inject` it to localize their own built-in chrome
 * (操作/删除/添加一行 …) through the SAME translator the projector uses.
 *
 * Behavior-equivalence: the inject DEFAULT is the identity-fallback translator below — when nothing is
 * provided (standalone component use / no `useCrud` ancestor), every label resolves to its default
 * Chinese string, so existing usage is byte-identical. The provided translator is always defined
 * (useCrud builds an identity-fallback one even when no `i18n` is injected), so a missing key still
 * falls back to the default via `resolveT`.
 */
import type { InjectionKey } from 'vue';
import type { CrudTranslator } from 'dg-cell-mvi-crud';

/**
 * Injection key for the crud translator (the same `(key, fallback?) => string` the projector carries
 * as `config.t`). `provide`d by `useCrud`; injected by name-rendered form components (DgSubTable) that
 * are off the projected-binding path.
 */
export const CRUD_I18N_KEY: InjectionKey<CrudTranslator> = Symbol('dg-cell-mvi:crudTranslator');

/**
 * The inject DEFAULT: an identity-fallback translator (returns the provided fallback, else the key).
 * Used when no `useCrud` ancestor provided one — keeps a standalone component byte-equivalent (every
 * label resolves to its default Chinese fallback).
 */
export const fallbackTranslator: CrudTranslator = (key, fallback) => fallback ?? key;
