interface QueryInput {
  elementId?: string;
  value?: unknown;
}

interface UsersGraphRuntime {
  graph<T>(name: string): T | undefined;
}

interface UsersGraph {
  refs?: { inputs?: { query?: unknown } };
  graph: {
    get(ref: unknown): unknown;
    set(ref: unknown, value: unknown): void;
  };
}

export function updateUsersQuery(runtime: UsersGraphRuntime, input: QueryInput) {
  const mounted = runtime.graph<UsersGraph>('users-list');
  const queryRef = mounted?.refs?.inputs?.query;
  if (!mounted || !queryRef) throw new Error('users-list query signal is unavailable.');

  const current = mounted.graph.get(queryRef) as Record<string, unknown>;
  const patch = input.elementId === 'status-select'
    ? { status: String(input.value ?? 'all') }
    : { keyword: String(input.value ?? '') };
  const query = { ...current, ...patch };
  mounted.graph.set(queryRef, query);
  return query;
}
