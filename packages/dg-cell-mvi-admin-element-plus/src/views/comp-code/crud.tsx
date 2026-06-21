import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * CodeEditor component demo — the script column renders a monospace textarea (CodeEditor widget)
 * in the form, with id hidden from the form and name as a searchable field.
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
        script: {
          title: '脚本',
          column: { width: 300 },
          form: {
            component: {
              name: 'CodeEditor',
              rows: 8,
              placeholder: '// 输入代码',
            },
          },
        },
      },
    },
  };
}
