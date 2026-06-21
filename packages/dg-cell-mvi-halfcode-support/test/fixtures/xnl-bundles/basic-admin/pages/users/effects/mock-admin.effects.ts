import type { UsersQueryEffect } from './users.effects';

const users = [
  { id: 'u1', name: 'Ada Lovelace', score: 98, status: 'enabled' },
  { id: 'u2', name: 'Grace Hopper', score: 92, status: 'enabled' },
  { id: 'u3', name: 'Alan Turing', score: 89, status: 'disabled' },
];

export const queryUsers: UsersQueryEffect = async (_runtime, input, config) => {
  const keyword = input.keyword?.toLowerCase() ?? '';
  const filtered = users.filter((user) => {
    const statusMatches = config.defaultStatus ? user.status === config.defaultStatus : true;
    return statusMatches && user.name.toLowerCase().includes(keyword);
  });
  const start = (input.page - 1) * input.pageSize;
  return { rows: filtered.slice(start, start + input.pageSize), total: filtered.length };
};
