/**
 * dg-cell-mvi-admin-element-plus · views/remove-hooks/api — remove-hook demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '商品中心', owner: '张三', locked: false, createTime: '2026-06-01 09:00:00' },
  { id: 2, name: '订单中心', owner: '李四', locked: true,  createTime: '2026-06-02 10:30:00' },
  { id: 3, name: '用户中心', owner: '王五', locked: false, createTime: '2026-06-03 11:00:00' },
  { id: 4, name: '支付中心', owner: '赵六', locked: false, createTime: '2026-06-04 08:45:00' },
  { id: 5, name: '营销中心', owner: '钱七', locked: false, createTime: '2026-06-05 14:20:00' },
  { id: 6, name: '风控中心', owner: '孙八', locked: true,  createTime: '2026-06-06 16:00:00' },
];

const mock = buildMock('remove-hooks', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
