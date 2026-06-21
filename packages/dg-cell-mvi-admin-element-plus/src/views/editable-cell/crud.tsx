import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Cell-mode inline editing — click any editable cell to edit it in place; it saves on blur / Enter
 * via `updateCell` (a per-cell PATCH). exclusive + exclusiveEffect:'save' means moving to another
 * cell first persists the current one. The standard rowHandle is hidden (delete via the action col).
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
          mode: 'cell',
          exclusive: true,
          exclusiveEffect: 'save',
          updateCell: async ({ row, key, value }: { row: any; key: string; value: any }) =>
            api.UpdateObj({ id: row.id, [key]: value }),
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: {
          title: '姓名',
          column: { width: 180 },
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
