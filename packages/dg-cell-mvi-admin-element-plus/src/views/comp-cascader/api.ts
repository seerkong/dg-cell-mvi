/**
 * dg-cell-mvi-admin-element-plus · views/comp-cascader/api — cascader component demo endpoints.
 *
 * Each row has a `region` field whose value is the LEAF value of a 省→市 two-level tree.
 * The dict data lives in crud.tsx (static inline), not here — this file is pure CRUD mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '张伟',   region: 'bj_chaoyang' },
  { id: 2,  name: '李娜',   region: 'bj_haidian' },
  { id: 3,  name: '王芳',   region: 'bj_dongcheng' },
  { id: 4,  name: '赵磊',   region: 'sh_huangpu' },
  { id: 5,  name: '陈静',   region: 'sh_xuhui' },
  { id: 6,  name: '刘洋',   region: 'sh_changning' },
  { id: 7,  name: '杨阳',   region: 'gz_tianhe' },
  { id: 8,  name: '黄丽',   region: 'gz_yuexiu' },
  { id: 9,  name: '周军',   region: 'gz_haizhu' },
  { id: 10, name: '吴敏',   region: 'sz_nanshan' },
  { id: 11, name: '徐超',   region: 'sz_futian' },
  { id: 12, name: '孙晶',   region: 'sz_longhua' },
  { id: 13, name: '胡蕾',   region: 'bj_shijingshan' },
  { id: 14, name: '朱鹏',   region: 'sh_jingan' },
  { id: 15, name: '高燕',   region: 'gz_baiyun' },
];

const mock = buildMock('comp-cascader', seed);

export const GetList  = (query: any)               => mock.GetList(query);
export const AddObj   = (form: Record<string, any>) => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>) => mock.UpdateObj(form);
export const DelObj   = (id: any)                  => mock.DelObj(id);
