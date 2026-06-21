import type { CrudCommands, RemoveScopeContext } from 'dg-cell-mvi-element-plus';
import { ElMessage } from 'element-plus';
import * as api from './api';

/**
 * Remove-hook demo — exercises the P5 remove hook chain (capability crud.remove-wrapper, group A).
 *
 * The remove chain mirrors the submit chain: beforeRemove → doRemove|delRequest → afterRemove →
 * onRemoved, all at the crud effect boundary (never the pure reducer). The confirm dialog is UI (popped
 * in DgRowHandle from the projector passthrough) — here we customize its message and exercise the hooks:
 *
 * - rowHandle.remove.confirmMessage: a custom confirm prompt.
 * - rowHandle.remove.beforeRemove: GATE — aborts deleting a "locked" (锁定) record (returns false → no
 *   delRequest, no refresh, the row stays). Try deleting 订单中心 / 风控中心 (locked) to see it blocked.
 * - rowHandle.remove.afterRemove: side-effect after a successful delete — pops ElMessage.success.
 *
 * See dg-cell-mvi-crud/src/support/removeEffects.ts (removeChain) + logic/reducers/remove.ts.
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
      rowHandle: {
        remove: {
          confirmTitle: '删除确认',
          confirmMessage: '此操作将永久删除该记录，是否继续？',
          // GATE: locked records cannot be deleted — returning false aborts the chain (no request).
          beforeRemove: async (ctx: RemoveScopeContext) => {
            if (ctx.row?.locked) {
              ElMessage.warning(`beforeRemove 拦截：「${ctx.row?.name}」已锁定，不能删除`);
              return false;
            }
          },
          // runs only after a successful delete.
          afterRemove: async (ctx: RemoveScopeContext) => {
            ElMessage.success(`已删除「${ctx.row?.name}」`);
          },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 180 },
          form: { rules: [{ required: true, message: '请输入名称' }] },
        },
        owner: { title: '负责人', column: { width: 120 } },
        locked: {
          title: '锁定',
          type: 'switch',
          column: { width: 90 },
          form: { value: false, helper: '锁定的记录会被 beforeRemove 拦截，无法删除' },
        },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 200 } },
      },
    },
  };
}
