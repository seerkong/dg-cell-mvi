import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Department tree demo — uses table.tree to render a nested children array
 * with expand triangles and nested rows.
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
      pagination: { show: false, pageSize: 100 },
      table: {
        tree: {
          children: 'children',
          defaultExpandAll: true,
        },
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 90 },
        },
        name: {
          title: '部门名称',
          column: { width: 240 },
        },
        manager: {
          title: '负责人',
          column: { width: 160 },
        },
        count: {
          title: '人数',
          type: 'number',
          column: { width: 120 },
        },
      },
    },
  };
}
