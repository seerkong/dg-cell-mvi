/**
 * dg-cell-mvi-admin-element-plus · views/form-group-tabs/api — form group-tabs demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张三',   phone: '13800001001', email: 'zhangsan@example.com',  company: '阿里巴巴',   address: '浙江省杭州市西湖区文三路 1号',      remark: '重点客户' },
  { id: 2,  name: '李四',   phone: '13800001002', email: 'lisi@example.com',      company: '腾讯科技',   address: '广东省深圳市南山区科技园南路',        remark: '' },
  { id: 3,  name: '王五',   phone: '13800001003', email: 'wangwu@example.com',    company: '百度在线',   address: '北京市海淀区上地十街10号',            remark: '待跟进' },
  { id: 4,  name: '赵六',   phone: '13800001004', email: 'zhaoliu@example.com',   company: '字节跳动',   address: '北京市朝阳区酒仙桥路20号楼',          remark: '' },
  { id: 5,  name: '孙七',   phone: '13800001005', email: 'sunqi@example.com',     company: '美团点评',   address: '北京市朝阳区望京东路4号院',           remark: '合作意向强' },
  { id: 6,  name: '周八',   phone: '13800001006', email: 'zhouba@example.com',    company: '京东集团',   address: '北京市大兴区科创十一街18号院',         remark: '' },
  { id: 7,  name: '吴九',   phone: '13800001007', email: 'wujiu@example.com',     company: '网易互动',   address: '广州市天河区科技园珠江西路10号',       remark: '已签合同' },
  { id: 8,  name: '郑十',   phone: '13800001008', email: 'zhengshi@example.com',  company: '滴滴出行',   address: '北京市朝阳区望京SOHO T3',             remark: '' },
  { id: 9,  name: '陈十一', phone: '13800001009', email: 'chenone@example.com',   company: '小米科技',   address: '北京市海淀区清河中街68号',             remark: '优质供应商' },
  { id: 10, name: '林十二', phone: '13800001010', email: 'lintwo@example.com',    company: '华为技术',   address: '广东省深圳市龙岗区坂田华为基地',       remark: '' },
];

const mock = buildMock('form-group-tabs', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
