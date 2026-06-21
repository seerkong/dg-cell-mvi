import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Flex-wrap form layout demo — crudOptions.form.layout = 'flex'.
 * Each column declares a form.col.width so the varying widths make flex-wrap visible.
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
      form: {
        layout: 'flex',
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70 },
        },
        name: {
          title: '姓名',
          form: {
            col: { width: '260px' },
            rules: [{ required: true, message: '请输入姓名' }],
          },
          search: { show: true },
        },
        age: {
          title: '年龄',
          type: 'number',
          form: {
            col: { width: '160px' },
          },
        },
        email: {
          title: '邮箱',
          form: {
            col: { width: '320px' },
          },
        },
        phone: {
          title: '电话',
          form: {
            col: { width: '220px' },
          },
        },
        city: {
          title: '城市',
          form: {
            col: { width: '200px' },
          },
        },
        remark: {
          title: '备注',
          type: 'textarea',
          column: { show: false },
          form: {
            col: { width: '100%' },
          },
        },
      },
    },
  };
}
