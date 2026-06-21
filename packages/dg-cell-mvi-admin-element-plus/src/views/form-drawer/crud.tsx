import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * FormDrawer CRUD config — demonstrates the drawer form wrapper.
 * Add/edit opens as a right-side drawer (520px) instead of a dialog.
 * Columns: id (no form) · title (search + required) · author · status (select) · summary (textarea) · createTime (read-only).
 * Full request set (page/add/edit/del); limit/offset transform comes from commonCrudOptions.
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
      form: {
        wrapper: {
          is: 'drawer',
          size: '520px',
        },
      },
      pagination: { pageSize: 10 },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        title: {
          title: '标题',
          type: 'text',
          search: { show: true },
          column: { minWidth: 200 },
          form: {
            rules: [{ required: true, message: '请输入文章标题' }],
            col: { span: 24 },
          },
        },
        author: {
          title: '作者',
          type: 'text',
          column: { width: 120 },
          form: {
            rules: [{ required: true, message: '请输入作者' }],
            col: { span: 12 },
          },
        },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'published', label: '已发布' },
              { value: 'draft', label: '草稿' },
              { value: 'review', label: '审核中' },
            ],
          },
          search: { show: true },
          column: { width: 120 },
          form: { col: { span: 12 } },
        },
        summary: {
          title: '摘要',
          type: 'textarea',
          column: { minWidth: 240 },
          form: {
            col: { span: 24 },
            component: { rows: 4 },
          },
        },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 190 } },
      },
    },
  };
}
