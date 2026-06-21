import type { CrudCommands, ComputeScope } from 'dg-cell-mvi-element-plus';
import { compute, asyncCompute } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Dynamic config (compute) demo — exercises the P2 capability crud.compute.
 *
 * 1) SYNC compute on a FORM ITEM (resolved in the projector against the live form):
 *    `折扣(discount)` is disabled via `compute(({form}) => form.locked === true)` — toggle the
 *    `锁定(locked)` switch in the dialog and the 折扣 input enables/disables live. `仅VIP备注` uses a
 *    `show` compute so it only appears when `类型 = vip`.
 *
 * 2) SYNC compute on a TABLE CELL (resolved per-row in DgCell, scope = {row,index,value}):
 *    the `密钥(secret)` column's cell is hidden for non-vip rows via
 *    `column.show = compute(({row}) => row.type === 'vip')` — vip rows show the secret, others blank.
 *
 * 3) ASYNC compute OPTIONS on a watched key (resolved at the effect boundary, stored in state):
 *    `城市(city)` options come from `asyncCompute({ watch: ({form}) => form.province, asyncFn })` —
 *    pick a 省份 in the dialog and the 城市 select refetches its options (defaultValue [] meanwhile).
 *
 * See dg-cell-mvi-crud: logic/projectors/form.ts (sync form-item + async-options injection),
 * vue/components/DgCell.tsx (per-row cell compute), support/formEffects.ts (resolveAsyncCompute).
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
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70, sortable: true } },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 120 },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        type: {
          title: '类型',
          type: 'dict-radio',
          column: { width: 120 },
          dict: {
            data: [
              { value: 'vip', label: 'VIP' },
              { value: 'normal', label: '普通' },
            ],
          },
          form: { value: 'normal' },
        },
        // (2) per-row cell compute: hide the secret for non-vip rows.
        secret: {
          title: '密钥(仅VIP可见)',
          column: {
            width: 160,
            show: compute(({ row }: ComputeScope) => row?.type === 'vip') as unknown as boolean,
          },
          form: { show: false },
        },
        locked: {
          title: '锁定',
          type: 'switch',
          column: { width: 90 },
          form: { value: false, component: { name: 'el-switch' } },
        },
        // (1) form-item compute: disabled follows the sibling `locked` field.
        discount: {
          title: '折扣',
          type: 'number',
          column: { width: 100 },
          form: {
            value: 100,
            helper: '锁定开启时禁用（compute 跟随 locked 字段）',
            component: {
              name: 'el-input-number',
              min: 0,
              max: 100,
              disabled: compute(({ form }: ComputeScope) => form?.locked === true),
            },
          },
        },
        // (1) form-item show compute: VIP-only note.
        vipNote: {
          title: '仅VIP备注',
          form: {
            show: compute(({ form }: ComputeScope) => form?.type === 'vip') as unknown as boolean,
            component: { name: 'el-input', placeholder: '类型为 VIP 时才出现' },
          },
        },
        province: {
          title: '省份',
          type: 'select',
          column: { width: 110 },
          form: {
            value: 'bj',
            component: { name: 'el-select', options: api.PROVINCES, clearable: true },
          },
        },
        // (3) async options on a watched key: cities refetch when `province` changes.
        city: {
          title: '城市',
          type: 'select',
          column: { width: 130 },
          form: {
            component: {
              name: 'el-select',
              clearable: true,
              options: asyncCompute({
                watch: ({ form }: ComputeScope) => form?.province,
                asyncFn: async (province: string) => (province ? api.GetCities(province) : []),
                defaultValue: [],
              }),
            },
          },
        },
      },
    },
  };
}
