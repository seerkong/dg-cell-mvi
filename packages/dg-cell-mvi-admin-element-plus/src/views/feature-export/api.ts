/**
 * dg-cell-mvi-admin-element-plus · views/feature-export/api — CSV export demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   age: 28, email: 'zhangwei@example.com',   city: '北京' },
  { id: 2,  name: '李娜',   age: 32, email: 'lina@example.com',       city: '上海' },
  { id: 3,  name: '王芳',   age: 25, email: 'wangfang@example.com',   city: '广州' },
  { id: 4,  name: '刘洋',   age: 35, email: 'liuyang@example.com',    city: '深圳' },
  { id: 5,  name: '陈静',   age: 29, email: 'chenjing@example.com',   city: '成都' },
  { id: 6,  name: '杨阳',   age: 31, email: 'yangyang@example.com',   city: '杭州' },
  { id: 7,  name: '赵磊',   age: 27, email: 'zhaolei@example.com',    city: '武汉' },
  { id: 8,  name: '黄丽',   age: 33, email: 'huangli@example.com',    city: '南京' },
  { id: 9,  name: '周强',   age: 26, email: 'zhouqiang@example.com',  city: '西安' },
  { id: 10, name: '吴敏',   age: 30, email: 'wumin@example.com',      city: '天津' },
  { id: 11, name: '徐帅',   age: 24, email: 'xushuai@example.com',    city: '重庆' },
  { id: 12, name: '孙梅',   age: 38, email: 'sunmei@example.com',     city: '苏州' },
  { id: 13, name: '马超',   age: 22, email: 'machao@example.com',     city: '郑州' },
  { id: 14, name: '胡雪',   age: 36, email: 'huxue@example.com',      city: '青岛' },
  { id: 15, name: '朱刚',   age: 41, email: 'zhugang@example.com',    city: '长沙' },
];

const mock = buildMock('feature-export', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
