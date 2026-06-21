/**
 * dg-cell-mvi-crud · support/valueTransforms — pure sync value (de)serialization.
 *
 * Ports the reference crud's CrudExpose.doValueBuilder / doValueResolve (use-expose.ts). valueBuilder turns
 * backend values into component-friendly values when records/forms are loaded; valueResolve turns
 * component values back into backend values before submit. Both are sync-only here (Promise results
 * are ignored, matching the reference crud) and mutate the passed records/form in place via lodash set — the
 * caller is expected to hand in a clone (the reducer/effects clone before calling).
 */
import { cloneDeep, forEach, get, isArray, merge, set } from 'lodash-es';

import type { CrudScope } from '../contract/crudOptions';
import type { NormalizedColumn } from './optionsBuild';

/**
 * Run each column's `valueBuilder` over every record (and nested `children`), writing the result
 * back at `column.key`. Sync only — a Promise result is skipped. Mutates `records`.
 */
export function doValueBuilder<R = any>(
  records: R[] | undefined | null,
  columns: NormalizedColumn<R>[],
): void {
  if (records == null) return;
  const builderColumns = columns.filter((c) => c.valueBuilder != null);
  if (builderColumns.length === 0) return;

  forEach(records, (row: any, index: number) => {
    forEach(builderColumns, (col) => {
      const scope: CrudScope<R> = {
        value: get(row, col.key),
        row,
        form: row,
        index,
        key: col.key,
        column: col,
      };
      const res: any = col.valueBuilder!(scope);
      if (res != null && !(res instanceof Promise)) {
        set(row, col.key, res);
      }
    });

    // recurse into tree children, same columns
    if (row && row.children && isArray(row.children)) {
      doValueBuilder(row.children, columns);
    }
  });
}

/**
 * Run each column's `valueResolve` over the form, writing the result back at `column.key`. Sync
 * only — a Promise result is skipped. Mutates `form`.
 */
export function doValueResolve<R = any>(
  form: Record<string, any>,
  columns: NormalizedColumn<R>[],
): void {
  if (form == null) return;
  const resolveColumns = columns.filter((c) => c.valueResolve != null);
  if (resolveColumns.length === 0) return;

  forEach(resolveColumns, (col) => {
    const key = col.key;
    const scope: CrudScope<R> = {
      value: get(form, key),
      row: form as any,
      form,
      key,
      column: col,
    };
    const res: any = col.valueResolve!(scope);
    if (res != null && !(res instanceof Promise)) {
      set(form, key, res);
    }
  });
}

/** A form column's default-value descriptor (the subset buildInitialForm needs). */
export interface FormDefault {
  key: string;
  value?: any;
}

/**
 * Build a form's initial data, port of DgForm.createInitialForm + its doValueBuilder pass:
 *   1. seed each form column's `value` default
 *   2. merge cloneDeep(row) on top
 *   3. run column valueBuilder (backend -> component) over the result
 * Pure: returns a fresh object, never mutates `row`. Shared by the openForm reducer and the
 * infoRequest effect so both produce identical initial forms.
 */
export function buildInitialForm<R = any>(
  formDefaults: FormDefault[],
  columns: NormalizedColumn<R>[],
  row: any,
): Record<string, any> {
  const form: Record<string, any> = {};
  for (const fd of formDefaults) {
    if (fd.value !== undefined) set(form, fd.key, fd.value);
  }
  if (row != null) merge(form, cloneDeep(row));
  // the in-progress form is a plain record (not necessarily R); valueBuilder mutates it in place.
  doValueBuilder<Record<string, any>>([form], columns as NormalizedColumn[]);
  return form;
}
