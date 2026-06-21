import { h } from 'vue';
import { ElTag } from 'element-plus';
import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-card demo — table.mode='card' renders each row as a card in a responsive grid.
 *
 * Card mapping (driven by the SHARED resolved columns):
 *  - title  = the first column's value (姓名 here — id is hidden via column.show:false so 姓名 leads);
 *  - body   = a label–value list of the remaining columns — honoring dict labels (status → 在职/…)
 *             and a custom cellRender (score → an el-tag colored by value), exactly like a table cell;
 *  - footer = the row actions (查看/编辑/删除) via DgRowHandle.
 * Selection (leading checkbox per card) + pagination + search are all preserved in card mode.
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
      pagination: { pageSize: 8 },
      table: {
        mode: 'card',
        selection: { show: true },
      },
      columns: {
        // id hidden in the card body so 姓名 becomes the leading card title.
        id: { title: 'ID', form: { show: false }, column: { show: false } },
        name: { title: '姓名', search: { show: true } },
        dept: { title: '部门' },
        city: { title: '城市' },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'active', label: '在职' },
              { value: 'pending', label: '待入职' },
              { value: 'disabled', label: '离职' },
            ],
          },
          form: { rules: [{ required: true, message: '请选择状态' }] },
        },
        score: {
          title: '评分',
          type: 'number',
          column: {
            // custom cell render — honored in card mode exactly as in the table (an el-tag by value).
            cellRender: ({ value }: { value: number }) =>
              h(
                ElTag,
                { type: value >= 85 ? 'success' : value >= 60 ? 'warning' : 'danger' },
                () => String(value ?? ''),
              ),
          },
        },
      },
    },
  };
}
