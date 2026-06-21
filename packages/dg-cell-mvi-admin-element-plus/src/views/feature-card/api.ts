/**
 * dg-cell-mvi-admin-element-plus · views/feature-card/api — card-layout (table.mode='card') demo CRUD.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟', dept: '技术部', city: '北京', status: 'active',   score: 92 },
  { id: 2,  name: '王芳', dept: '产品部', city: '上海', status: 'pending',  score: 78 },
  { id: 3,  name: '李娜', dept: '设计部', city: '广州', status: 'disabled', score: 64 },
  { id: 4,  name: '刘洋', dept: '运营部', city: '深圳', status: 'active',   score: 85 },
  { id: 5,  name: '陈静', dept: '市场部', city: '杭州', status: 'active',   score: 70 },
  { id: 6,  name: '杨磊', dept: '技术部', city: '成都', status: 'pending',  score: 88 },
  { id: 7,  name: '赵敏', dept: '人事部', city: '武汉', status: 'active',   score: 95 },
  { id: 8,  name: '黄勇', dept: '财务部', city: '南京', status: 'disabled', score: 51 },
  { id: 9,  name: '周燕', dept: '产品部', city: '西安', status: 'active',   score: 82 },
  { id: 10, name: '吴杰', dept: '技术部', city: '北京', status: 'pending',  score: 76 },
  { id: 11, name: '徐丽', dept: '设计部', city: '上海', status: 'active',   score: 90 },
  { id: 12, name: '孙浩', dept: '运营部', city: '广州', status: 'active',   score: 67 },
];

const svc = buildMock('feature-card', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
