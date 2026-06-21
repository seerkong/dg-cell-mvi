/**
 * dg-cell-mvi-admin-element-plus · views/feature-tabs/api — tabs quick-filter demo CRUD over the in-memory mock.
 *
 * Rows carry a `status` field (active / pending / disabled) so the tabs bar can quick-filter the list
 * by status. The mock's per-field equality filter (matches() in api/mockService) narrows results when
 * the tab filter `{ status: <value> }` reaches it via the query.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   dept: '研发部', status: 'active' },
  { id: 2,  name: '王芳',   dept: '市场部', status: 'pending' },
  { id: 3,  name: '李娜',   dept: '研发部', status: 'disabled' },
  { id: 4,  name: '刘洋',   dept: '财务部', status: 'active' },
  { id: 5,  name: '陈静',   dept: '研发部', status: 'active' },
  { id: 6,  name: '杨磊',   dept: '市场部', status: 'pending' },
  { id: 7,  name: '黄敏',   dept: '人事部', status: 'disabled' },
  { id: 8,  name: '赵雷',   dept: '研发部', status: 'active' },
  { id: 9,  name: '周琳',   dept: '财务部', status: 'pending' },
  { id: 10, name: '吴刚',   dept: '市场部', status: 'active' },
  { id: 11, name: '徐梅',   dept: '人事部', status: 'disabled' },
  { id: 12, name: '孙强',   dept: '研发部', status: 'active' },
  { id: 13, name: '马丽',   dept: '财务部', status: 'pending' },
  { id: 14, name: '朱浩',   dept: '市场部', status: 'disabled' },
  { id: 15, name: '胡燕',   dept: '研发部', status: 'active' },
];

const svc = buildMock('feature-tabs', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
