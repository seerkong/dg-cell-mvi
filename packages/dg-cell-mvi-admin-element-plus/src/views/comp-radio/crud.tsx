import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Radio component demo — key column uses type:"radio" backed by a static status dict
 * (启用 / 禁用 / 锁定). Includes id (no form), searchable name, radio status, and createTime.
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
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '功能名称',
          search: { show: true },
          column: { width: 180 },
          form: { rules: [{ required: true, message: '请输入功能名称' }] },
        },
        status: {
          title: '状态',
          type: 'radio',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'enabled',  label: '启用' },
              { value: 'disabled', label: '禁用' },
              { value: 'locked',   label: '锁定' },
            ],
          },
          column: { width: 120 },
          form: { rules: [{ required: true, message: '请选择状态' }] },
        },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 200 } },
      },
    },
  };
}
