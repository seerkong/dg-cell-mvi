import type { CrudCommands, FormButtonContext } from 'dg-cell-mvi-element-plus';
import { ElMessage } from 'element-plus';
import * as api from './api';

/**
 * Form-wrapper advanced demo — exercises the P5 wrapper behaviors (capability crud.remove-wrapper,
 * group B). All of these read from `form.wrapper` (projector passthrough) + `form.buttons`:
 *
 * - wrapper.draggable: the dialog header can be dragged.
 * - wrapper.saveRemind: edit a field then close via the X / 取消 → a "有未保存的修改，确定关闭？" confirm
 *   pops (dirty tracking: the projector derives form.dirty from the open-time snapshot). Close an
 *   un-edited form → no confirm.
 * - wrapper.saveDraft (+ table.id): edits persist to localStorage (crud:formDraft:form-wrapper); reopen
 *   the add form after editing-without-submitting → a "检测到未提交的草稿，是否恢复？" confirm restores it;
 *   a successful submit clears the draft.
 * - wrapper.onOpen / onClosed: lifecycle callbacks pop an ElMessage.
 * - form.buttons: a custom "保存并继续" button (submits, then reopens a fresh add form) rendered in
 *   ADDITION to the default 取消/确定 footer.
 *
 * See dg-cell-mvi-vue/src/components/DgFormWrapper.vue + dg-cell-mvi-crud form slice (initial snapshot,
 * form.dirty projector, saveDraft storage port, customButtons passthrough).
 */
export default function ({ commands }: { commands: CrudCommands }) {
  return {
    crudOptions: {
      // a stable table id → the saveDraft storage key is crud:formDraft:form-wrapper.
      table: { id: 'form-wrapper' },
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
        wrapper: {
          draggable: true,
          saveRemind: true,
          saveDraft: true,
          onOpen: () => ElMessage.info('onOpen：表单已打开'),
          onClosed: () => ElMessage.info('onClosed：表单已关闭'),
        },
        // custom footer buttons — rendered in addition to the default 取消/确定.
        buttons: [
          {
            text: '保存并继续',
            type: 'success',
            // submit the current form, then reopen a fresh add form once the submit settles.
            onClick: (ctx: FormButtonContext) => {
              ctx.submit();
              setTimeout(() => commands.openAdd(), 400);
            },
          },
        ],
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 180 },
          form: {
            rules: [{ required: true, message: '请输入名称' }],
            helper: '改一个字段后点 X 关闭 → 弹"未保存"确认；编辑后不提交再开 → 弹草稿恢复',
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
