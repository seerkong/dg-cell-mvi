import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Editable refinements (P7·T7.1) — cell-mode inline editing showcasing the new knobs:
 *  - `editable.activeTrigger: 'dblclick'` — DOUBLE-click a cell to enter its inline editor.
 *  - `column.editable: false` (员工编号 code) — visible but NEVER editable while sibling cells edit.
 *  - `column.editable: { readonly: true }` (部门 dept) — same effect via the object shape.
 *  - the programmatic `editableUpdateCell` command is exercised from index.vue (一键 +1 岁 / 设状态).
 * Saves on blur / Enter via `updateCell` (a per-cell PATCH). The standard rowHandle is hidden.
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
          // double-click (not single click) activates a cell's inline editor.
          activeTrigger: 'dblclick',
          updateCell: async ({ row, key, value }: { row: any; key: string; value: any }) =>
            api.UpdateObj({ id: row.id, [key]: value }),
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        // a read-only column: shown, but never turns into an input even while other cells edit.
        code: { title: '员工编号', column: { width: 140, editable: false } },
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
        },
        // another read-only column, expressed via the object shape `{ readonly: true }`.
        dept: { title: '部门', column: { width: 150, editable: { readonly: true } } },
      },
    },
  };
}
