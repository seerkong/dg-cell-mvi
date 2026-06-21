import * as api from './api';

/**
 * Parent (orders) CRUD — read-only list whose rows expand into an editable item sub-CRUD
 * (see index.vue's #expand slot + ItemsSubCrud.vue).
 */
export default function () {
  return {
    crudOptions: {
      request: {
        pageRequest: async (query: any) => api.GetOrders(query),
      },
      pagination: { pageSize: 10 },
      rowHandle: { show: false },
      columns: {
        id: { title: '订单ID', column: { width: 120 } },
        customer: { title: '客户' },
        total: { title: '金额', type: 'number', column: { width: 160 } },
      },
    },
  };
}
