/**
 * dg-cell-mvi-admin-element-plus · views/form-flex/api — flex-wrap form layout demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   age: 32, email: 'zhangwei@example.com',   phone: '13800138001', city: '北京', remark: '后端开发工程师' },
  { id: 2,  name: '李芳',   age: 28, email: 'lifang@example.com',     phone: '13900139002', city: '上海', remark: '前端开发工程师' },
  { id: 3,  name: '王磊',   age: 35, email: 'wanglei@example.com',    phone: '13700137003', city: '广州', remark: '产品经理' },
  { id: 4,  name: '赵静',   age: 26, email: 'zhaojing@example.com',   phone: '13600136004', city: '深圳', remark: 'UI 设计师' },
  { id: 5,  name: '刘洋',   age: 30, email: 'liuyang@example.com',    phone: '13500135005', city: '杭州', remark: '数据分析师' },
  { id: 6,  name: '陈敏',   age: 29, email: 'chenmin@example.com',    phone: '13400134006', city: '成都', remark: '运营专员' },
  { id: 7,  name: '杨帆',   age: 33, email: 'yangfan@example.com',    phone: '13300133007', city: '武汉', remark: '测试工程师' },
  { id: 8,  name: '黄丽',   age: 27, email: 'huangli@example.com',    phone: '13200132008', city: '南京', remark: '人事专员' },
  { id: 9,  name: '周强',   age: 38, email: 'zhouqiang@example.com',  phone: '13100131009', city: '西安', remark: '技术总监' },
  { id: 10, name: '吴雪',   age: 24, email: 'wuxue@example.com',      phone: '13000130010', city: '重庆', remark: '实习生' },
];

const svc = buildMock('form-flex', seed);

export const GetList   = svc.GetList.bind(svc);
export const AddObj    = svc.AddObj.bind(svc);
export const UpdateObj = svc.UpdateObj.bind(svc);
export const DelObj    = svc.DelObj.bind(svc);
