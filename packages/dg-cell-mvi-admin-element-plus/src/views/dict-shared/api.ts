/**
 * dg-cell-mvi-admin-element-plus · views/dict-shared/api — shared dict demo.
 *
 * Two columns (status, approvalStatus) reference the same dict loaded once via getStatusDict.
 * The load counter is written to globalThis.__sharedDictLoads so the demo can show it was called once.
 */
import { buildMock } from '../../api/mockService';

const statuses: Array<'active' | 'inactive' | 'pending'> = ['active', 'inactive', 'pending'];

function pickStatus(i: number): 'active' | 'inactive' | 'pending' {
  return statuses[i % statuses.length];
}

const seed = [
  { id: 1,  name: '用户管理',   status: 'active',   approvalStatus: 'pending'  },
  { id: 2,  name: '角色分配',   status: 'inactive', approvalStatus: 'active'   },
  { id: 3,  name: '权限控制',   status: 'pending',  approvalStatus: 'inactive' },
  { id: 4,  name: '日志审计',   status: 'active',   approvalStatus: 'active'   },
  { id: 5,  name: '数据备份',   status: 'active',   approvalStatus: 'pending'  },
  { id: 6,  name: '接口监控',   status: 'inactive', approvalStatus: 'inactive' },
  { id: 7,  name: '消息通知',   status: 'active',   approvalStatus: 'pending'  },
  { id: 8,  name: '文件存储',   status: 'pending',  approvalStatus: 'active'   },
  { id: 9,  name: '报表导出',   status: 'active',   approvalStatus: 'inactive' },
  { id: 10, name: '定时任务',   status: 'inactive', approvalStatus: 'pending'  },
  { id: 11, name: '缓存管理',   status: 'active',   approvalStatus: 'active'   },
  { id: 12, name: '搜索服务',   status: 'pending',  approvalStatus: 'inactive' },
];

const mock = buildMock('dict-shared', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);

export async function getStatusDict(): Promise<Array<{ value: string; label: string }>> {
  (globalThis as any).__sharedDictLoads = ((globalThis as any).__sharedDictLoads || 0) + 1;
  return new Promise((r) =>
    setTimeout(
      () =>
        r([
          { value: 'active',   label: '启用'   },
          { value: 'inactive', label: '禁用'   },
          { value: 'pending',  label: '待审核' },
        ]),
      120,
    ),
  );
}
