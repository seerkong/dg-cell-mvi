/**
 * dg-cell-mvi-admin-element-plus · views/form-wrapper/api — form-wrapper demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '商品中心', owner: '张三', remark: '核心域', createTime: '2026-06-01 09:00:00' },
  { id: 2, name: '订单中心', owner: '李四', remark: '交易域', createTime: '2026-06-02 10:30:00' },
  { id: 3, name: '用户中心', owner: '王五', remark: '账户域', createTime: '2026-06-03 11:00:00' },
  { id: 4, name: '支付中心', owner: '赵六', remark: '资金域', createTime: '2026-06-04 08:45:00' },
  { id: 5, name: '营销中心', owner: '钱七', remark: '增长域', createTime: '2026-06-05 14:20:00' },
];

const mock = buildMock('form-wrapper', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
