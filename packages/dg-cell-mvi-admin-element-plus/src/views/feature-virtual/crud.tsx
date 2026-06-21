import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-virtual demo — table.mode='virtual' (el-table-v2 virtual scroll) over a 1000-row dataset.
 *
 * Shows the virtual list variant: only the visible rows render, so a large page scrolls smoothly.
 *  - `table.mode: 'virtual'` selects the el-table-v2 renderer (DgVirtualTable).
 *  - `table.selection` adds the leading checkbox column (selection works in virtual mode).
 *  - sortable columns (age/score) exercise server-side sort over the full set (@column-sort command).
 *  - `container: { height: '520px' }` exercises the outer-container passthrough (the wrapper height
 *    bounds the virtual viewport).
 *  - a big pageSize hands the whole set to the virtual table at once (so scrolling is the affordance,
 *    not pagination).
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
      // hand the full set to the virtual table at once → scrolling is the affordance.
      pagination: { pageSize: 1000 },
      // outer container: bounds the virtual viewport height (container passthrough demo).
      container: { height: '560px' },
      table: {
        mode: 'virtual',
        selection: { show: true },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: { title: '姓名', search: { show: true }, column: { width: 160 } },
        dept: { title: '部门', column: { width: 120 } },
        city: { title: '城市', column: { width: 120 } },
        age: { title: '年龄', type: 'number', column: { width: 120, sortable: true } },
        score: { title: '评分', type: 'number', column: { width: 120, sortable: true } },
      },
    },
  };
}
