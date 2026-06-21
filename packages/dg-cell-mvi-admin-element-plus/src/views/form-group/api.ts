/**
 * dg-cell-mvi-admin-element-plus · views/form-group/api — form group layout demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   phone: '13800001111', email: 'zhangwei@example.com',   company: '阿里巴巴集团',   address: '浙江省杭州市余杭区文一西路969号',   remark: '核心用户' },
  { id: 2,  name: '李娜',   phone: '13900002222', email: 'lina@example.com',        company: '腾讯科技',       address: '广东省深圳市南山区高新科技园',       remark: '' },
  { id: 3,  name: '王芳',   phone: '13700003333', email: 'wangfang@example.com',    company: '字节跳动',       address: '北京市海淀区知春路甲48号',           remark: 'VIP客户' },
  { id: 4,  name: '刘洋',   phone: '13600004444', email: 'liuyang@example.com',     company: '百度在线',       address: '北京市海淀区上地十街10号',           remark: '' },
  { id: 5,  name: '陈静',   phone: '13500005555', email: 'chenjing@example.com',    company: '京东集团',       address: '北京市大兴区科创十一街18号院',       remark: '重要合作商' },
  { id: 6,  name: '杨帆',   phone: '13400006666', email: 'yangfan@example.com',     company: '网易有道',       address: '广州市天河区珠江新城华强路1号',     remark: '' },
  { id: 7,  name: '赵雷',   phone: '13300007777', email: 'zhaolei@example.com',     company: '小米科技',       address: '北京市海淀区清河中街68号',           remark: '待跟进' },
  { id: 8,  name: '周婷',   phone: '13200008888', email: 'zhoting@example.com',     company: '美团外卖',       address: '北京市朝阳区望京东路4号院',         remark: '' },
  { id: 9,  name: '孙磊',   phone: '13100009999', email: 'sunlei@example.com',      company: '滴滴出行',       address: '北京市朝阳区东方路11号',             remark: '高价值客户' },
  { id: 10, name: '吴丽',   phone: '13000010000', email: 'wuli@example.com',        company: '拼多多',         address: '上海市长宁区金钟路968号凌空SOHO',   remark: '' },
];

const mock = buildMock('form-group', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
