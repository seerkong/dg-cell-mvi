import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Demo CRUD config — a small page that exercises the richer cell types:
 *   id · title (search) · category (dict-select, static dict) · enabled (switch).
 * The dict is authored inline with static `data` so the page is self-contained (no dict endpoint);
 * value/label are the standard the reference crud dict keys, consumed by the dict slice for label resolution.
 */
const categoryDict = {
  value: 'value',
  label: 'label',
  data: [
    { value: 'frontend', label: '前端' },
    { value: 'backend', label: '后端' },
    { value: 'design', label: '设计' },
    { value: 'ops', label: '运维' },
  ],
};

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
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        title: { title: '标题', search: { show: true }, column: { width: 220 } },
        category: {
          title: '分类',
          type: 'dict-select',
          dict: categoryDict,
          column: { width: 140 },
          form: { component: { name: 'el-select' } },
        },
        enabled: {
          title: '启用',
          type: 'switch',
          column: { width: 100 },
          form: { component: { name: 'el-switch' }, value: true },
        },
      },
    },
  };
}
