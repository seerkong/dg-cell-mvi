import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * TableSelect component demo — the owner column uses the TableSelect widget to pick a person
 * from a dialog-table of users. The stored value is the person's name string.
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
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 80 },
        },
        title: {
          title: '任务',
          search: { show: true },
          form: { rules: [{ required: true, message: '请输入任务' }] },
        },
        owner: {
          title: '负责人',
          column: { width: 160 },
          form: {
            component: {
              name: 'TableSelect',
              data: api.USERS,
              columns: [
                { prop: 'id',   label: '工号', width: 90 },
                { prop: 'name', label: '姓名' },
                { prop: 'dept', label: '部门' },
              ],
              valueKey: 'name',
              labelKey: 'name',
              title: '选择负责人',
            },
          },
        },
      },
    },
  };
}
