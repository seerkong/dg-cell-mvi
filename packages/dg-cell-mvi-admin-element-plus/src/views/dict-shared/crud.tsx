import { dict } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Dict-shared demo — ONE shared dict entry (statusDict) is referenced by two columns
 * (status and approvalStatus). getStatusDict is therefore called only once regardless
 * of how many columns consume it.
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
      dicts: {
        statusDict: dict({ getData: () => api.getStatusDict(), value: 'value', label: 'label' }),
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 80 },
        },
        name: {
          title: '名称',
          search: { show: true },
        },
        status: {
          title: '状态',
          type: 'select',
          dict: { id: 'statusDict' },
          column: { width: 140 },
        },
        approvalStatus: {
          title: '审批状态',
          type: 'select',
          dict: { id: 'statusDict' },
          column: { width: 160 },
        },
      },
    },
  };
}
