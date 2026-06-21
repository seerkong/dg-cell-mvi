export interface UserRow {
  id: string;
  name: string;
  status: string;
}

export interface UsersQueryRuntime {
  now(): Date;
}

export interface UsersQueryInput {
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface UsersQueryConfig {
  defaultStatus?: string;
}

export interface UsersQueryOutput {
  rows: UserRow[];
  total: number;
}

export type UsersQueryEffect = (
  runtime: UsersQueryRuntime,
  input: UsersQueryInput,
  config: UsersQueryConfig,
) => Promise<UsersQueryOutput>;
