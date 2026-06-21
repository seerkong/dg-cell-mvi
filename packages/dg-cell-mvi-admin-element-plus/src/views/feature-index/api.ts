/**
 * dg-cell-mvi-admin-element-plus · views/feature-index/api — row-number (序号) column demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   dept: '技术部',   city: '北京' },
  { id: 2,  name: '王芳',   dept: '产品部',   city: '上海' },
  { id: 3,  name: '李娜',   dept: '设计部',   city: '广州' },
  { id: 4,  name: '刘洋',   dept: '运营部',   city: '深圳' },
  { id: 5,  name: '陈静',   dept: '市场部',   city: '杭州' },
  { id: 6,  name: '杨磊',   dept: '技术部',   city: '成都' },
  { id: 7,  name: '赵敏',   dept: '人事部',   city: '武汉' },
  { id: 8,  name: '黄勇',   dept: '财务部',   city: '南京' },
  { id: 9,  name: '周燕',   dept: '产品部',   city: '西安' },
  { id: 10, name: '吴杰',   dept: '技术部',   city: '北京' },
  { id: 11, name: '徐丽',   dept: '设计部',   city: '上海' },
  { id: 12, name: '孙浩',   dept: '运营部',   city: '广州' },
  { id: 13, name: '马玲',   dept: '市场部',   city: '深圳' },
  { id: 14, name: '朱强',   dept: '技术部',   city: '杭州' },
  { id: 15, name: '胡雪',   dept: '人事部',   city: '成都' },
  { id: 16, name: '郭凯',   dept: '财务部',   city: '武汉' },
  { id: 17, name: '何梅',   dept: '产品部',   city: '南京' },
  { id: 18, name: '高峰',   dept: '技术部',   city: '西安' },
  { id: 19, name: '林红',   dept: '设计部',   city: '北京' },
  { id: 20, name: '罗刚',   dept: '运营部',   city: '上海' },
  { id: 21, name: '宋倩',   dept: '市场部',   city: '广州' },
  { id: 22, name: '谢鹏',   dept: '技术部',   city: '深圳' },
  { id: 23, name: '韩雨',   dept: '人事部',   city: '杭州' },
  { id: 24, name: '唐军',   dept: '财务部',   city: '成都' },
  { id: 25, name: '曹晨',   dept: '产品部',   city: '武汉' },
];

const svc = buildMock('feature-index', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
