import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * CSV export demo — toolbar export button enabled via toolbar.buttons.export.show=true.
 * Columns: id (no form), searchable name, age (number), email, city.
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
      toolbar: {
        buttons: {
          export: { show: true },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: {
          title: '姓名',
          search: { show: true },
        },
        age: {
          title: '年龄',
          type: 'number',
        },
        email: {
          title: '邮箱',
        },
        city: {
          title: '城市',
        },
      },
    },
  };
}
