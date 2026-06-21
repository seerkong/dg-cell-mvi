import type { CrudCommands, FormScopeContext } from 'dg-cell-mvi-element-plus';
import { ElMessage } from 'element-plus';
import * as api from './api';

/**
 * Submit-hook demo — exercises the P1 form submit hook chain (crud.form.submit-hooks).
 *
 * - form.beforeValidate: a console marker showing the chain starts before validation.
 * - form.beforeSubmit: GATE — rejects when 名称 contains "test", aborting the submit (no
 *   add/editRequest fires, the dialog stays open, submitStatus drops back to idle). Try saving a row
 *   named e.g. "test123" to see it intercepted.
 * - form.afterSubmit: side-effect that runs only after a successful write — pops an ElMessage.
 *
 * The hooks live on `crudOptions.form` and run at the submit effect boundary (never the pure
 * reducer); see dg-cell-mvi-crud/src/support/formEffects.ts (submitChain).
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
        // chain: beforeValidate → (validate) → beforeSubmit → doSubmit/add/editRequest → afterSubmit → onSuccess
        beforeValidate: async (ctx: FormScopeContext) => {
          // eslint-disable-next-line no-console
          console.log('[form-hooks] beforeValidate', ctx.mode, ctx.form);
        },
        beforeSubmit: async (ctx: FormScopeContext) => {
          if (String(ctx.form.name || '').toLowerCase().includes('test')) {
            ElMessage.warning('beforeSubmit 拦截：名称不能包含 "test"');
            // throwing (or returning false) aborts the submit — no request, dialog stays open.
            throw new Error('name contains "test"');
          }
        },
        afterSubmit: async (ctx: FormScopeContext) => {
          // runs only after a successful add/editRequest.
          ElMessage.success(`afterSubmit：${ctx.mode === 'add' ? '新增' : '更新'}「${ctx.form.name}」成功`);
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 180 },
          form: {
            rules: [{ required: true, message: '请输入名称' }],
            helper: '试试输入包含 "test" 的名称，会被 beforeSubmit 拦截',
          },
        },
        owner: {
          title: '负责人',
          column: { width: 120 },
          form: { rules: [{ required: true, message: '请输入负责人' }] },
        },
        remark: { title: '备注', column: { width: 160 }, form: { component: { name: 'el-input' } } },
        createTime: { title: '创建时间', form: { show: false }, column: { width: 200 } },
      },
    },
  };
}
