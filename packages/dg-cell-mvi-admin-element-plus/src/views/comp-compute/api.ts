/**
 * dg-cell-mvi-admin-element-plus · views/comp-compute/api — dynamic-config (compute) demo CRUD + a mock city API.
 *
 * The CRUD list is the usual in-memory mock; `GetCities(province)` simulates an async options
 * endpoint the form's `city` field fetches via `asyncCompute({ watch: ({form}) => form.province })`.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张三', type: 'vip',    province: 'bj', city: 'cy', locked: false, secret: 'VIP-9001' },
  { id: 2, name: '李四', type: 'normal', province: 'sh', city: 'pd', locked: true,  secret: 'SEC-1002' },
  { id: 3, name: '王五', type: 'vip',    province: 'gd', city: 'gz', locked: false, secret: 'VIP-9003' },
  { id: 4, name: '赵六', type: 'normal', province: 'bj', city: 'hd', locked: false, secret: 'SEC-1004' },
  { id: 5, name: '钱七', type: 'vip',    province: 'sh', city: 'hp', locked: true,  secret: 'VIP-9005' },
  { id: 6, name: '孙八', type: 'normal', province: 'gd', city: 'sz', locked: false, secret: 'SEC-1006' },
];

const mock = buildMock('comp-compute', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);

/** Provinces (static) + cities-by-province (fetched async on the watched `province`). */
export const PROVINCES = [
  { value: 'bj', label: '北京' },
  { value: 'sh', label: '上海' },
  { value: 'gd', label: '广东' },
];

const CITIES: Record<string, Array<{ value: string; label: string }>> = {
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

/** Async options endpoint: cities for a province (200ms latency to exercise the loading window). */
export function GetCities(province: string): Promise<Array<{ value: string; label: string }>> {
  return new Promise((resolve) => setTimeout(() => resolve(CITIES[province] ?? []), 200));
}
