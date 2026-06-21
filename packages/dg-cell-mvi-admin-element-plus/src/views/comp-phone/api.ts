/**
 * dg-cell-mvi-admin-element-plus · views/comp-phone/api — PhoneInput component demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   phone: '+86 13800138001' },
  { id: 2,  name: '王芳',   phone: '+86 13900139002' },
  { id: 3,  name: '李娜',   phone: '+1 4155552671' },
  { id: 4,  name: '刘洋',   phone: '+86 13700137004' },
  { id: 5,  name: '陈静',   phone: '+44 7700900005' },
  { id: 6,  name: '杨磊',   phone: '+86 13600136006' },
  { id: 7,  name: '赵敏',   phone: '+81 9012345607' },
  { id: 8,  name: '黄勇',   phone: '+86 13500135008' },
  { id: 9,  name: '周婷',   phone: '+49 15901590009' },
  { id: 10, name: '吴刚',   phone: '+86 13400134010' },
  { id: 11, name: '徐丽',   phone: '+86 13300133011' },
  { id: 12, name: '孙浩',   phone: '+1 2125550012' },
];

const mock = buildMock('comp-phone', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
