/**
 * dg-cell-mvi-admin-element-plus · views/feature-multiheader/api — grouped-header + exportable demo backend.
 *
 * Rows carry leaf fields that sit under two header GROUPS: 联系方式 (phone / email) and 考核
 * (quarterScore / yearScore), plus a top-level 备注 column marked exportable:false to show CSV
 * exclusion. Standard limit/offset mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张伟', dept: '研发部', phone: '13800000001', email: 'zhang@ex.com', quarterScore: 88, yearScore: 91, remark: '内部备注A' },
  { id: 2, name: '王芳', dept: '市场部', phone: '13800000002', email: 'wang@ex.com',  quarterScore: 76, yearScore: 80, remark: '内部备注B' },
  { id: 3, name: '李娜', dept: '研发部', phone: '13800000003', email: 'lina@ex.com',  quarterScore: 95, yearScore: 93, remark: '内部备注C' },
  { id: 4, name: '刘洋', dept: '财务部', phone: '13800000004', email: 'liu@ex.com',   quarterScore: 82, yearScore: 85, remark: '内部备注D' },
  { id: 5, name: '陈静', dept: '研发部', phone: '13800000005', email: 'chen@ex.com',  quarterScore: 90, yearScore: 88, remark: '内部备注E' },
  { id: 6, name: '杨磊', dept: '市场部', phone: '13800000006', email: 'yang@ex.com',  quarterScore: 71, yearScore: 75, remark: '内部备注F' },
  { id: 7, name: '黄敏', dept: '人事部', phone: '13800000007', email: 'huang@ex.com', quarterScore: 84, yearScore: 86, remark: '内部备注G' },
  { id: 8, name: '赵雷', dept: '研发部', phone: '13800000008', email: 'zhao@ex.com',  quarterScore: 97, yearScore: 95, remark: '内部备注H' },
];

const svc = buildMock('feature-multiheader', seed);

export const GetList   = (query: any)                => svc.GetList(query);
export const AddObj    = (form: Record<string, any>) => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => svc.UpdateObj(form);
export const DelObj    = (id: any)                   => svc.DelObj(id);
