import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-multiheader demo — T7.3 multi-level table headers (E) + per-column exportable (F):
 *
 *  - grouped headers via `column.children`: the 联系方式 group spans 电话 / 邮箱, and the 考核 group
 *    spans 季度 / 年度. el-table renders these as two-level headers (the group label over its leaves).
 *  - per-column `exportable: false`: the 备注 column is excluded from CSV export (the toolbar 导出
 *    button is enabled below) — every other column (incl. the grouped leaves) IS exported.
 *
 * Group nodes are header-only (no form field); the leaf columns under them edit/render like any cell.
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
      // enable the toolbar export button so the exportable:false exclusion is demonstrable.
      toolbar: { buttons: { export: { show: true } } },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: { title: '姓名', search: { show: true }, column: { width: 110 } },
        dept: { title: '部门', column: { width: 110 } },
        // ── header GROUP: 联系方式 over 电话 / 邮箱 ──
        contact: {
          title: '联系方式',
          children: {
            phone: { title: '电话', column: { width: 150 } },
            email: { title: '邮箱', column: { width: 180 } },
          },
        },
        // ── header GROUP: 考核 over 季度 / 年度 ──
        review: {
          title: '考核',
          children: {
            quarterScore: { title: '季度', type: 'number', column: { width: 90, align: 'center' } },
            yearScore: { title: '年度', type: 'number', column: { width: 90, align: 'center' } },
          },
        },
        // a top-level column EXCLUDED from CSV export.
        remark: { title: '备注(不导出)', exportable: false, column: { width: 160 } },
      },
    },
  };
}
