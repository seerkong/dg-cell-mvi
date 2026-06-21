import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * form-grid CRUD config — demonstrates two-column grid form layout via form.col.span.
 * Columns: id (no form) · name (search + required) · phone · email · dept · title · remark (full-width textarea).
 * Each field sets form:{ col:{ span:12 } }; remark uses span:24 to span both columns.
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
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70, sortable: true },
        },
        name: {
          title: '姓名',
          type: 'text',
          search: { show: true },
          column: { width: 120 },
          form: {
            rules: [{ required: true, message: '请输入姓名' }],
            col: { span: 12 },
          },
        },
        phone: {
          title: '手机号',
          type: 'text',
          column: { width: 150 },
          form: { col: { span: 12 } },
        },
        email: {
          title: '邮箱',
          type: 'text',
          column: { width: 200 },
          form: { col: { span: 12 } },
        },
        dept: {
          title: '部门',
          type: 'select',
          column: { width: 120 },
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: '技术部', label: '技术部' },
              { value: '产品部', label: '产品部' },
              { value: '运营部', label: '运营部' },
              { value: '市场部', label: '市场部' },
              { value: '人事部', label: '人事部' },
            ],
          },
          form: { col: { span: 12 } },
        },
        title: {
          title: '职位',
          type: 'select',
          column: { width: 130 },
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: '工程师', label: '工程师' },
              { value: '高级工程师', label: '高级工程师' },
              { value: '主任', label: '主任' },
              { value: '经理', label: '经理' },
              { value: '总监', label: '总监' },
            ],
          },
          form: { col: { span: 12 } },
        },
        remark: {
          title: '备注',
          type: 'textarea',
          form: { col: { span: 24 } },
        },
      },
    },
  };
}
