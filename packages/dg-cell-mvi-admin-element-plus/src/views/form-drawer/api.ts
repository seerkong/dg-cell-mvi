/**
 * dg-cell-mvi-admin-element-plus · views/form-drawer/api — article CRUD endpoints over the in-memory mock.
 *
 * Demonstrates the drawer form wrapper: add/edit opens as a right-side drawer instead of a dialog.
 */
import { buildMock } from '../../api/mockService';

const seed = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  title: '文章标题 ' + (i + 1),
  author: ['张三', '李四', '王五', '赵六', '钱七'][i % 5],
  status: (['published', 'draft', 'review'] as const)[i % 3],
  summary: '这是第 ' + (i + 1) + ' 篇文章的摘要，简短描述文章的主要内容。',
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 10:00:00',
}));

const mock = buildMock('form-drawer', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
