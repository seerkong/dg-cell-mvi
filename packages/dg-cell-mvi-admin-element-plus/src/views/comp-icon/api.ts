/**
 * dg-cell-mvi-admin-element-plus · views/comp-icon/api — IconPicker component demo CRUD over the in-memory mock.
 * Each menu row stores an Element Plus icon NAME (string) in `icon`.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '首页', icon: 'House' },
  { id: 2, name: '用户管理', icon: 'User' },
  { id: 3, name: '系统设置', icon: 'Setting' },
  { id: 4, name: '消息中心', icon: 'Bell' },
  { id: 5, name: '文件管理', icon: 'Folder' },
  { id: 6, name: '数据统计', icon: 'TrendCharts' },
  { id: 7, name: '商品', icon: 'Goods' },
  { id: 8, name: '订单', icon: 'Document' },
  { id: 9, name: '收藏', icon: 'Star' },
  { id: 10, name: '回收站', icon: 'Delete' },
  { id: 11, name: '搜索', icon: 'Search' },
  { id: 12, name: '工具', icon: 'Tools' },
];

const mock = buildMock('comp-icon', seed);

export const GetList   = (query: any)                    => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => mock.UpdateObj(form);
export const DelObj    = (id: any)                       => mock.DelObj(id);
