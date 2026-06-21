import * as api from './api';

/**
 * Slots layout demo — id (no form), searchable name with required rule, score (number, width 160).
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
          title: '姓名',
          search: { show: true },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        score: {
          title: '评分',
          type: 'number',
          column: { width: 160 },
        },
      },
    },
  };
}
