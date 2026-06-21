import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Fixed columns demo — id and name are pinned to the left; joinDate is pinned to the right.
 * All columns have explicit widths so the total exceeds the viewport and a horizontal
 * scrollbar appears. No special table config is needed; columns are fixed via column.fixed.
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
          column: { width: 80, fixed: 'left' },
        },
        name: {
          title: '姓名',
          column: { width: 120, fixed: 'left' },
          search: { show: true },
        },
        age: {
          title: '年龄',
          type: 'number',
          column: { width: 90 },
        },
        gender: {
          title: '性别',
          column: { width: 90 },
        },
        phone: {
          title: '电话',
          column: { width: 160 },
        },
        email: {
          title: '邮箱',
          column: { width: 220 },
        },
        dept: {
          title: '部门',
          column: { width: 140 },
        },
        title: {
          title: '职位',
          column: { width: 160 },
        },
        city: {
          title: '城市',
          column: { width: 120 },
        },
        address: {
          title: '地址',
          column: { width: 240 },
        },
        salary: {
          title: '薪资',
          type: 'number',
          column: { width: 140 },
        },
        joinDate: {
          title: '入职日期',
          column: { width: 160, fixed: 'right' },
        },
      },
    },
  };
}
