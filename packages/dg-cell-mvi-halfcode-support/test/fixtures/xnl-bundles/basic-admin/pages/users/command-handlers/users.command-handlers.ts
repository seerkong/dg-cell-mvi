interface UsersEffectRuntime {
  callEffect<TOutput>(name: string, input: unknown, config?: unknown): Promise<TOutput> | TOutput;
  fixtures?: Record<string, unknown>;
}

interface UsersQueryInput {
  elementId?: string;
  value?: unknown;
  keyword?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

interface UsersQueryOutput {
  rows: unknown[];
  total: number;
}

export async function searchUsers(runtime: UsersEffectRuntime, input: UsersQueryInput, config: unknown) {
  const records = runtime.fixtures;
  const previous = (records?.['users-query'] as Record<string, unknown> | undefined) ?? {};
  const query = {
    keyword: input.keyword !== undefined
      ? String(input.keyword)
      : input.elementId === 'keyword-input'
      ? String(input.value ?? '')
      : String(previous.keyword ?? ''),
    status: input.status !== undefined
      ? String(input.status)
      : input.elementId === 'status-select'
      ? String(input.value ?? '')
      : String(previous.status ?? ''),
    page: typeof input.page === 'number' ? input.page : 1,
    pageSize: typeof input.pageSize === 'number' ? input.pageSize : 20,
  };
  const output = await runtime.callEffect<UsersQueryOutput>('users.query', query, {
    ...(config && typeof config === 'object' ? config : {}),
    ...(query.status ? { defaultStatus: query.status } : {}),
  });
  if (records) {
    records['users-query'] = query;
    records['users-table'] = output.rows;
  }
  return output;
}
