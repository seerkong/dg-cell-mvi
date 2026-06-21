/**
 * dg-cell-mvi-admin-element-plus · views/feature-fixed/api — fixed columns demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   age: 32, gender: '男', phone: '13800138001', email: 'zhangwei@example.com',   dept: '技术部',   title: '高级工程师',   city: '北京', address: '海淀区中关村大街1号',     salary: 28000, joinDate: '2019-03-15' },
  { id: 2,  name: '李娜',   age: 28, gender: '女', phone: '13900139002', email: 'lina@example.com',       dept: '产品部',   title: '产品经理',     city: '上海', address: '浦东新区张江高科园区',   salary: 25000, joinDate: '2020-06-01' },
  { id: 3,  name: '王芳',   age: 35, gender: '女', phone: '13700137003', email: 'wangfang@example.com',   dept: '运营部',   title: '运营总监',     city: '广州', address: '天河区珠江新城花城大道',  salary: 32000, joinDate: '2018-01-20' },
  { id: 4,  name: '赵磊',   age: 27, gender: '男', phone: '13600136004', email: 'zhaolei@example.com',   dept: '技术部',   title: '前端工程师',   city: '深圳', address: '南山区科技园南路',       salary: 20000, joinDate: '2021-08-10' },
  { id: 5,  name: '陈静',   age: 31, gender: '女', phone: '13500135005', email: 'chenjing@example.com',   dept: '人事部',   title: 'HR经理',       city: '杭州', address: '西湖区文三路互联网小镇',  salary: 18000, joinDate: '2019-11-05' },
  { id: 6,  name: '刘洋',   age: 29, gender: '男', phone: '13400134006', email: 'liuyang@example.com',   dept: '销售部',   title: '销售经理',     city: '成都', address: '高新区天府软件园',       salary: 22000, joinDate: '2020-03-18' },
  { id: 7,  name: '杨明',   age: 40, gender: '男', phone: '13300133007', email: 'yangming@example.com',   dept: '财务部',   title: '财务总监',     city: '武汉', address: '洪山区光谷大道88号',     salary: 35000, joinDate: '2015-07-01' },
  { id: 8,  name: '黄丽',   age: 26, gender: '女', phone: '13200132008', email: 'huangli@example.com',   dept: '市场部',   title: '市场专员',     city: '西安', address: '雁塔区高新路50号',       salary: 12000, joinDate: '2022-04-25' },
  { id: 9,  name: '周强',   age: 38, gender: '男', phone: '13100131009', email: 'zhouqiang@example.com', dept: '技术部',   title: '架构师',       city: '南京', address: '鼓楼区湖南路1号',        salary: 40000, joinDate: '2016-09-12' },
  { id: 10, name: '吴敏',   age: 33, gender: '女', phone: '13000130010', email: 'wumin@example.com',     dept: '产品部',   title: '高级产品经理', city: '重庆', address: '渝北区互联网产业园',     salary: 27000, joinDate: '2018-12-03' },
  { id: 11, name: '徐阳',   age: 24, gender: '男', phone: '15800158011', email: 'xuyang@example.com',     dept: '技术部',   title: '实习工程师',   city: '苏州', address: '工业园区独墅湖科教创新区', salary: 8000,  joinDate: '2023-07-01' },
  { id: 12, name: '孙燕',   age: 36, gender: '女', phone: '15900159012', email: 'sunyan@example.com',     dept: '运营部',   title: '运营经理',     city: '天津', address: '滨海新区中心商务区',     salary: 21000, joinDate: '2017-05-20' },
];

const svc = buildMock('feature-fixed', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
