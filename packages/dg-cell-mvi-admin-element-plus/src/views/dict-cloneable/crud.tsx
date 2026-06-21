import { dict } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Dict cloneable demo — role and backupRole each carry their own inline dict (no shared id).
 * Because neither dict has an id, each column key gets its own isolated dict state and
 * getRoleDict() runs independently per column — demonstrating the default "cloneable" isolation.
 */
export default function () {
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
        },
        role: {
          title: '角色',
          type: 'select',
          dict: dict({ getData: () => api.getRoleDict(), value: 'value', label: 'label' }),
          column: { width: 140 },
        },
        backupRole: {
          title: '备用角色',
          type: 'select',
          dict: dict({ getData: () => api.getRoleDict(), value: 'value', label: 'label' }),
          column: { width: 140 },
        },
      },
    },
  };
}
