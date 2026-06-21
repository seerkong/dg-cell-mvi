/**
 * dg-cell-mvi-admin-element-plus · views/nest/api — project CRUD with a nested `members` array (virtual-model).
 * The whole project object (incl. its members array) round-trips in one add/edit request.
 */
import { buildMock } from '../../api/mockService';

const ROLES = ['fe', 'be', 'design', 'pm'];
const seed = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  name: '项目' + (i + 1),
  owner: ['张三', '李四', '王五'][i % 3],
  members: Array.from({ length: (i % 3) + 1 }, (_, j) => ({
    name: '成员' + String.fromCharCode(65 + j),
    role: ROLES[(i + j) % ROLES.length],
  })),
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 09:00:00',
}));

const mock = buildMock('project', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
