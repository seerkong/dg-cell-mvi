import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Row-mode inline editing — clicking 编辑 turns the whole row into inputs (exclusive: one row at a
 * time); 保存 validates + submits the row via `updateRow` (AddObj for new rows, UpdateObj otherwise),
 * 取消 reverts. The standard rowHandle is hidden — the editable action column drives the row.
 */
const statusDict = {
  value: 'value',
  label: 'label',
  data: [
    { value: 'active', label: '在职' },
    { value: 'leave', label: '离职' },
    { value: 'probation', label: '试用' },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ({ commands }: { commands: CrudCommands }) {
  return {
    crudOptions: {
      request: {
        pageRequest: async (query: any) => api.GetList(query),
        delRequest: async ({ row }: { row: any }) => api.DelObj(row.id),
      },
      pagination: { pageSize: 10 },
      rowHandle: { show: false },
      table: {
        editable: {
          enabled: true,
          mode: 'row',
          exclusive: true,
          updateRow: async ({ row, isAdd }: { row: any; isAdd: boolean }) =>
            isAdd ? api.AddObj(row) : api.UpdateObj(row),
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: {
          title: '姓名',
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        age: { title: '年龄', type: 'number', column: { width: 130 } },
        status: {
          title: '状态',
          type: 'select',
          dict: statusDict,
          column: { width: 150 },
          form: { rules: [{ required: true, message: '请选择状态' }] },
        },
        dept: { title: '部门', column: { width: 150 } },
      },
    },
  };
}
