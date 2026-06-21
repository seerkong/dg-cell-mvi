import { buildMock } from '../../api/mockService';

const depts = ['技术部', '产品部', '运营部', '市场部', '人事部'];
const titles = ['工程师', '高级工程师', '主任', '经理', '总监'];

const seed = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  name: ['张伟', '王芳', '李娜', '赵磊', '陈静', '刘洋', '杨帆', '黄敏', '周强', '吴雪', '徐明', '孙丽', '马超', '林涛', '何燕'][i],
  phone: '138' + String(10000000 + i * 1111111).slice(0, 8),
  email: ['zhangwei', 'wangfang', 'lina', 'zhaolei', 'chenjing', 'liuyang', 'yangfan', 'huangmin', 'zhouqiang', 'wuxue', 'xuming', 'sunli', 'machao', 'lintao', 'heyan'][i] + '@example.com',
  dept: depts[i % depts.length],
  title: titles[i % titles.length],
  remark: i % 3 === 0 ? '核心员工，表现优秀' : i % 3 === 1 ? '新入职员工' : '',
}));

const mock = buildMock('form-grid', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
