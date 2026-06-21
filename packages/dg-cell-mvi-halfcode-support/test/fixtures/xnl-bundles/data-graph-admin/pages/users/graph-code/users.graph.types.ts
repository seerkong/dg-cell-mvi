import { defineGraphModule, input, internal, output, state } from 'depa-data-graph-core';

export type UserRow = {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  score: number;
};

export type UsersQuery = {
  keyword: string;
  status: 'all' | 'active' | 'inactive';
};

export type UsersSummary = {
  total: number;
  active: number;
  inactive: number;
};

export const UsersListGraphModule = defineGraphModule('users.list', {
  inputs: {
    query: input<UsersQuery>(),
  },
  state: {
    rows: state<UserRow[]>(),
  },
  outputs: {
    filteredRows: output<UserRow[]>(),
    summary: output<UsersSummary>(),
  },
  internals: {
    applyQuery: internal<unknown>(),
  },
});

export type UsersListGraphModuleType = typeof UsersListGraphModule;

export type UsersFilteredRowsLogic = (
  runtime: unknown,
  input: { rows: UserRow[]; query: UsersQuery },
  config: Record<string, unknown>,
) => UserRow[];

export type UsersSummaryLogic = (
  runtime: unknown,
  input: { rows: UserRow[] },
  config: Record<string, unknown>,
) => UsersSummary;

export type UsersApplyQueryLogic = (
  runtime: unknown,
  input: { query: UsersQuery },
  config: Record<string, unknown>,
) => UserRow[];
