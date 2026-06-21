import { ItemApi } from './api';

/**
 * Child (detail) CRUD factory — order items, scoped to the currently-selected order via `getOrderId`.
 * Each operation hits the items' OWN api (multi-api): list filtered by orderId, add stamps orderId.
 */
export default function createItemCrud(getOrderId: () => number | null) {
  return function () {
    return {
      crudOptions: {
        request: {
          pageRequest: async (q: any) => ItemApi.GetList(getOrderId(), q),
          addRequest: async ({ form }: { form: Record<string, any> }) =>
            ItemApi.AddObj({ ...form, orderId: getOrderId() }),
          editRequest: async ({ form, row }: { form: Record<string, any>; row: any }) => {
            form.id = row.id;
            return ItemApi.UpdateObj(form);
          },
          delRequest: async ({ row }: { row: any }) => ItemApi.DelObj(row.id),
        },
        pagination: { pageSize: 5 },
        columns: {
          id: { title: 'ID', form: { show: false }, column: { width: 60 } },
          product: {
            title: '商品',
            column: { width: 100 },
            form: { rules: [{ required: true, message: '请输入商品' }] },
          },
          qty: { title: '数量', type: 'number', column: { width: 80 }, form: { value: 1 } },
          price: { title: '单价', type: 'number', column: { width: 90 }, form: { value: 0 } },
        },
      },
    };
  };
}
