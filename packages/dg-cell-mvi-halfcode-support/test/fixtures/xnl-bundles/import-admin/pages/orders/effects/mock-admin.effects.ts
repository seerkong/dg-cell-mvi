import type { OrdersQueryEffect } from './orders.effects';

const orders = [
  { id: 'o1', customer: 'Ada', status: 'paid' },
  { id: 'o2', customer: 'Grace', status: 'pending' },
  { id: 'o3', customer: 'Alan', status: 'paid' },
];

export const queryOrders: OrdersQueryEffect = async (_runtime, input, config) => {
  const keyword = input.keyword?.toLowerCase() ?? '';
  const filtered = orders.filter((order) => {
    const statusMatches = config.defaultStatus ? order.status === config.defaultStatus : true;
    return statusMatches && order.customer.toLowerCase().includes(keyword);
  });
  const start = (input.page - 1) * input.pageSize;
  return { rows: filtered.slice(start, start + input.pageSize), total: filtered.length };
};
