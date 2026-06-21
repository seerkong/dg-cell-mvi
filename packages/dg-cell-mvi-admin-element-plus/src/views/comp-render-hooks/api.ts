/**
 * dg-cell-mvi-admin-element-plus · views/comp-render-hooks/api — render-hooks demo CRUD over the in-memory mock.
 *
 * Seed rows carry: `status` (drives the cellRender el-tag color), `salary` (the ¥…元 prefix/suffix
 * input), `type` (drives conditionalRender), and `province`/`city` (the valueChange cascade linkage).
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张三', status: 'active',   type: 'internal', salary: 18000, province: 'bj', city: 'cy' },
  { id: 2, name: '李四', status: 'pending',  type: 'external', salary: 12000, province: 'sh', city: 'pd' },
  { id: 3, name: '王五', status: 'disabled', type: 'internal', salary: 9000,  province: 'gd', city: 'gz' },
  { id: 4, name: '赵六', status: 'active',   type: 'external', salary: 15000, province: 'bj', city: 'hd' },
  { id: 5, name: '钱七', status: 'pending',  type: 'internal', salary: 22000, province: 'sh', city: 'hp' },
  { id: 6, name: '孙八', status: 'disabled', type: 'external', salary: 7000,  province: 'gd', city: 'sz' },
];

const mock = buildMock('comp-render-hooks', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);

/** 省份选项（静态）。 */
export const PROVINCES = [
  { value: 'bj', label: '北京' },
  { value: 'sh', label: '上海' },
  { value: 'gd', label: '广东' },
];

/** 城市选项按省份分组（valueChange 切换省份时清空城市并切换可选项）。 */
export const CITIES: Record<string, Array<{ value: string; label: string }>> = {
  bj: [
    { value: 'cy', label: '朝阳区' },
    { value: 'hd', label: '海淀区' },
    { value: 'dc', label: '东城区' },
  ],
  sh: [
    { value: 'pd', label: '浦东新区' },
    { value: 'hp', label: '黄浦区' },
    { value: 'xh', label: '徐汇区' },
  ],
  gd: [
    { value: 'gz', label: '广州市' },
    { value: 'sz', label: '深圳市' },
    { value: 'dg', label: '东莞市' },
  ],
};
