/**
 * dg-cell-mvi-crud · support/compute — sync/async compute markers + the pure sync resolver.
 *
 * Port of the reference crud's use-compute.ts marker classes (`ComputeValue` / `AsyncComputeValue`) and the
 * `findComputeValues` deep-walk, minus Vue. On a single-atom store there is no reactive graph of
 * per-marker nodes: instead `resolveCompute(target, scope)` is a PURE deep clone-walk (lodash-es
 * `cloneDeepWith`) that, at every path holding a `ComputeValue`, substitutes `marker.computeFn(scope)`.
 * The projector calls it for each column / button / form-item slice with the live scope, so a
 * `compute(({form}) => …)` re-evaluates whenever the projector re-runs — same observable behavior as
 * Vue's `doComputed`, with no per-marker reactivity. Async compute (options fetched on a watched key)
 * is modeled as a derived dict elsewhere; the marker class is kept here for authoring fidelity.
 */
import { cloneDeepWith } from 'lodash-es';

import type { CrudScope } from '../contract/crudOptions';

/** The scope handed to a compute fn — the cell/form context the reference crud calls `ScopeContext`. */
export interface ComputeScope<R = any> extends CrudScope<R> {
  row?: R;
  form?: Record<string, any>;
  index?: number;
  key?: string;
  value?: any;
  mode?: string;
  /** the active dict's value->node map, when resolving against a dict column */
  dataMap?: Record<string, any>;
}

export type ComputeFn<R = any, V = any> = (scope: ComputeScope<R>) => V;

/** Marker for a synchronously-computed config value. Survives deep-merge/clone (resolved by path). */
export class ComputeValue<R = any, V = any> {
  computeFn: ComputeFn<R, V>;
  constructor(computeFn: ComputeFn<R, V>) {
    this.computeFn = computeFn;
  }
}

/** Author a sync compute: `compute(({ form }) => form.type === 'x')`. */
export function compute<R = any, V = any>(computeFn: ComputeFn<R, V>): ComputeValue<R, V> {
  return new ComputeValue<R, V>(computeFn);
}

export interface AsyncComputeOptions<RV = any, R = any, WV = any> {
  /** derive the value to watch from the scope; a change re-runs `asyncFn` */
  watch?: (scope: ComputeScope<R>) => WV;
  /** the async resolver, run when the watched value changes */
  asyncFn: (value: WV, scope: ComputeScope<R>) => Promise<RV>;
  /** value used until the first async result resolves */
  defaultValue?: RV;
}

/** Marker for an asynchronously-computed config value (resolved via the dict slice / effect side). */
export class AsyncComputeValue<RV = any, R = any, WV = any> {
  watch?: (scope: ComputeScope<R>) => WV;
  asyncFn: (value: WV, scope: ComputeScope<R>) => Promise<RV>;
  defaultValue?: RV;
  constructor(options: AsyncComputeOptions<RV, R, WV>) {
    this.watch = options.watch;
    this.asyncFn = options.asyncFn;
    this.defaultValue = options.defaultValue;
  }
}

/** Author an async compute (e.g. options fetched on a watched key). */
export function asyncCompute<RV = any, R = any, WV = any>(
  options: AsyncComputeOptions<RV, R, WV>,
): AsyncComputeValue<RV, R, WV> {
  return new AsyncComputeValue<RV, R, WV>(options);
}

export function isSyncCompute(value: any): value is ComputeValue {
  return value instanceof ComputeValue;
}

export function isAsyncCompute(value: any): value is AsyncComputeValue {
  return value instanceof AsyncComputeValue;
}

/**
 * PURE deep-walk: clone `target`, replacing every `ComputeValue` found anywhere inside with
 * `marker.computeFn(scope)`. Non-compute values are cloned normally; `AsyncComputeValue` markers are
 * left in place (resolved on the effect side). Returns a fresh object — never mutates `target`.
 *
 * Implemented with `cloneDeepWith`: the customizer short-circuits at each `ComputeValue` node and
 * returns the evaluated result, which lodash inserts at that path (the analog of the reference crud's
 * `findComputeValues` path collection + `set(clone, path, computeFn(ctx))`, but in a single pass).
 */
export function resolveCompute<T = any, R = any>(target: T, scope: ComputeScope<R> = {}): T {
  if (target == null) {
    return target;
  }
  // A bare marker passed directly (not nested) — evaluate it.
  if (isSyncCompute(target)) {
    return (target as unknown as ComputeValue).computeFn(scope);
  }
  if (typeof target !== 'object') {
    return target;
  }
  return cloneDeepWith(target, (value: any) => {
    if (isSyncCompute(value)) {
      return value.computeFn(scope);
    }
    // leave async markers untouched (cloneDeepWith deep-clones by default otherwise)
    if (isAsyncCompute(value)) {
      return value;
    }
    return undefined; // fall through to lodash default cloning
  }) as T;
}
