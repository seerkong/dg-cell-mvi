import type { CrudCommands } from 'dg-cell-mvi-element-plus';
import * as api from './api';

/**
 * comp-tree CRUD config — demonstrates type:"tree-select" backed by a static 2-level TREE dict
 * (isTree:true). The `dept` column stores a single leaf value; the table cell auto-resolves the
 * label by walking the tree dict. Drawer form opens on the right for a richer editing experience.
 *
 * Dept tree (2 levels):
 *   研发部 (rd)
 *     ├─ 前端组 (rd-fe)
 *     └─ 后端组 (rd-be)
 *   产品与设计 (pd)
 *     ├─ 产品管理 (pm)
 *     └─ 视觉设计 (design)
 *   基础保障 (infra)
 *     ├─ 质量保障 (qa)
 *     └─ 运维 (ops)
 */

const deptTree = [
  {
    value: 'rd',
    label: '研发部',
    children: [
      { value: 'rd-fe', label: '前端组' },
      { value: 'rd-be', label: '后端组' },
    ],
  },
  {
    value: 'pd',
    label: '产品与设计',
    children: [
      { value: 'pm',     label: '产品管理' },
      { value: 'design', label: '视觉设计' },
    ],
  },
  {
    value: 'infra',
    label: '基础保障',
    children: [
      { value: 'qa',  label: '质量保障' },
      { value: 'ops', label: '运维' },
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
      form: {
        wrapper: { is: 'drawer', size: '520px' },
      },
      columns: {
        id: {
          title: 'ID',
          form: { show: false },
          column: { width: 70, sortable: true },
        },
        name: {
          title: '姓名',
          search: { show: true },
          column: { width: 120 },
          form: {
            col: { span: 12 },
            rules: [{ required: true, message: '请输入姓名' }],
          },
        },
        dept: {
          title: '所属部门',
          type: 'tree-select',
          dict: {
            value: 'value',
            label: 'label',
            isTree: true,
            data: deptTree,
          },
          search: { show: true },
          column: { width: 160 },
          form: {
            col: { span: 12 },
            rules: [{ required: true, message: '请选择所属部门' }],
          },
        },
        status: {
          title: '状态',
          type: 'select',
          dict: {
            value: 'value',
            label: 'label',
            data: [
              { value: 'active',   label: '在职' },
              { value: 'inactive', label: '离职' },
            ],
          },
          search: { show: true },
          column: { width: 100 },
          form: { col: { span: 12 } },
        },
        remark: {
          title: '备注',
          type: 'textarea',
          form: { col: { span: 24 } },
        },
      },
    },
  };
}
