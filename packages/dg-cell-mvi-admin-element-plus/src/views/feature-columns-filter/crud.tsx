import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Column settings (columnsFilter) + x-table passthrough demo.
 *
 * - `table.id` + `toolbar.columnsFilter.{show,storage}` turn on the toolbar 列设置 button; toggling a
 *   column's checkbox hides/shows it (projector filtering), and the choice persists to
 *   localStorage[`crud:columnsFilter:feat-cols`] (restored on reload).
 * - `table.stripe/border` are non-framework keys — they pass straight through to the underlying
 *   el-table (nativeProps), so the table renders striped + bordered with no extra wiring.
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
      // x-table passthrough: stripe + border reach el-table verbatim (id is framework-owned).
      table: { id: 'feat-cols', stripe: true, border: true },
      // column settings: toolbar button + localStorage persistence (keyed by table.id).
      toolbar: { columnsFilter: { show: true, storage: true } },
      pagination: { pageSize: 10 },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: { title: '姓名', column: { width: 120 }, search: { show: true } },
        age: { title: '年龄', type: 'number', column: { width: 90 } },
        gender: { title: '性别', column: { width: 90 } },
        phone: { title: '电话', column: { width: 150 } },
        dept: { title: '部门', column: { width: 120 } },
        title: { title: '职位', column: { width: 150 } },
        city: { title: '城市', column: { width: 110 } },
        salary: { title: '薪资', type: 'number', column: { width: 120 } },
        joinDate: { title: '入职日期', column: { width: 140 } },
      },
    },
  };
}
