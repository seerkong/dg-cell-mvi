/**
 * dg-cell-mvi-admin-element-plus · views/demo/api — demo CRUD endpoints over the in-memory mock.
 *
 * Same limit/offset contract as the other pages. The seed exercises a dict-backed `category` field
 * (stored as a code, rendered via the dict in crud.tsx) and a boolean `enabled` (switch).
 */
import { buildMock } from '../../api/mockService';

const categories = ['frontend', 'backend', 'design', 'ops'];

const seed = Array.from({ length: 38 }, (_, i) => ({
  id: i + 1,
  title: '演示条目 ' + (i + 1),
  category: categories[i % categories.length],
  enabled: i % 2 === 0,
}));

const mock = buildMock('demo', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
