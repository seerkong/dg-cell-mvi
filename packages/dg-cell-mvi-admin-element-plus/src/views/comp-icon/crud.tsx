import { h } from 'vue';
import { ElIcon } from 'element-plus';
import * as ElementPlusIcons from '@element-plus/icons-vue';
import type { CrudCommands, CellRenderScope } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * IconPicker component demo (P1 · crud.rich-components-ext).
 *
 * The `icon` column edits an Element Plus icon NAME via the globally-registered IconPicker widget
 * (`form.component.name='icon-picker'`, v-model = the name string). The table cell resolves that name
 * back to its icon component through the same `@element-plus/icons-vue` map and renders it inside an
 * `<el-icon>` via `column.cellRender` — the opaque fn ref passed through the agnostic crud layer and
 * CALLED per-row in DgCell. No framework change is needed: DgComponentRender resolves the component by
 * its global name, and cellRender (prior track) drives the read-only cell display.
 */
const ICONS = ElementPlusIcons as unknown as Record<string, any>;

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
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 80 } },
        name: {
          title: '名称',
          search: { show: true },
          column: { width: 200 },
          form: { rules: [{ required: true, message: '请输入名称' }] },
        },
        icon: {
          title: '图标',
          column: {
            width: 160,
            // resolve the stored icon name -> icon component, render inside <el-icon>.
            cellRender: ({ value }: CellRenderScope) => {
              const name = value as string;
              const comp = name ? ICONS[name] : undefined;
              if (!comp) return h('span', { style: 'color:var(--el-text-color-secondary)' }, String(value ?? '—'));
              return h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, [
                h(ElIcon, { size: 18 }, () => h(comp)),
                h('span', { style: 'font-size:13px' }, name),
              ]);
            },
          },
          form: {
            value: 'House',
            // referenced by global name (kebab resolves the PascalCase registration) — no component
            // object enters crudOptions (cloneDeep-safe), same pattern as the other rich widgets.
            component: { name: 'icon-picker' },
            helper: '搜索选择 Element Plus 图标，字段值为图标名',
            rules: [{ required: true, message: '请选择图标' }],
          },
        },
      },
    },
  };
}
