/**
 * dg-cell-mvi-admin-element-plus · views/comp-checkbox/api — checkbox component demo CRUD over in-memory mock.
 *
 * Each row has a `skills` field whose value is an array of strings drawn from the static
 * dict {前端, 后端, 设计, 运维}. The seed covers the main checkbox-array use-case.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   skills: ['fe', 'be'],           createTime: '2026-05-01 09:00:00' },
  { id: 2,  name: '李娜',   skills: ['design'],             createTime: '2026-05-02 09:00:00' },
  { id: 3,  name: '王芳',   skills: ['fe'],                 createTime: '2026-05-03 09:00:00' },
  { id: 4,  name: '刘洋',   skills: ['be', 'ops'],          createTime: '2026-05-04 09:00:00' },
  { id: 5,  name: '陈静',   skills: ['fe', 'design'],       createTime: '2026-05-05 09:00:00' },
  { id: 6,  name: '杨磊',   skills: ['ops'],                createTime: '2026-05-06 09:00:00' },
  { id: 7,  name: '赵敏',   skills: ['fe', 'be', 'design'], createTime: '2026-05-07 09:00:00' },
  { id: 8,  name: '孙浩',   skills: ['be'],                 createTime: '2026-05-08 09:00:00' },
  { id: 9,  name: '周婷',   skills: ['design', 'ops'],      createTime: '2026-05-09 09:00:00' },
  { id: 10, name: '吴杰',   skills: ['fe', 'ops'],          createTime: '2026-05-10 09:00:00' },
  { id: 11, name: '郑丽',   skills: ['be', 'design'],       createTime: '2026-05-11 09:00:00' },
  { id: 12, name: '冯强',   skills: ['fe'],                 createTime: '2026-05-12 09:00:00' },
  { id: 13, name: '蒋雪',   skills: ['ops'],                createTime: '2026-05-13 09:00:00' },
  { id: 14, name: '韩涛',   skills: ['fe', 'be', 'ops'],    createTime: '2026-05-14 09:00:00' },
  { id: 15, name: '唐云',   skills: ['design'],             createTime: '2026-05-15 09:00:00' },
];

const mock = buildMock('comp-checkbox', seed);

export const GetList = (query: any) => mock.GetList(query);
export const AddObj = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj = (id: any) => mock.DelObj(id);
