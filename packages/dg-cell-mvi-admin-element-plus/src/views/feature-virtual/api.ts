/**
 * dg-cell-mvi-admin-element-plus · views/feature-virtual/api — virtual-table (el-table-v2) demo CRUD.
 *
 * Seeds a LARGE dataset (1000 rows) so the virtual scroll is meaningful: the demo requests a big
 * pageSize so el-table-v2 receives the whole page and virtualizes the visible rows. The mock still
 * honors the limit/offset + sort contract, so server-side sort over the full set is exercised.
 */
import { buildMock } from '../../api/mockService';

const NAMES = ['张伟', '王芳', '李娜', '刘洋', '陈静', '杨磊', '赵敏', '黄勇', '周燕', '吴杰'];
const DEPTS = ['技术部', '产品部', '设计部', '运营部', '市场部', '人事部', '财务部'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安'];

/** 1000 generated rows — id / name / dept / city / age / score. */
const seed = Array.from({ length: 1000 }, (_, i) => {
  const id = i + 1;
  return {
    id,
    name: `${NAMES[i % NAMES.length]}${id}`,
    dept: DEPTS[i % DEPTS.length],
    city: CITIES[i % CITIES.length],
    age: 20 + (i % 40),
    score: (i * 7) % 100,
  };
});

const svc = buildMock('feature-virtual', seed);

export const GetList   = (query: any)                 => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)  => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => svc.UpdateObj(form);
export const DelObj    = (id: any)                    => svc.DelObj(id);
