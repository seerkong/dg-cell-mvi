export async function searchOrders(runtime, input, config) {
  const query =
    runtime?.scope?.effect?.('orders.query') ??
    runtime?.scope?.effects?.['orders.query'] ??
    runtime?.effects?.['orders.query'];
  return query?.(runtime, input, config);
}
