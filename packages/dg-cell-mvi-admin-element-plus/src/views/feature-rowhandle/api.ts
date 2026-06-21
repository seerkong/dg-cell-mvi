/**
 * dg-cell-mvi-admin-element-plus · views/feature-rowhandle/api — rowHandle dropdown/group + dict demo CRUD.
 *
 * Plain employee rows with a `status` code. The demo's points are the rowHandle layout knobs
 * (dropdown overflow + button group) and the dict knobs (labelBuilder + onReady) on the status column.
 * `getStatusDict` is async so the dict's `onReady` fires once the data resolves at the effect boundary.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, name: '张伟', dept: '研发部', status: 1 },
  { id: 2, name: '王芳', dept: '市场部', status: 0 },
  { id: 3, name: '李娜', dept: '研发部', status: 2 },
  { id: 4, name: '刘洋', dept: '财务部', status: 1 },
  { id: 5, name: '陈静', dept: '人事部', status: 0 },
  { id: 6, name: '杨磊', dept: '市场部', status: 2 },
];

const svc = buildMock('feature-rowhandle', seed);

export const GetList = (query: any) => svc.GetList(query);
export const AddObj = (form: Record<string, any>) => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => svc.UpdateObj(form);
export const DelObj = (id: any) => svc.DelObj(id);

/** async status dict so the dict's onReady fires once the data resolves (mirrors a remote getData). */
export const getStatusDict = (): Promise<{ value: number; label: string }[]> =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve([
          { value: 1, label: '在职' },
          { value: 0, label: '离职' },
          { value: 2, label: '试用' },
        ]),
      120,
    ),
  );
