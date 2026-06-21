/**
 * dg-cell-mvi-admin-element-plus · views/role/api — role CRUD endpoints over the in-memory mock.
 *
 * `pageRequest` receives the *transformed* query ({page:{limit,offset}, query, sort}) produced by
 * commonCrudOptions.transformQuery, which is exactly buildMock's GetList request shape. The raw
 * GetList res ({records,total,limit,offset}) is handed back untransformed — transformRes maps it.
 */
import { buildMock } from '../../api/mockService';

// a small rotation of pre-granted permission-code sets so the `permissions` assignment field (T5.3) has
// visible initial data per role — editing a role shows these checked, and re-saving persists the change.
const SEED_PERMISSION_SETS: string[][] = [
  ['user:view', 'user:add', 'user:edit', 'user:remove', 'role:view', 'role:add', 'role:edit', 'role:delete', 'system:admin'], // 全权
  ['user:view', 'user:add', 'user:edit', 'role:view'], // 业务管理
  ['user:view', 'role:view'], // 只读
];

const seed = Array.from({ length: 43 }, (_, i) => ({
  id: i + 1,
  name: '角色' + (i + 1),
  code: 'ROLE_' + String(i + 1).padStart(3, '0'),
  // the assigned permission codes (the role↔permission assignment fact this page edits). string[].
  permissions: SEED_PERMISSION_SETS[i % SEED_PERMISSION_SETS.length],
  remark: i % 2 === 0 ? '系统内置角色' : '业务自定义角色',
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 09:00:00',
}));

const mock = buildMock('role', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
