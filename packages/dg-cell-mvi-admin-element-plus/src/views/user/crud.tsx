import { createHttpCrudRequest } from '../../common/httpCrudRequest';
import { chassis } from '../../chassis/stores';
import { USER_RESOURCE } from './resource';
import { ASSIGNABLE_ROLES } from '../role/rbacOptions';

/**
 * User CRUD config — a FUNCTIONAL RBAC user page (T5.3): manage users AND assign a role to a user, with all
 * requests routed through the chassis HttpPort (T3.2).
 *
 * Unlike the other demo pages (which call their own in-memory mockService directly), this page sends every
 * request through the SHARED chassis transport (`chassis.http`) via `createHttpCrudRequest`, so it inherits
 * that one port's auth header / 401→logout / `{code,msg,data}` envelope unwrap. mock vs real is decided
 * only by which HttpPort the app injected (dev → mockHttpPort serving the in-memory user store; prod →
 * axios hitting the real `/user/*` endpoints) — this page is identical either way. transformQuery /
 * transformRes (the limit/offset contract) still come from commonCrudOptions via useCrud's deep merge.
 *
 * USER → ROLE ASSIGNMENT (T5.3 "给用户分配角色"): the `role` column is a `select` field whose options are the
 * assignable roles (ASSIGNABLE_ROLES, a static dict — the option `value`s match the user seed's `role`
 * strings so the choice round-trips). Editing a user opens the form with its current role selected; picking
 * a different role and saving POSTs the updated user through chassis.http to the mock `/user/update` store,
 * and the table cell re-renders the new role. This is the user half of the "role/user 可分配" acceptance.
 * (The reference admin loads the role options from a remote `/role/list` dict-select; a static dict is the
 * trimmed self-contained equivalent — same crud field, no extra mock endpoint.)
 *
 * `chassis.http` (not `useChassis().http`) is imported directly because crud.tsx is a plain module, not a
 * component setup — the module singleton IS the canonical injected instance (useChassis falls back to it).
 *
 * Button permissions (T5.2): the actionbar add / rowHandle edit / rowHandle delete buttons carry a
 * `permission` code; index.vue injects a `permission` predicate (useCrud `{ permission }`) backed by the
 * GLOBAL permission actor's live codes. The dev mock grants `user:add` + `user:edit` but WITHHOLDS
 * `user:remove` → after login the DELETE button on each user row is HIDDEN while add/edit remain — the
 * observable button hide/show driven by real, remote-loaded codes (delta admin.rbac case `crud-button`).
 * This is now the demo's sole withheld button (the role page grants all three), for a clean contrast.
 */
export default function () {
  return {
    crudOptions: {
      // the four crud request callbacks, all going through chassis.http (auth/401/envelope for free).
      request: createHttpCrudRequest(chassis.http, USER_RESOURCE),
      pagination: { pageSize: 10 },
      // button-permission codes (filtered by the injected global-store predicate — see index.vue).
      actionbar: { buttons: { add: { permission: 'user:add' } } },
      rowHandle: {
        buttons: {
          edit: { permission: 'user:edit' },
          // user:remove is WITHHELD by the dev mock → this delete button is hidden after login.
          remove: { permission: 'user:remove' },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        username: {
          title: '用户名',
          search: { show: true },
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入用户名' }] },
        },
        nickName: { title: '昵称', search: { show: true } },
        // THE ASSIGNMENT FIELD: a select of assignable roles. dict.data populates the options; saving the
        // chosen role persists it onto the user row via chassis.http (the mock /user/update store).
        role: {
          title: '角色',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: ASSIGNABLE_ROLES,
          },
          search: { show: true },
          column: { width: 120 },
          form: {
            helper: '选择该用户的角色（演示「给用户分配角色」，保存后经 HttpPort 写回该用户行）。',
          },
        },
        status: { title: '状态', column: { width: 100 } },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 200 } },
      },
    },
  };
}
