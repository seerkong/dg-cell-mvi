/**
 * dg-cell-mvi-admin-element-plus · views/nest-api — MULTI-API nested CRUD (master-detail).
 * Orders and order-items are SEPARATE resources with their OWN apis; items are scoped by orderId.
 */
import { buildMock } from '../../api/mockService';

const orderSeed = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  orderNo: 'PO-' + String(1001 + i),
  customer: ['甲公司', '乙公司', '丙公司'][i % 3],
  status: i % 2 === 0 ? '已付款' : '待付款',
  createTime: '2026-06-' + String((i % 28) + 1).padStart(2, '0') + ' 08:00:00',
}));
const orderMock = buildMock('order', orderSeed);

const PRODUCTS = ['键盘', '鼠标', '显示器', '主机', '耳机'];
const itemSeed: any[] = [];
let itemId = 0;
for (let o = 1; o <= 12; o++) {
  const n = (o % 3) + 1;
  for (let k = 0; k < n; k++) {
    itemSeed.push({
      id: ++itemId,
      orderId: o,
      product: PRODUCTS[(o + k) % PRODUCTS.length],
      qty: (k + 1) * 2,
      price: 100 + k * 50,
    });
  }
}
const itemMock = buildMock('orderItem', itemSeed);

export const OrderApi = {
  GetList: (q: any) => orderMock.GetList(q),
  AddObj: (f: any) => orderMock.AddObj(f),
  UpdateObj: (f: any) => orderMock.UpdateObj(f),
  DelObj: (id: any) => orderMock.DelObj(id),
};

export const ItemApi = {
  // inject the parent orderId into the query so the mock filters by it (its own api).
  GetList: (orderId: number | null, q: any) =>
    itemMock.GetList({ ...q, query: { ...(q?.query || {}), orderId } }),
  AddObj: (f: any) => itemMock.AddObj(f),
  UpdateObj: (f: any) => itemMock.UpdateObj(f),
  DelObj: (id: any) => itemMock.DelObj(id),
};
