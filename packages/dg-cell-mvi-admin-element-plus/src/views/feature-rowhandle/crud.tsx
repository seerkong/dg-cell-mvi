import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import { dict } from 'dg-cell-mvi-element-plus';
import { ElMessage } from 'element-plus';
import * as api from './api';

/**
 * Feature-rowhandle demo (P7·T7.2) — four faithful ports of the reference crud:
 *
 *  - rowHandle.dropdown { atLeast: 2 }: the row has many action buttons; the first 2 stay inline and
 *    the rest collapse into a "更多 ▾" dropdown (each menu item runs the same action / onClick).
 *  - rowHandle button group: 审核 + 驳回 declare the same `group: 'flow'` so they render as one
 *    el-button-group (审核/驳回 are审批流操作); the built-ins stay standalone.
 *  - dict.labelBuilder: the 状态 column's dict builds its label as `${label}(${value})` (e.g. 在职(1)).
 *  - dict.onReady: once the (async) status dict resolves, an ElMessage announces it (effect boundary).
 *
 *  Custom buttons carry an `onClick` (the MVI counterpart of the reference crud's button `click`) receiving the
 *  per-row `{ row, index }` scope; the built-in view/edit/remove keep their default command dispatch.
 */
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
        // wider so the inline buttons + 更多 dropdown fit comfortably.
        width: 280,
        // overflow: keep 2 buttons inline (查看/编辑), the rest go into the 更多 ▾ dropdown.
        dropdown: { show: true, atLeast: 2, text: '更多' },
        buttons: {
          view: { order: 1 },
          edit: { order: 2 },
          remove: { order: 3 },
          // two grouped buttons (审批流): render as one el-button-group.
          audit: {
            text: '审核',
            type: 'success',
            order: 4,
            group: 'flow',
            onClick: ({ row }: { row: any }) => ElMessage.success(`已审核「${row.name}」`),
          },
          reject: {
            text: '驳回',
            type: 'warning',
            order: 5,
            group: 'flow',
            onClick: ({ row }: { row: any }) => ElMessage.warning(`已驳回「${row.name}」`),
          },
          // a plain custom button — opens the view dialog via the command.
          detail: {
            text: '详情',
            order: 6,
            onClick: ({ row, index }: { row: any; index: number }) => commands.openView({ row, index }),
          },
        },
      },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: { title: '姓名', column: { width: 140 }, search: { show: true } },
        dept: { title: '部门', column: { width: 140 } },
        status: {
          title: '状态',
          type: 'select',
          column: { width: 140 },
          // labelBuilder: render the dict label as `${label}(${value})` (e.g. 在职(1)); onReady: pop a
          // message once the async dict data resolves (fired at the dict-loading effect boundary).
          dict: dict({
            value: 'value',
            label: 'label',
            getData: () => api.getStatusDict(),
            labelBuilder: (item: any) => `${item.label}(${item.value})`,
            onReady: (ctx: { data: any[] }) => ElMessage.info(`状态字典已就绪：${ctx.data.length} 项`),
          }),
        },
      },
    },
  };
}
