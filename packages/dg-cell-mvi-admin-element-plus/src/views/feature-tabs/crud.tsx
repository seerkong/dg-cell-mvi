import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-tabs demo — a tabs quick-filter bar above the table that filters rows by `status`.
 *
 * Clicking a tab (在职 / 待入职 / 离职) constrains the list query to `{ status: <value> }` and refetches
 * from page 1; the prepended "全部" tab clears the filter (addAll: true). The `status` column reuses
 * the same labels via a static dict so cells render 在职/待入职/离职 instead of the raw code.
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
      // the tabs quick-filter bar (above the table): filter by `status`, with an 全部 tab.
      tabs: {
        show: true,
        name: 'status',
        options: [
          { label: '在职', value: 'active' },
          { label: '待入职', value: 'pending' },
          { label: '离职', value: 'disabled' },
        ],
        addAll: true,
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 80 },
        },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 160 },
        },
        dept: {
          title: '部门',
        },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'active',   label: '在职' },
              { value: 'pending',  label: '待入职' },
              { value: 'disabled', label: '离职' },
            ],
          },
          column: { width: 140 },
          form: { rules: [{ required: true, message: '请选择状态' }] },
        },
      },
    },
  };
}
