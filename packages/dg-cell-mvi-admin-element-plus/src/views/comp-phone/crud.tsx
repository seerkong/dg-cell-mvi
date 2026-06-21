import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * PhoneInput component demo — phone column uses the PhoneInput rich widget
 * with country-code prefix. Includes id (no form), searchable name, and phone.
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
          title: '姓名',
          search: { show: true },
        },
        phone: {
          title: '手机号',
          column: { width: 200 },
          form: {
            component: { name: 'PhoneInput' },
            rules: [{ required: true, message: '请输入手机号' }],
          },
        },
      },
    },
  };
}
