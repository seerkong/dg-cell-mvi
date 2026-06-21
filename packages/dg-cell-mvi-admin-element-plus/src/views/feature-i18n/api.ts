/**
 * dg-cell-mvi-admin-element-plus · views/feature-i18n/api — i18n demo CRUD over the mock.
 *
 * Plain rows; the demo's point is the INJECTED translator localizing built-in framework chrome
 * (新增/查看/编辑/删除/刷新/列设置/取消/保存 …) when the EN locale is selected.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: 'Alice', email: 'alice@acme.io' },
  { id: 2, name: 'Bob', email: 'bob@acme.io' },
  { id: 3, name: 'Carol', email: 'carol@acme.io' },
  { id: 4, name: 'Dave', email: 'dave@acme.io' },
  { id: 5, name: 'Erin', email: 'erin@acme.io' },
];

const svc = buildMock('feature-i18n', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
