/**
 * dg-cell-mvi-admin-element-plus · views/comp-tree/api — tree-select demo CRUD over the in-memory mock.
 *
 * Each row stores a dept (tree-select single value) and a deptMultiple (tree-select multi-value
 * array) to exercise both usage patterns on the same page.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张三',    dept: 'rd-fe',      status: 'active',   remark: '前端组核心成员' },
  { id: 2,  name: '李四',    dept: 'rd-be',      status: 'active',   remark: '后端组技术负责人' },
  { id: 3,  name: '王五',    dept: 'rd-fe',      status: 'inactive', remark: '' },
  { id: 4,  name: '赵六',    dept: 'design',     status: 'active',   remark: '视觉设计师' },
  { id: 5,  name: '孙七',    dept: 'pm',         status: 'active',   remark: '产品经理' },
  { id: 6,  name: '周八',    dept: 'rd-be',      status: 'active',   remark: '' },
  { id: 7,  name: '吴九',    dept: 'ops',        status: 'active',   remark: '运维工程师' },
  { id: 8,  name: '郑十',    dept: 'rd-fe',      status: 'inactive', remark: '' },
  { id: 9,  name: '冯十一',  dept: 'qa',         status: 'active',   remark: '测试工程师' },
  { id: 10, name: '陈十二',  dept: 'design',     status: 'active',   remark: '交互设计' },
  { id: 11, name: '楚十三',  dept: 'pm',         status: 'inactive', remark: '' },
  { id: 12, name: '卫十四',  dept: 'ops',        status: 'active',   remark: '容器化专家' },
  { id: 13, name: '蒋十五',  dept: 'rd-be',      status: 'active',   remark: 'Java 开发' },
  { id: 14, name: '沈十六',  dept: 'qa',         status: 'active',   remark: '自动化测试' },
  { id: 15, name: '韩十七',  dept: 'rd-fe',      status: 'active',   remark: 'Vue3 专项' },
];

const mock = buildMock('comp-tree', seed);

export const GetList  = (query: any)                    => mock.GetList(query);
export const AddObj   = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)    => mock.UpdateObj(form);
export const DelObj   = (id: any)                       => mock.DelObj(id);
