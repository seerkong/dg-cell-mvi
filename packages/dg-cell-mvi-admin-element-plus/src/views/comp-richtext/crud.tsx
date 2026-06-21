import { h } from 'vue';
import type { CrudCommands, CellRenderScope } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * RichTextEditor (tiptap) component demo (P1 · crud.rich-components-ext).
 *
 * The `content` column edits an HTML string via the globally-registered RichTextEditor widget
 * (`form.component.name='rich-text-editor'`, v-model = HTML). Read-only rendering:
 *  - View mode (openView): DgFormItem passes `disabled: true`, which RichTextEditor maps to
 *    `editor.setEditable(false)` → the same editor shown non-editable.
 *  - Table cell: `column.cellRender` renders the stored HTML read-only inside a height-clamped div via
 *    `innerHTML`. The HTML is StarterKit-only output (no script/style nodes), so this is safe for the
 *    demo's own data; we additionally strip any `<script>` defensively.
 * No framework change is needed — DgComponentRender resolves the widget by global name; cellRender
 * (prior track) drives the read-only cell display.
 */
const stripScripts = (html: string): string =>
  html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');

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
        title: {
          title: '标题',
          search: { show: true },
          column: { width: 180 },
          form: { rules: [{ required: true, message: '请输入标题' }] },
        },
        content: {
          title: '描述',
          column: {
            minWidth: 320,
            // read-only HTML preview in the cell (StarterKit output; scripts stripped defensively).
            cellRender: ({ value }: CellRenderScope) => {
              const html = typeof value === 'string' ? value : '';
              if (!html) return h('span', { style: 'color:var(--el-text-color-secondary)' }, '—');
              return h('div', {
                class: 'fs-richtext-cell',
                style:
                  'max-height:72px;overflow:auto;line-height:1.5;font-size:13px;' +
                  'word-break:break-word',
                innerHTML: stripScripts(html),
              });
            },
          },
          form: {
            value: '<p></p>',
            // referenced by global name (kebab resolves the PascalCase registration); no component
            // object enters crudOptions — cloneDeep-safe, same pattern as the other rich widgets.
            component: { name: 'rich-text-editor' },
            col: { span: 24 },
            helper: '富文本编辑（tiptap），字段值为 HTML 字符串；查看模式只读',
          },
        },
      },
    },
  };
}
