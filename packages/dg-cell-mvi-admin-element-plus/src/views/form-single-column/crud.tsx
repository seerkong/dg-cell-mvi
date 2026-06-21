import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Single-column form demo — crudOptions.form.layout:'default' with no per-column form.col,
 * so every field renders on its own full-width row in the form dialog.
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
      form: {
        layout: 'default',
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70 },
        },
        title: {
          title: '标题',
          search: { show: true },
          form: {
            rules: [{ required: true, message: '请输入标题' }],
          },
        },
        author: {
          title: '作者',
          column: { width: 160 },
        },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'draft',     label: '草稿' },
              { value: 'published', label: '已发布' },
              { value: 'archived',  label: '已归档' },
            ],
          },
          column: { width: 140 },
        },
        summary: {
          title: '摘要',
          type: 'textarea',
          column: { show: false },
        },
      },
    },
  };
}
