import * as api from './api';

/**
 * Nested CRUD — VIRTUAL MODEL (one-shot submit). The `members` column is edited in the form by the
 * globally-registered `DgSubTable` (referenced by string name so the config stays plain data). The
 * members array is a normal form field, so add/edit submit the project + members in ONE request.
 */
const memberColumns = {
  name: { title: '姓名', component: { name: 'text' } },
  role: {
    title: '角色',
    component: {
      name: 'select',
      options: [
        { value: 'fe', label: '前端' },
        { value: 'be', label: '后端' },
        { value: 'design', label: '设计' },
        { value: 'pm', label: '产品' },
      ],
    },
  },
};

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
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: {
          title: '项目名',
          search: { show: true },
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入项目名' }] },
        },
        owner: { title: '负责人', column: { width: 110 } },
        members: {
          title: '成员',
          column: { width: 90, formatter: ({ row }: any) => (row.members?.length || 0) + ' 人' },
          form: {
            component: { name: 'DgSubTable', columns: memberColumns },
          },
        },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 180 } },
      },
    },
  };
}
