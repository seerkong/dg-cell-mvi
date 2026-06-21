/**
 * dg-cell-mvi-crud · support/validate — form validation (sync fold + async path).
 *
 * The common subset of the reference crud / async-validator rules the demo needs. `validateForm` is a PURE
 * synchronous fold (required / max / min (string length or number) / pattern + a sync custom
 * `validator()`) so it can live inside the `doSubmit` reducer (no IO, no view). The first failing
 * rule per field wins; its `message` (or a sensible default) becomes the field error.
 *
 * `validateFormAsync` adds the async path used at the submit effect boundary: a rule whose
 * `validator` returns a Promise is awaited (rejecting, or resolving to `false`/a string, fails the
 * field). Sync rules are re-checked first so a field never reaches an async validator while it has a
 * cheaper sync error. Promise-returning validators are intentionally a no-op in the sync `validator`
 * check (a Promise is neither `false` nor a string), so `validateForm` passes them through.
 */
import { get } from 'lodash-es';

import type { ValidationRule } from '../contract/crudOptions';

/** Minimal shape of a form column the validator reads (a ResolvedFormItem is assignable). */
export interface ValidatableColumn {
  key: string;
  title?: string;
  rules?: ValidationRule[];
  show?: boolean;
}

export interface ValidateResult {
  valid: boolean;
  errors: Record<string, string>;
}

function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Does this value look like a Promise? (a returned async-validator result.) */
function isThenable(value: any): value is Promise<any> {
  return value != null && typeof value.then === 'function';
}

/**
 * Built-in (non-validator) checks: required / max / min (string length or number) / pattern. Pure.
 * Returns an error message when a rule fails, else null. The custom `validator` is handled separately
 * so the sync and async passes can each invoke it the right way.
 */
function checkBuiltinRule(rule: ValidationRule, value: any, title: string): string | null {
  // required
  if (rule.required && isEmpty(value)) {
    return rule.message || `${title}不能为空`;
  }

  // for the remaining checks an empty value is considered valid (only `required` guards presence)
  if (isEmpty(value)) return null;

  // max / min — string length for strings/arrays, numeric compare otherwise
  if (rule.max != null) {
    const measure = typeof value === 'string' || Array.isArray(value) ? value.length : Number(value);
    if (measure > rule.max) {
      return rule.message || `${title}不能大于${rule.max}`;
    }
  }
  if (rule.min != null) {
    const measure = typeof value === 'string' || Array.isArray(value) ? value.length : Number(value);
    if (measure < rule.min) {
      return rule.message || `${title}不能小于${rule.min}`;
    }
  }

  // pattern
  if (rule.pattern != null) {
    const re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
    if (!re.test(String(value))) {
      return rule.message || `${title}格式不正确`;
    }
  }

  return null;
}

/** Evaluate one rule against a value; return an error message string when it fails, else null. */
function checkRule(rule: ValidationRule, value: any, title: string): string | null {
  const builtin = checkBuiltinRule(rule, value, title);
  if (builtin != null) return builtin;
  if (isEmpty(value)) return null;

  // sync custom validator: return false or a string message to fail; true/undefined passes. An
  // ASYNC validator (returns a Promise) is a no-op here — it's awaited by validateFormAsync at the
  // effect boundary; we swallow its eventual rejection so this pure pass never floats a rejection.
  if (typeof rule.validator === 'function') {
    const ret = rule.validator(rule, value);
    if (isThenable(ret)) {
      ret.catch(() => undefined);
      return null;
    }
    if (ret === false) {
      return rule.message || `${title}校验未通过`;
    }
    if (typeof ret === 'string' && ret.length > 0) {
      return ret;
    }
  }

  return null;
}

/**
 * Validate `form` against the `formColumns` rules. Pure. The first failing rule per column produces
 * that column's error message; `valid` is true only when every column passes.
 */
export function validateForm(
  form: Record<string, any>,
  formColumns: ValidatableColumn[],
): ValidateResult {
  const errors: Record<string, string> = {};
  for (const col of formColumns) {
    if (col.show === false) continue;
    const rules = col.rules;
    if (!rules || rules.length === 0) continue;
    const value = get(form, col.key);
    const title = col.title || col.key;
    for (const rule of rules) {
      const message = checkRule(rule, value, title);
      if (message != null) {
        errors[col.key] = message;
        break;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Evaluate one rule async-aware: built-ins first, then the custom `validator` invoked EXACTLY ONCE
 * (awaited when it returns a Promise; a rejection or a `false`/string result fails the field). Used by
 * validateFormAsync so a side-effecting validator runs once at the effect boundary.
 */
async function checkRuleAsync(rule: ValidationRule, value: any, title: string): Promise<string | null> {
  const builtin = checkBuiltinRule(rule, value, title);
  if (builtin != null) return builtin;
  if (isEmpty(value)) return null;
  if (typeof rule.validator !== 'function') return null;

  let ret: any;
  try {
    ret = rule.validator(rule, value);
  } catch (err) {
    // a validator that throws synchronously also fails the field.
    return rule.message || (err instanceof Error ? err.message : `${title}校验未通过`);
  }
  let resolved: any = ret;
  if (isThenable(ret)) {
    try {
      resolved = await ret;
    } catch (err) {
      return rule.message || (err instanceof Error ? err.message : `${title}校验未通过`);
    }
  }
  if (resolved === false) return rule.message || `${title}校验未通过`;
  if (typeof resolved === 'string' && resolved.length > 0) return resolved;
  return null;
}

/**
 * Validate `form` against `formColumns`, awaiting any async (`Promise`-returning) rule validators.
 * The async analog of `validateForm` — built-ins + sync validators + async validators, each rule's
 * validator invoked exactly once. Lives at the submit effect boundary (not the pure reducer). First
 * failing rule per field wins; `valid` is true only when every visible field passes.
 */
export async function validateFormAsync(
  form: Record<string, any>,
  formColumns: ValidatableColumn[],
): Promise<ValidateResult> {
  const errors: Record<string, string> = {};
  for (const col of formColumns) {
    if (col.show === false) continue;
    const rules = col.rules;
    if (!rules || rules.length === 0) continue;
    const value = get(form, col.key);
    const title = col.title || col.key;
    for (const rule of rules) {
      const message = await checkRuleAsync(rule, value, title);
      if (message != null) {
        errors[col.key] = message;
        break;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
