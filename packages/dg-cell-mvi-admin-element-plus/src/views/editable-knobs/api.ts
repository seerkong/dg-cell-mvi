/** editable-knobs demo · api — in-memory mock (employees) behind the limit/offset contract. */
import { buildMock } from '../../api/mockService';

const STATUS = ['active', 'leave', 'probation'];
const DEPT = ['研发', '市场', '运营'];
const seed = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  code: `EMP-${String(i + 1).padStart(3, '0')}`,
  name: `员工${i + 1}`,
  age: 20 + (i % 15),
  status: STATUS[i % 3],
  dept: DEPT[i % 3],
}));

const svc = buildMock('editable-knobs', seed);
export const GetList = svc.GetList;
export const AddObj = svc.AddObj;
export const UpdateObj = svc.UpdateObj;
export const DelObj = svc.DelObj;
