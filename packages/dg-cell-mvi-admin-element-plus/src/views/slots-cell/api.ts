/**
 * dg-cell-mvi-admin-element-plus · views/slots-cell/api — custom cell slot demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张三', status: 'active',   score: 92 },
  { id: 2,  name: '李四', status: 'banned',    score: 15 },
  { id: 3,  name: '王五', status: 'pending',   score: 47 },
  { id: 4,  name: '赵六', status: 'active',    score: 78 },
  { id: 5,  name: '陈七', status: 'active',    score: 65 },
  { id: 6,  name: '刘八', status: 'banned',    score: 8  },
  { id: 7,  name: '孙九', status: 'pending',   score: 53 },
  { id: 8,  name: '周十', status: 'active',    score: 88 },
  { id: 9,  name: '吴一', status: 'active',    score: 73 },
  { id: 10, name: '郑二', status: 'banned',    score: 22 },
  { id: 11, name: '钱三', status: 'pending',   score: 60 },
  { id: 12, name: '冯四', status: 'active',    score: 95 },
];

const mock = buildMock('slots-cell', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
