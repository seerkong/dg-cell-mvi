import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-selection demo — multi-select checkbox column + id/name/role/email columns.
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
      table: {
        selection: { show: true },
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 80 },
        },
        name: {
          title: '姓名',
          search: { show: true },
        },
        role: {
          title: '角色',
        },
        email: {
          title: '邮箱',
        },
      },
    },
  };
}
