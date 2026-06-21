import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Checkbox component demo — crudOptions for views/comp-checkbox.
 *
 * Key column: `skills` — type "checkbox", value is an ARRAY of strings, backed by a static dict
 * {前端(fe), 后端(be), 设计(design), 运维(ops)}. The form default value must be [] so
 * Element Plus checkbox-group renders correctly when adding a new row.
 *
 * Columns: id (no form) · name (search + required) · skills (checkbox) · createTime (read-only).
 * Form uses a two-column grid layout (span:12) and opens as a right drawer.
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
        wrapper: { is: 'drawer', size: '520px' },
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70, sortable: true },
        },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 160 },
          form: {
            rules: [{ required: true, message: '请输入姓名' }],
            col: { span: 12 },
          },
        },
        skills: {
          title: '技能',
          type: 'checkbox',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'fe',     label: '前端' },
              { value: 'be',     label: '后端' },
              { value: 'design', label: '设计' },
              { value: 'ops',    label: '运维' },
            ],
          },
          form: {
            value: [],
            col: { span: 24 },
          },
        },
        createTime: {
          title: '创建时间',
          form: { show: false },
          column: { width: 200 },
        },
      },
    },
  };
}
