/**
 * dg-cell-mvi-admin-element-plus · views/comp-json/api — JsonEditor component demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '用户服务',   config: JSON.stringify({ enabled: true,  retries: 3, timeout: 5000 }) },
  { id: 2,  name: '订单服务',   config: JSON.stringify({ enabled: false, retries: 1, timeout: 3000 }) },
  { id: 3,  name: '支付网关',   config: JSON.stringify({ enabled: true,  retries: 5, timeout: 8000, secret: 'tok_xxx' }) },
  { id: 4,  name: '消息队列',   config: JSON.stringify({ enabled: true,  retries: 0, batchSize: 100 }) },
  { id: 5,  name: '文件存储',   config: JSON.stringify({ enabled: true,  retries: 2, maxSizeMB: 50 }) },
  { id: 6,  name: '缓存服务',   config: JSON.stringify({ enabled: false, retries: 3, ttl: 300 }) },
  { id: 7,  name: '搜索引擎',   config: JSON.stringify({ enabled: true,  retries: 2, indexName: 'prod' }) },
  { id: 8,  name: '邮件发送',   config: JSON.stringify({ enabled: true,  retries: 4, smtp: 'mail.example.com' }) },
  { id: 9,  name: '短信通道',   config: JSON.stringify({ enabled: false, retries: 1, provider: 'aliyun' }) },
  { id: 10, name: '日志采集',   config: JSON.stringify({ enabled: true,  retries: 0, level: 'info' }) },
  { id: 11, name: '监控告警',   config: JSON.stringify({ enabled: true,  retries: 2, interval: 60 }) },
  { id: 12, name: '定时任务',   config: JSON.stringify({ enabled: false, retries: 3, cron: '0 0 * * *' }) },
];

const mock = buildMock('comp-json', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
