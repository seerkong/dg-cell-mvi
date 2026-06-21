/**
 * dg-cell-mvi-admin-element-plus · views/feature-plugins/api — settings.plugins demo CRUD over the mock.
 *
 * Rows carry a `createdAt` field; the demo's point is a build-time plugin (settings.plugins) that
 * INJECTS the `createdAt` column (read-only) into crudOptions at normalization — the authored
 * crudOptions never declares it.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张伟', dept: '研发部', createdAt: '2024-01-12' },
  { id: 2, name: '王芳', dept: '市场部', createdAt: '2024-02-03' },
  { id: 3, name: '李娜', dept: '研发部', createdAt: '2024-03-21' },
  { id: 4, name: '刘洋', dept: '财务部', createdAt: '2024-04-08' },
  { id: 5, name: '陈静', dept: '人事部', createdAt: '2024-05-19' },
];

const svc = buildMock('feature-plugins', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
