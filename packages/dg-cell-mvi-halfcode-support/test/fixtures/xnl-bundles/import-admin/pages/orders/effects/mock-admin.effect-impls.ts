import { queryOrders } from './mock-admin.effects';
import { createMockOrdersRepo } from './mock-orders.repo';

export const adminEffectImpls = {
  'orders.query': queryOrders,
  'orders.repo': createMockOrdersRepo,
};
