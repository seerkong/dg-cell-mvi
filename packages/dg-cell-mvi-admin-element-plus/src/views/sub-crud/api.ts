/**
 * sub-crud demo · api — two independent mock resources: parent orders + child order-items.
 * The child GetItems filters by `orderId` (buildMock matches query fields by equality), so each
 * expanded parent row drives its own item sub-CRUD over a separate dataset.
 */
import { buildMock } from '../../api/mockService';

const ordersSeed = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  customer: `客户${i + 1}`,
  total: (i + 1) * 100,
}));
const ordersSvc = buildMock('subcrud-orders', ordersSeed);
export const GetOrders = ordersSvc.GetList;

const itemsSeed: any[] = [];
let itemId = 0;
for (let o = 1; o <= 6; o++) {
  for (let k = 0; k < 2; k++) {
    itemId += 1;
    itemsSeed.push({ id: itemId, orderId: o, product: `商品${o}-${k + 1}`, qty: k + 1, price: (k + 1) * 50 });
  }
}
const itemsSvc = buildMock('subcrud-items', itemsSeed);
export const GetItems = itemsSvc.GetList;
export const AddItem = itemsSvc.AddObj;
export const UpdateItem = itemsSvc.UpdateObj;
export const DelItem = itemsSvc.DelObj;
