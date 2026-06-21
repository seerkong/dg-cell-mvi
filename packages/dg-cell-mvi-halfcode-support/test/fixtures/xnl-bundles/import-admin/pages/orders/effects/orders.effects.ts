export interface OrderRow {
  id: string;
  customer: string;
  status: string;
}

export interface OrdersQueryRuntime {
  now(): Date;
}

export interface OrdersQueryInput {
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface OrdersQueryConfig {
  defaultStatus?: string;
}

export interface OrdersQueryOutput {
  rows: OrderRow[];
  total: number;
}

export type OrdersQueryEffect = (
  runtime: OrdersQueryRuntime,
  input: OrdersQueryInput,
  config: OrdersQueryConfig,
) => Promise<OrdersQueryOutput>;
