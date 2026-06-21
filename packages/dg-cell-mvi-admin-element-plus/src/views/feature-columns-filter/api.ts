/**
 * dg-cell-mvi-admin-element-plus · views/feature-columns-filter/api — column-settings demo CRUD over the mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟', age: 32, gender: '男', phone: '13800138001', dept: '技术部', title: '高级工程师',   city: '北京', salary: 28000, joinDate: '2019-03-15' },
  { id: 2,  name: '李娜', age: 28, gender: '女', phone: '13900139002', dept: '产品部', title: '产品经理',     city: '上海', salary: 25000, joinDate: '2020-06-01' },
  { id: 3,  name: '王芳', age: 35, gender: '女', phone: '13700137003', dept: '运营部', title: '运营总监',     city: '广州', salary: 32000, joinDate: '2018-01-20' },
  { id: 4,  name: '赵磊', age: 27, gender: '男', phone: '13600136004', dept: '技术部', title: '前端工程师',   city: '深圳', salary: 20000, joinDate: '2021-08-10' },
  { id: 5,  name: '陈静', age: 31, gender: '女', phone: '13500135005', dept: '人事部', title: 'HR经理',       city: '杭州', salary: 18000, joinDate: '2019-11-05' },
  { id: 6,  name: '刘洋', age: 29, gender: '男', phone: '13400134006', dept: '销售部', title: '销售经理',     city: '成都', salary: 22000, joinDate: '2020-03-18' },
  { id: 7,  name: '杨明', age: 40, gender: '男', phone: '13300133007', dept: '财务部', title: '财务总监',     city: '武汉', salary: 35000, joinDate: '2015-07-01' },
  { id: 8,  name: '黄丽', age: 26, gender: '女', phone: '13200132008', dept: '市场部', title: '市场专员',     city: '西安', salary: 12000, joinDate: '2022-04-25' },
];

const svc = buildMock('feature-columns-filter', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
