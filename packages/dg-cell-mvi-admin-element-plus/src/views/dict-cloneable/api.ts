/**
 * dg-cell-mvi-admin-element-plus · views/dict-cloneable/api — dict cloneable demo CRUD.
 *
 * Two select columns (role / backupRole) each get their OWN inline dict with no shared id,
 * so each column independently loads and owns its dict state. getRoleDict() increments a
 * global counter so we can verify it is called once per column (2 total), not shared.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张三',   role: 'admin',  backupRole: 'editor' },
  { id: 2,  name: '李四',   role: 'editor', backupRole: 'viewer' },
  { id: 3,  name: '王五',   role: 'viewer', backupRole: 'admin'  },
  { id: 4,  name: '赵六',   role: 'admin',  backupRole: 'viewer' },
  { id: 5,  name: '陈七',   role: 'editor', backupRole: 'editor' },
  { id: 6,  name: '刘八',   role: 'viewer', backupRole: 'admin'  },
  { id: 7,  name: '孙九',   role: 'admin',  backupRole: 'editor' },
  { id: 8,  name: '周十',   role: 'editor', backupRole: 'viewer' },
  { id: 9,  name: '吴十一', role: 'viewer', backupRole: 'admin'  },
  { id: 10, name: '郑十二', role: 'admin',  backupRole: 'editor' },
  { id: 11, name: '冯十三', role: 'editor', backupRole: 'viewer' },
  { id: 12, name: '褚十四', role: 'viewer', backupRole: 'admin'  },
];

const mock = buildMock('dict-cloneable', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);

export async function getRoleDict(): Promise<{ value: string; label: string }[]> {
  (globalThis as any).__cloneableLoads = ((globalThis as any).__cloneableLoads || 0) + 1;
  return new Promise<{ value: string; label: string }[]>((r) =>
    setTimeout(
      () =>
        r([
          { value: 'admin',  label: '管理员' },
          { value: 'editor', label: '编辑者' },
          { value: 'viewer', label: '查看者' },
        ]),
      120,
    ),
  );
}
