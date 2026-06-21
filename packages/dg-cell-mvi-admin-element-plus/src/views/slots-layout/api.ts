/**
 * dg-cell-mvi-admin-element-plus · views/slots-layout/api — slots layout demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   score: 85 },
  { id: 2,  name: '王芳',   score: 92 },
  { id: 3,  name: '李娜',   score: 67 },
  { id: 4,  name: '刘洋',   score: 78 },
  { id: 5,  name: '陈静',   score: 55 },
  { id: 6,  name: '杨勇',   score: 100 },
  { id: 7,  name: '赵敏',   score: 43 },
  { id: 8,  name: '周磊',   score: 88 },
  { id: 9,  name: '吴霞',   score: 72 },
  { id: 10, name: '郑浩',   score: 61 },
];

const mock = buildMock('slots-layout', seed);

export const GetList   = (query: any)                    => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => mock.UpdateObj(form);
export const DelObj    = (id: any)                       => mock.DelObj(id);
