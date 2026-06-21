import * as api from './api';

/**
 * Avatar uploader demo — the avatar column uses ImageUploader (a globally registered rich widget)
 * to mock-upload an image to a data URL. The column cell is rendered as a round thumbnail via a
 * #cell_avatar slot in index.vue.
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
        avatar: {
          title: '头像',
          column: { width: 100 },
          form: {
            component: { name: 'ImageUploader' },
          },
        },
      },
    },
  };
}
