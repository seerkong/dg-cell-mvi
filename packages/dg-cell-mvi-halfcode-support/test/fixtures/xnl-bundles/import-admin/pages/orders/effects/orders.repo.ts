import type { OrderRow, OrdersQueryConfig, OrdersQueryInput, OrdersQueryOutput, OrdersQueryRuntime } from './orders.effects';

export type OrdersRepoFactoryEffect = (
  runtime: OrdersQueryRuntime,
  input: Record<string, never>,
  config: Record<string, never>,
) => OrdersRepoEffects;

export interface OrdersRepoEffects {
  query(
    runtime: OrdersQueryRuntime,
    input: OrdersQueryInput,
    config: OrdersQueryConfig,
  ): Promise<OrdersQueryOutput>;

  getById(
    runtime: OrdersQueryRuntime,
    input: { id: string },
    config: Record<string, never>,
  ): Promise<OrderRow | null>;
}
