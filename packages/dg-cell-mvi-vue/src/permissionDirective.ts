/**
 * dg-cell-mvi-vue · permissionDirective — the UI-library-NEUTRAL `v-permission` Vue directive.
 *
 * The element-level counterpart of the crud button-permission filter (useCrud `{ permission }`): a DOM
 * element annotated `v-permission="'role:add'"` is REMOVED when the user does not hold the required
 * code. Port of the reference admin's `v-permission` (the reference admin `plugin/permission/directive`), made
 * NEUTRAL: it does NOT know any admin schema and does NOT read any store — the holds-this-code decision
 * is the INJECTED `can(code)` predicate handed to the factory. The app装配 point builds that predicate
 * from the permission actor's codes; this package stays render-only + domain-free (decisions §8: the vue
 * extension carries the neutral v-permission件, gated by an injected predicate).
 *
 * WHY a FACTORY (not a plain directive object): a Vue directive is not a component — it cannot
 * `inject()` the chassis. So the predicate is closed over at install time: the app does
 * `app.directive('permission', createPermissionDirective((code) => hasPermission(codes(), code)))`.
 * The predicate is read LIVE on each mount/update, so it always sees the current codes.
 *
 * SEMANTICS (mirrors the reference's `hasPermissions`):
 *   - `v-permission="'role:add'"`      → string: must hold exactly that code.
 *   - `v-permission="['a','b']"`        → array, default mode "any": hold AT LEAST ONE (`.some`). This is
 *                                         the reference's behavior (a button shown if any of its codes is
 *                                         held). Pass `.every` via the `all` modifier for "must hold ALL".
 *   - `v-permission`                    → no value (empty/`undefined`/`[]`): no gate → always shown
 *                                         (consistent with `hasPermission(codes, undefined) === true` in
 *                                         admin-logic; lets a binding evaluate to "ungated" without error,
 *                                         unlike the reference which threw).
 *   - modifier `.all`  → require every code in the array (AND) instead of the default any (OR).
 *   - modifier `.hide` → instead of removing the element from the DOM, hide it (`display:none`) so it can
 *                        reappear on a later update without re-insertion. Default (no modifier) REMOVES
 *                        the element (delta admin.rbac: "无权则移除元素").
 *
 * The check runs on BOTH `mounted` and `updated`: a re-render with a new value (or a reactive re-eval)
 * re-applies the gate. Removal is terminal for that node instance (the reference removes too); for a
 * value/predicate that may flip at runtime prefer the `.hide` modifier (toggles visibility in place).
 */
import type { Directive, DirectiveBinding } from 'vue';

/** The injected holds-this-code predicate. Domain-free: the directive only calls it, never inspects it. */
export type PermissionPredicate = (code: string) => boolean;

/** The accepted directive value: a single code, a list of codes, or nothing (= ungated). */
export type PermissionValue = string | string[] | undefined | null;

/** Normalize the directive value to a list of required codes (drops empties). */
function toCodes(value: PermissionValue): string[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.filter((c): c is string => typeof c === 'string' && c.length > 0);
}

/**
 * Evaluate whether the element is permitted, given the injected predicate + the binding.
 *  - no required codes → permitted (ungated).
 *  - `.all` modifier   → every required code must pass the predicate (AND).
 *  - default           → at least one required code passes (OR / `.some`, the reference's semantics).
 */
function isPermitted(can: PermissionPredicate, binding: DirectiveBinding<PermissionValue>): boolean {
  const codes = toCodes(binding.value);
  if (codes.length === 0) return true; // ungated → always allowed
  return binding.modifiers.all ? codes.every((c) => can(c)) : codes.some((c) => can(c));
}

/**
 * Build the `v-permission` directive bound to an injected `can(code)` predicate.
 *
 * @param can holds-this-code predicate (e.g. `(code) => hasPermission(permissionStore.state().codes, code)`).
 *            Read LIVE on every mount/update so the gate reflects the current codes.
 * @returns a Vue {@link Directive} to register via `app.directive('permission', …)`.
 *
 * @example
 *   // app main.ts (装配点) — compose the predicate from the permission actor's live codes:
 *   app.directive(
 *     'permission',
 *     createPermissionDirective((code) => hasPermission(chassis.permission.state().codes, code)),
 *   );
 *   // template:
 *   //   <el-button v-permission="'role:add'">新增角色</el-button>      // removed when role:add absent
 *   //   <el-button v-permission.hide="['a','b']">…</el-button>        // hidden (any of a/b); reappears
 *   //   <el-button v-permission.all="['a','b']">…</el-button>         // shown only with BOTH a AND b
 */
export function createPermissionDirective(can: PermissionPredicate): Directive<HTMLElement, PermissionValue> {
  const apply = (el: HTMLElement, binding: DirectiveBinding<PermissionValue>): void => {
    const permitted = isPermitted(can, binding);
    if (binding.modifiers.hide) {
      // soft hide: toggle visibility in place so a later update can restore it (clear our inline flag).
      el.style.display = permitted ? '' : 'none';
      return;
    }
    // default: REMOVE the element when not permitted (delta admin.rbac "无权则移除元素"). Terminal —
    // matches the reference directive (`el.parentNode.removeChild(el)`). Guard the parent (an unmounted
    // or already-detached node has none).
    if (!permitted) el.parentNode?.removeChild(el);
  };
  return {
    mounted: apply,
    updated: apply,
  };
}
