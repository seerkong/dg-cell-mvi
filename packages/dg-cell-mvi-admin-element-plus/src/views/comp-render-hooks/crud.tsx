import { h } from 'vue';
import { ElTag } from 'element-plus';
import { compute } from 'dg-cell-mvi-element-plus';
import type {
  CrudCommands,
  CellRenderScope,
  ComputeScope,
  FormItemRenderScope,
  ValueChangeScope,
} from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Render hooks + field linkage demo — exercises the P4 capability crud.render-hooks. All four hook
 * kinds, plus valueChange linkage. Render hooks return VNodes (via `h`) and are CALLED in the Vue
 * layer (DgCell / DgFormItem) — never in the agnostic crud package; here they are just config refs.
 *
 * 1) CELL render hook (`column.cellRender`): the `状态(status)` column renders an `el-tag` whose
 *    type/text depend on the row value (active=success / pending=warning / disabled=info).
 * 2) FORM-ITEM prefix/suffix (`form.prefixRender` / `form.suffixRender`): the `月薪(salary)` input is
 *    wrapped with a `¥` prefix and a `元` suffix, inline around the number input.
 * 3) conditionalRender (`form.conditionalRender`): the `类型(type)` item, when type === 'external',
 *    renders a highlighted note instead of the default select (match() is evaluated live in the view).
 * 4) valueChange linkage (`column.valueChange`): changing `省份(province)` clears `城市(city)` and the
 *    city options switch to that province — changing field A sets field B (one-level, loop-guarded).
 *
 * See dg-cell-mvi-crud: contract/crudOptions.ts (hook + valueChange types), logic/projectors*.ts
 * (opaque passthrough), support/formEffects.ts (crud.fx.valueChange + fromValueChange loop guard);
 * dg-cell-mvi-vue: components/DgRender.tsx, DgCell.tsx (cellRender), DgFormItem.vue (form-item hooks).
 */
const STATUS_TAG: Record<string, { type: 'success' | 'warning' | 'info' | 'danger'; text: string }> = {
  active: { type: 'success', text: '在职' },
  pending: { type: 'warning', text: '待入职' },
  disabled: { type: 'info', text: '离职' },
};

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
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 110 },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        // (1) cellRender: a colored el-tag derived from the row value.
        status: {
          title: '状态',
          type: 'select',
          column: {
            width: 120,
            // opaque fn ref — passed through the agnostic layer, CALLED per-row in DgCell.
            cellRender: ({ value }: CellRenderScope) => {
              const cfg = STATUS_TAG[value as string] ?? { type: 'info' as const, text: String(value ?? '-') };
              return h(ElTag, { type: cfg.type, effect: 'light' }, () => cfg.text);
            },
          },
          dict: {
            data: [
              { value: 'active', label: '在职' },
              { value: 'pending', label: '待入职' },
              { value: 'disabled', label: '离职' },
            ],
          },
          form: { value: 'active' },
        },
        // (2) prefixRender + suffixRender: ¥ … 元 around the salary input.
        salary: {
          title: '月薪',
          type: 'number',
          column: { width: 120 },
          form: {
            value: 10000,
            component: { name: 'el-input-number', min: 0, max: 1000000, step: 1000, controlsPosition: 'right' },
            prefixRender: (_scope: FormItemRenderScope) => h('span', { style: 'font-weight:600' }, '¥'),
            suffixRender: (_scope: FormItemRenderScope) => h('span', '元'),
            helper: 'prefixRender/suffixRender 在输入框前后内联渲染',
          },
        },
        // (3) conditionalRender: external type → a custom note instead of the default select.
        type: {
          title: '类型',
          type: 'select',
          column: { width: 110 },
          dict: {
            data: [
              { value: 'internal', label: '内部' },
              { value: 'external', label: '外部' },
            ],
          },
          form: {
            value: 'internal',
            component: { name: 'el-select', options: [
              { value: 'internal', label: '内部' },
              { value: 'external', label: '外部' },
            ] },
            // when type === 'external', render a highlighted note block instead of the select.
            conditionalRender: {
              match: (scope: FormItemRenderScope) => scope.form?.type === 'external',
              render: (scope: FormItemRenderScope) =>
                h(
                  'div',
                  { style: 'padding:6px 10px;border:1px dashed var(--el-color-warning);border-radius:4px;color:var(--el-color-warning)' },
                  `外部人员（type=${scope.value}）：conditionalRender 命中，已替换默认选择器`,
                ),
            },
          },
        },
        // (4) valueChange linkage: changing 省份 clears 城市; city options follow the province.
        province: {
          title: '省份',
          type: 'select',
          column: { width: 100 },
          form: {
            value: 'bj',
            component: { name: 'el-select', options: api.PROVINCES, clearable: true },
          },
          // changing A (province) sets B (city) — runs at the effect boundary, loop-guarded.
          valueChange: ({ setValue }: ValueChangeScope) => setValue('city', ''),
        },
        city: {
          title: '城市',
          type: 'select',
          column: {
            width: 120,
            // resolve value→label across all provinces so the table cell shows a readable name.
            formatter: ({ value }: CellRenderScope) => {
              const all = [...api.CITIES.bj, ...api.CITIES.sh, ...api.CITIES.gd];
              return all.find((c) => c.value === value)?.label ?? String(value ?? '');
            },
          },
          form: {
            // options follow the live province (sync compute); valueChange on province also CLEARS
            // this field — so picking a new 省份 both empties 城市 and switches its options.
            component: {
              name: 'el-select',
              clearable: true,
              placeholder: '改省份后此处被清空',
              options: compute(({ form }: ComputeScope) => api.CITIES[form?.province as string] ?? []),
            },
          },
        },
      },
    },
  };
}
