/**
 * dg-cell-mvi-admin-element-plus · views/role/rbacOptions — the DEMO's assignable RBAC option sets (T5.3).
 *
 * The two RBAC management pages (role 分配权限给角色 / user 分配角色给用户) need OPTION sets to assign FROM:
 *   - `ASSIGNABLE_PERMISSIONS` — the permission codes a role can be granted (the role page's permission
 *     picker options). A flat `{value,label}` dict so the crud `checkbox` field renders a code multiselect.
 *   - `ASSIGNABLE_ROLES` — the roles a user can be assigned (the user page's role select options). Matches
 *     the user seed's `role` string values so an edited user's role round-trips through the store.
 *
 * WHY local constants (not a remote dict): the demo's permission/role universe is small and FIXED, and the
 * point of T5.3 is to make assignment OBSERVABLE end-to-end without standing up extra mock endpoints. The
 * reference admin loads these from `/role/list` + a permission tree; here a static dict is the trimmed
 * equivalent (same crud field shape — `dict.data` populates the select/checkbox options, see
 * projectFormColumns). Keeping them in ONE module is the single source both pages agree on.
 *
 * These are DEMO data (app layer), not chassis contract — admin-logic/contract stay domain-neutral; the
 * codes here are just the strings the mock's permission endpoint can grant and the role page can assign.
 */

/** One selectable option (the `{value,label}` shape crud's dict normalizes to). */
export interface RbacOption {
  value: string;
  label: string;
}

/**
 * The permission codes a role can be granted (the role page's "权限" checkbox options). Mirrors the
 * fine-grained codes the rest of the demo gates on (menu/route/button), so assigning them to a role reads
 * as "this role may view/manage users & roles, and reach 系统设置". `system:admin` is included as an
 * assignable code so the role page can demonstrate granting the very code that gates the 系统设置 page.
 */
export const ASSIGNABLE_PERMISSIONS: RbacOption[] = [
  { value: 'user:view', label: '用户-查看 (user:view)' },
  { value: 'user:add', label: '用户-新增 (user:add)' },
  { value: 'user:edit', label: '用户-编辑 (user:edit)' },
  { value: 'user:remove', label: '用户-删除 (user:remove)' },
  { value: 'role:view', label: '角色-查看 (role:view)' },
  { value: 'role:add', label: '角色-新增 (role:add)' },
  { value: 'role:edit', label: '角色-编辑 (role:edit)' },
  { value: 'role:delete', label: '角色-删除 (role:delete)' },
  { value: 'system:admin', label: '系统设置-管理 (system:admin)' },
];

/**
 * The roles a user can be assigned (the user page's "角色" select options). The `value` strings match the
 * user seed's `role` field values (views/user/resource.ts USER_SEED), so picking one and saving persists a
 * value the table can render back. Single-select (one primary role per user) — the demo's user fact is one
 * `role` string, so a single select is the faithful shape (the reference's multi-role picker is the same
 * crud field with `component.multiple`).
 */
export const ASSIGNABLE_ROLES: RbacOption[] = [
  { value: '管理员', label: '管理员' },
  { value: '编辑', label: '编辑' },
  { value: '访客', label: '访客' },
];
