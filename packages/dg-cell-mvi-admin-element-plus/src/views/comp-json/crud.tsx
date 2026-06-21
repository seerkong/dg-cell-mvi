import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * JsonEditor component demo — the config column stores a JSON string and is edited
 * via the globally-registered JsonEditor widget (format + validation bar included).
 * The table cell displays the raw JSON string with the built-in overflow tooltip.
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
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入名称' }] },
        },
        config: {
          title: '配置(JSON)',
          column: { width: 280 },
          form: {
            component: {
              name: 'JsonEditor',
              rows: 6,
            },
            rules: [{ required: true, message: '请输入配置 JSON' }],
          },
        },
      },
    },
  };
}
