/**
 * dg-cell-mvi-admin-element-plus · views/feature-selection/api — selection demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   role: '管理员',   email: 'zhangwei@example.com' },
  { id: 2,  name: '王芳',   role: '编辑',     email: 'wangfang@example.com' },
  { id: 3,  name: '李娜',   role: '查看者',   email: 'lina@example.com' },
  { id: 4,  name: '刘洋',   role: '管理员',   email: 'liuyang@example.com' },
  { id: 5,  name: '陈静',   role: '编辑',     email: 'chenjing@example.com' },
  { id: 6,  name: '杨磊',   role: '查看者',   email: 'yanglei@example.com' },
  { id: 7,  name: '黄敏',   role: '编辑',     email: 'huangmin@example.com' },
  { id: 8,  name: '赵雷',   role: '管理员',   email: 'zhaolei@example.com' },
  { id: 9,  name: '周琳',   role: '查看者',   email: 'zhoulin@example.com' },
  { id: 10, name: '吴刚',   role: '编辑',     email: 'wugang@example.com' },
  { id: 11, name: '徐梅',   role: '查看者',   email: 'xumei@example.com' },
  { id: 12, name: '孙强',   role: '管理员',   email: 'sunqiang@example.com' },
  { id: 13, name: '马丽',   role: '编辑',     email: 'mali@example.com' },
  { id: 14, name: '朱浩',   role: '查看者',   email: 'zhuhao@example.com' },
  { id: 15, name: '胡燕',   role: '管理员',   email: 'huyan@example.com' },
];

const svc = buildMock('feature-selection', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
