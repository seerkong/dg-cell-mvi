/**
 * dg-cell-mvi-admin-element-plus · views/comp-uploader/api — avatar image uploader demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟', avatar: '' },
  { id: 2,  name: '王芳', avatar: '' },
  { id: 3,  name: '李娜', avatar: '' },
  { id: 4,  name: '刘洋', avatar: '' },
  { id: 5,  name: '陈静', avatar: '' },
  { id: 6,  name: '杨磊', avatar: '' },
  { id: 7,  name: '赵敏', avatar: '' },
  { id: 8,  name: '黄杰', avatar: '' },
  { id: 9,  name: '周丽', avatar: '' },
  { id: 10, name: '吴刚', avatar: '' },
];

const mock = buildMock('comp-uploader', seed);

export const GetList   = (query: any)                    => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => mock.UpdateObj(form);
export const DelObj    = (id: any)                       => mock.DelObj(id);
