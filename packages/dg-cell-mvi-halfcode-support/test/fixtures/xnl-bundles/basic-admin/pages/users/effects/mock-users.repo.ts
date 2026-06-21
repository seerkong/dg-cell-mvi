import type { UsersRepoFactoryEffect } from './users.repo';
import { queryUsers } from './mock-admin.effects';

export const createMockUsersRepo: UsersRepoFactoryEffect = (_runtime, _input, _config) => {
  return {
    query: queryUsers,
    async getById(runtime, input, config) {
      const result = await queryUsers(runtime, { page: 1, pageSize: 100 }, config);
      return result.rows.find((row) => row.id === input.id) ?? null;
    },
  };
};
