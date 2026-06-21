import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * Cascader component demo — full CRUD with a static two-level 省→市 tree dict.
 * The `region` column uses type:"cascader" + dict.isTree:true so the table cell
 * resolves the leaf value back to a label path and the form shows a cascader picker.
 */

/** Static 省→市 two-level tree used as the cascader dict. */
const regionTree = [
  {
    value: 'bj',
    label: '北京',
    children: [
      { value: 'bj_chaoyang',    label: '朝阳区' },
      { value: 'bj_haidian',     label: '海淀区' },
      { value: 'bj_dongcheng',   label: '东城区' },
      { value: 'bj_shijingshan', label: '石景山区' },
    ],
  },
  {
    value: 'sh',
    label: '上海',
    children: [
      { value: 'sh_huangpu',  label: '黄浦区' },
      { value: 'sh_xuhui',    label: '徐汇区' },
      { value: 'sh_changning',label: '长宁区' },
      { value: 'sh_jingan',   label: '静安区' },
    ],
  },
  {
    value: 'gz',
    label: '广州',
    children: [
      { value: 'gz_tianhe', label: '天河区' },
      { value: 'gz_yuexiu', label: '越秀区' },
      { value: 'gz_haizhu', label: '海珠区' },
      { value: 'gz_baiyun', label: '白云区' },
    ],
  },
  {
    value: 'sz',
    label: '深圳',
    children: [
      { value: 'sz_nanshan', label: '南山区' },
      { value: 'sz_futian',  label: '福田区' },
      { value: 'sz_longhua', label: '龙华区' },
    ],
  },
];

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
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70, sortable: true },
        },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 160 },
          form: { rules: [{ required: true, message: '请输入姓名' }] },
        },
        region: {
          title: '所在地区',
          type: 'cascader',
          search: { show: true },
          dict: {
            isTree: true,
            value: 'value',
            label: 'label',
            data: regionTree,
          },
          form: {
            rules: [{ required: true, message: '请选择所在地区' }],
          },
          column: { width: 200 },
        },
      },
    },
  };
}
