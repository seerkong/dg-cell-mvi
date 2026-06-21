import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Form group-tabs demo — same grouping as form-group but rendered as tabs via form.layout:'group-tabs'.
 * Groups: 基本信息 (name/phone/email), 公司信息 (company/address), 其他 (remark).
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
        layout: 'group-tabs',
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70 },
        },
        name: {
          title: '姓名',
          search: { show: true },
          form: {
            group: '基本信息',
            col: { span: 12 },
            rules: [{ required: true, message: '请输入姓名' }],
          },
        },
        phone: {
          title: '电话',
          form: {
            group: '基本信息',
            col: { span: 12 },
          },
        },
        email: {
          title: '邮箱',
          form: {
            group: '基本信息',
            col: { span: 12 },
          },
        },
        company: {
          title: '公司',
          form: {
            group: '公司信息',
            col: { span: 12 },
          },
        },
        address: {
          title: '地址',
          form: {
            group: '公司信息',
            col: { span: 24 },
          },
        },
        remark: {
          title: '备注',
          type: 'textarea',
          column: { show: false },
          form: {
            group: '其他',
            col: { span: 24 },
          },
        },
      },
    },
  };
}
