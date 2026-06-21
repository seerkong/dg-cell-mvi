import type { CreateCrudContext } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Feature-i18n demo — INJECTED translator localizes built-in framework chrome (Feature A).
 *
 * The injected translator (wired in index.vue via useCrud's `i18n` option) localizes the built-in
 * 新增/查看/编辑/删除/刷新/列设置/取消/保存 chrome to English when the EN locale is active. This factory
 * ALSO receives `t` (the resolver) in its context, so USER config can localize too — here the column
 * titles use `t('demo.col.*', '中文默认')`.
 */
export default function ({ t }: CreateCrudContext) {
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
      // enable the column-settings toolbar button so its 列设置/Columns label also localizes.
      toolbar: { columnsFilter: { show: true } },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: { title: t('demo.col.name', '姓名'), search: { show: true }, column: { width: 180 } },
        email: { title: t('demo.col.email', '邮箱') },
      },
    },
  };
}
