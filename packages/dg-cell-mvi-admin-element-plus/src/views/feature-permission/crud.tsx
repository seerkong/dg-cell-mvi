import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-permission demo — INJECTED button-permission predicate (Feature C).
 *
 * Action buttons carry a `permission` code: the rowHandle delete button (`role:delete`), a toolbar
 * export button (`role:export`), and an actionbar add button (`role:add`). The view injects a
 * `permission` predicate via useCrud; a button whose code the predicate denies is dropped from the
 * projected binding (the projector filters it — see logic/projectors/buttons.ts). index.vue exposes a
 * toggle that flips the predicate to show buttons reappear.
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
      // export toolbar button gated by 'role:export'; add actionbar button gated by 'role:add'.
      toolbar: { buttons: { export: { show: true, permission: 'role:export' } } },
      actionbar: { buttons: { add: { permission: 'role:add' } } },
      rowHandle: {
        // delete button gated by 'role:delete'.
        buttons: { remove: { permission: 'role:delete' } },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: { title: '姓名', search: { show: true }, column: { width: 160 } },
        dept: { title: '部门' },
      },
    },
  };
}
