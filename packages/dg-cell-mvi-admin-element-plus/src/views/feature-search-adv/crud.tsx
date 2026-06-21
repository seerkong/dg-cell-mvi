import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-search-adv demo — T7.3 search enhancements (A col span, B valueResolve, C autoSearchTrigger,
 * D search_<key> slot):
 *
 *  - search `col`: each search field sets a grid span (`search.col.span`) so the bar lays out 姓名(8) /
 *    部门(8) / 级别(8) on one row and the 入职时间 range on its own wider cell.
 *  - search `valueResolve`: the 入职时间 daterange field resolves into TWO query params
 *    `createTimeStart` / `createTimeEnd` (and drops the original key) — the mock applies them as a real
 *    range filter.
 *  - `autoSearchTrigger: 'change'`: crud-wide — typing/selecting any field auto-filters (debounced in
 *    DgSearch), no need to press 查询.
 *  - search_<key> slot: the 级别 field is custom-rendered (an el-select of levels) via the
 *    `#search_level` slot in index.vue.
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
      // crud-wide auto-search: a change to ANY search field auto-submits (debounced in the view).
      search: { autoSearchTrigger: 'change' },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: {
          title: '姓名',
          // (A) grid span: this search item takes 8/24 of the search row.
          search: { show: true, col: { span: 8 } },
          column: { width: 120 },
        },
        dept: {
          title: '部门',
          search: { show: true, col: { span: 8 } },
        },
        level: {
          title: '级别',
          // (D) this field is custom-rendered via the #search_level slot (index.vue).
          search: { show: true, col: { span: 8 } },
        },
        createTime: {
          title: '入职时间',
          search: {
            show: true,
            // a wider cell for the daterange picker.
            col: { span: 12 },
            // the daterange field itself (el-date-picker range): bound by the default input in
            // DgSearch unless slotted; here we keep the default but rely on valueResolve below.
            component: { name: 'el-date-picker', type: 'daterange', valueFormat: 'YYYY-MM-DD' },
            // (B) valueResolve: split [start, end] into two query params + drop the original key.
            valueResolve: ({ form, key, value }: { form: Record<string, any>; key: string; value: any }) => {
              if (Array.isArray(value) && value.length === 2) {
                form.createTimeStart = value[0];
                form.createTimeEnd = value[1];
              }
              delete form[key];
            },
          },
        },
      },
    },
  };
}
