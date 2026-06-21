import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Free-mode inline editing — every editable cell is in edit from the start (`activeDefault`), with no
 * exclusivity. Users edit any cells across any rows, then 「全部保存」(`editableSaveAll`) validates +
 * submits every dirty row via `updateRow`. 「新增行」appends an editable blank row.
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
          mode: 'free',
          activeDefault: true,
          updateRow: async ({ row, isAdd }: { row: any; isAdd: boolean }) =>
            isAdd ? api.AddObj(row) : api.UpdateObj(row),
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: {
          title: '姓名',
          column: { width: 170 },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        age: { title: '年龄', type: 'number', column: { width: 140 } },
        status: {
          title: '状态',
          type: 'select',
          dict: statusDict,
          column: { width: 160 },
        },
        dept: { title: '部门', column: { width: 160 } },
      },
    },
  };
}
