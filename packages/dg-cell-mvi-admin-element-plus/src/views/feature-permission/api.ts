/**
 * dg-cell-mvi-admin-element-plus · views/feature-permission/api — permission-filter demo CRUD over the mock.
 *
 * Plain employee rows; the demo's point is the INJECTED `permission` predicate dropping action
 * buttons (delete rowHandle button + export toolbar button) by their `permission` code.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张伟', dept: '研发部' },
  { id: 2, name: '王芳', dept: '市场部' },
  { id: 3, name: '李娜', dept: '研发部' },
  { id: 4, name: '刘洋', dept: '财务部' },
  { id: 5, name: '陈静', dept: '人事部' },
];

const svc = buildMock('feature-permission', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
