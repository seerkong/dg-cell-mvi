import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-index demo — row-number (序号) column that stays offset-aware across pages.
 * table.index enables the built-in 序号 column; pagination at 10/page exercises page 1 and 2+.
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
        index: { show: true, label: '#', width: 60 },
      },
      columns: {
        id:   { title: 'ID',   form: { show: false }, column: { width: 80 } },
        name: { title: '姓名', search: { show: true } },
        dept: { title: '部门' },
        city: { title: '城市' },
      },
    },
  };
}
