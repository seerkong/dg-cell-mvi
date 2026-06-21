/**
 * dg-cell-mvi-admin-element-plus · views/feature-tree/api — department tree demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  {
    id: 1,
    name: '技术中心',
    manager: '张伟',
    count: 42,
    children: [
      {
        id: 11,
        name: '前端组',
        manager: '李芳',
        count: 12,
        children: [
          { id: 111, name: 'H5小组', manager: '王磊', count: 5 },
          { id: 112, name: '移动端小组', manager: '陈晓', count: 7 },
        ],
      },
      {
        id: 12,
        name: '后端组',
        manager: '赵静',
        count: 18,
        children: [
          { id: 121, name: 'Java小组', manager: '刘洋', count: 10 },
          { id: 122, name: 'Go小组', manager: '吴强', count: 8 },
        ],
      },
      { id: 13, name: '测试组', manager: '孙丽', count: 12 },
    ],
  },
  {
    id: 2,
    name: '产品中心',
    manager: '周峰',
    count: 25,
    children: [
      {
        id: 21,
        name: '产品设计组',
        manager: '郑雪',
        count: 8,
        children: [
          { id: 211, name: 'UX小组', manager: '冯建', count: 4 },
          { id: 212, name: 'UI小组', manager: '蒋娜', count: 4 },
        ],
      },
      { id: 22, name: '产品运营组', manager: '韩宇', count: 10 },
      { id: 23, name: '数据分析组', manager: '杨帆', count: 7 },
    ],
  },
  {
    id: 3,
    name: '运营中心',
    manager: '许明',
    count: 30,
    children: [
      { id: 31, name: '市场推广组', manager: '何丽', count: 12 },
      {
        id: 32,
        name: '客户服务组',
        manager: '邓超',
        count: 10,
        children: [
          { id: 321, name: '售前支持', manager: '曹芳', count: 5 },
          { id: 322, name: '售后支持', manager: '谭浩', count: 5 },
        ],
      },
      { id: 33, name: '内容运营组', manager: '石磊', count: 8 },
    ],
  },
];

const mock = buildMock('feature-tree', seed);

export const GetList   = (query: any)                 => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)  => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)  => mock.UpdateObj(form);
export const DelObj    = (id: any)                    => mock.DelObj(id);
