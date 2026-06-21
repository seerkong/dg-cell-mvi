import type { OrdersRepoFactoryEffect } from './orders.repo';
import { queryOrders } from './mock-admin.effects';

export const createMockOrdersRepo: OrdersRepoFactoryEffect = (_runtime, _input, _config) => {
  return {
    query: queryOrders,
    async getById(runtime, input, config) {
      const result = await queryOrders(runtime, { page: 1, pageSize: 100 }, config);
      return result.rows.find((row) => row.id === input.id) ?? null;
    },
  };
};
