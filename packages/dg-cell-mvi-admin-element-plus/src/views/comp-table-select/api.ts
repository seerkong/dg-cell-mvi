/**
 * dg-cell-mvi-admin-element-plus · views/comp-table-select/api — TableSelect component demo CRUD.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  title: '用户权限评审',   owner: '张伟' },
  { id: 2,  title: '前端组件重构',   owner: '李芳' },
  { id: 3,  title: '数据库性能优化', owner: '王磊' },
  { id: 4,  title: '登录安全加固',   owner: '赵静' },
  { id: 5,  title: '报表导出功能',   owner: '刘洋' },
  { id: 6,  title: '消息推送服务',   owner: '张伟' },
  { id: 7,  title: '缓存层设计',     owner: '李芳' },
  { id: 8,  title: '多租户隔离',     owner: '王磊' },
  { id: 9,  title: '接口文档整理',   owner: '赵静' },
  { id: 10, title: '自动化部署流水线', owner: '刘洋' },
  { id: 11, title: '移动端适配',     owner: '张伟' },
  { id: 12, title: '国际化支持',     owner: '李芳' },
];

const mock = buildMock('comp-table-select', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);

export const USERS = [
  { id: 1001, name: '张伟', dept: '研发' },
  { id: 1002, name: '李芳', dept: '市场' },
  { id: 1003, name: '王磊', dept: '运营' },
  { id: 1004, name: '赵静', dept: '研发' },
  { id: 1005, name: '刘洋', dept: '财务' },
];
