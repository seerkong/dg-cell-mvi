import { OrderApi } from './api';

/** Parent (master) CRUD — orders, with its own api. */
export default function () {
  return {
    crudOptions: {
      request: {
        pageRequest: async (q: any) => OrderApi.GetList(q),
        addRequest: async ({ form }: { form: Record<string, any> }) => OrderApi.AddObj(form),
        editRequest: async ({ form, row }: { form: Record<string, any>; row: any }) => {
          form.id = row.id;
          return OrderApi.UpdateObj(form);
        },
        delRequest: async ({ row }: { row: any }) => OrderApi.DelObj(row.id),
      },
      pagination: { pageSize: 8 },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 60 } },
        orderNo: {
          title: '订单号',
          search: { show: true },
          column: { width: 110 },
          form: { rules: [{ required: true, message: '请输入订单号' }] },
        },
        customer: { title: '客户', column: { width: 100 } },
        status: { title: '状态', column: { width: 90 } },
      },
    },
  };
}
