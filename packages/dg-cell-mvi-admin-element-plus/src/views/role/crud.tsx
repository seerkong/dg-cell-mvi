import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';
import { ASSIGNABLE_PERMISSIONS } from './rbacOptions';

/**
 * Role CRUD config — a FUNCTIONAL RBAC role page (T5.3): manage roles AND assign permissions to a role.
 * Columns: id (no form) · name (search + required) · code · permissions (multiselect — the ASSIGNMENT
 * field) · remark · createTime (read-only). Full request set (page/add/edit/del); the limit/offset
 * transform comes from commonCrudOptions.
 *
 * ROLE → PERMISSIONS ASSIGNMENT (T5.3 "给角色分配权限"): the `permissions` column is a `checkbox` field
 * whose options are the demo's assignable permission codes (ASSIGNABLE_PERMISSIONS, a static dict). Editing
 * a role opens the form with its currently-granted codes checked; ticking/unticking and saving persists the
 * `permissions: string[]` array onto that role row via the mock store (UpdateObj/AddObj spread the form —
 * so the array round-trips and the table cell re-renders the granted codes). This is the role half of the
 * "role/user 可分配" acceptance. (The reference admin uses a remote permission TREE dialog; a static
 * checkbox is the trimmed, self-contained equivalent — same crud field shape, no extra mock endpoint.)
 *
 * Button permissions (T5.2): the actionbar add / rowHandle edit / rowHandle delete buttons carry a
 * `permission` code. index.vue injects a `permission` predicate (useCrud `{ permission }`) backed by the
 * GLOBAL permission actor's live codes, so a button whose code the user lacks is DROPPED from the binding.
 * As of T5.3 the dev mock GRANTS role:add/edit/delete, so all three role buttons SHOW — the deliberate
 * button-hide demo moved to the USER page (user:remove withheld), giving a clean show-vs-hide contrast.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ({ commands }: { commands: CrudCommands }) {
  return {
    crudOptions: {
      request: {
        pageRequest: async (query: any) => api.GetList(query),
        addRequest: async ({ form }: { form: Record<string, any> }) => api.AddObj(form),
        editRequest: async ({ form, row }: { form: Record<string, any>; row: any }) => {
          form.id = row.id;
          return api.UpdateObj(form);
        },
        delRequest: async ({ row }: { row: any }) => api.DelObj(row.id),
      },
      pagination: { pageSize: 10 },
      // a roomy right drawer so the permission checkbox grid has space.
      form: { wrapper: { is: 'drawer', size: '560px' } },
      // button-permission codes (filtered by the injected global-store predicate — see index.vue). All
      // granted by the dev mock now → all three buttons show on the role page.
      actionbar: { buttons: { add: { permission: 'role:add' } } },
      rowHandle: {
        buttons: {
          edit: { permission: 'role:edit' },
          remove: { permission: 'role:delete' },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '角色名称',
          search: { show: true },
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入角色名称' }], col: { span: 24 } },
        },
        code: { title: '角色编码', column: { width: 160 }, form: { col: { span: 24 } } },
        // THE ASSIGNMENT FIELD: a checkbox multiselect of permission codes. dict.data populates the
        // options (projectFormColumns); form.value [] makes el-checkbox-group render cleanly on add. The
        // saved value is a string[] of granted codes, persisted onto the role row by the mock store.
        permissions: {
          title: '权限',
          type: 'checkbox',
          dict: {
            value: 'value',
            label: 'label',
            data: ASSIGNABLE_PERMISSIONS,
          },
          column: { width: 260, showOverflowTooltip: true },
          form: {
            value: [],
            col: { span: 24 },
            helper: '勾选该角色可拥有的权限码（演示「给角色分配权限」，保存后写入该角色行）。',
          },
        },
        remark: { title: '备注', form: { col: { span: 24 } } },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 180 } },
      },
    },
  };
}
