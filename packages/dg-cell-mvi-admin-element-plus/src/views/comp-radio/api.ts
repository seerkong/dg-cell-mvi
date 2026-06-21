/**
 * dg-cell-mvi-admin-element-plus · views/comp-radio/api — radio component demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '用户管理',   status: 'enabled',  createTime: '2026-06-01 09:00:00' },
  { id: 2,  name: '角色分配',   status: 'disabled', createTime: '2026-06-02 10:30:00' },
  { id: 3,  name: '权限控制',   status: 'locked',   createTime: '2026-06-03 11:00:00' },
  { id: 4,  name: '日志审计',   status: 'enabled',  createTime: '2026-06-04 08:45:00' },
  { id: 5,  name: '数据备份',   status: 'enabled',  createTime: '2026-06-05 14:20:00' },
  { id: 6,  name: '接口监控',   status: 'disabled', createTime: '2026-06-06 16:00:00' },
  { id: 7,  name: '消息通知',   status: 'enabled',  createTime: '2026-06-07 09:15:00' },
  { id: 8,  name: '文件存储',   status: 'locked',   createTime: '2026-06-08 10:00:00' },
  { id: 9,  name: '报表导出',   status: 'enabled',  createTime: '2026-06-09 13:30:00' },
  { id: 10, name: '定时任务',   status: 'disabled', createTime: '2026-06-10 07:50:00' },
  { id: 11, name: '缓存管理',   status: 'enabled',  createTime: '2026-06-11 11:20:00' },
  { id: 12, name: '搜索服务',   status: 'locked',   createTime: '2026-06-12 15:40:00' },
  { id: 13, name: '队列服务',   status: 'enabled',  createTime: '2026-06-13 09:05:00' },
  { id: 14, name: '支付网关',   status: 'disabled', createTime: '2026-06-14 12:00:00' },
  { id: 15, name: '短信服务',   status: 'enabled',  createTime: '2026-06-15 17:30:00' },
];

const mock = buildMock('comp-radio', seed);

export const GetList  = (query: any)                    => mock.GetList(query);
export const AddObj   = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)    => mock.UpdateObj(form);
export const DelObj   = (id: any)                       => mock.DelObj(id);
