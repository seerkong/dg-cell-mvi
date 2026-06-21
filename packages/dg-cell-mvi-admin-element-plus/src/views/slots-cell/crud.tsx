import * as api from './api';

/**
 * Slots-cell demo — plain columns for id, name, status, score.
 * Cell rendering is handled by #cell_status and #cell_score slots in index.vue.
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
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 80 },
        },
        name: {
          title: '姓名',
          search: { show: true },
        },
        status: {
          title: '状态',
          column: { width: 140 },
        },
        score: {
          title: '评分',
          type: 'number',
          column: { width: 220 },
        },
      },
    },
  };
}
