import type { ReportsRepoFactoryEffect } from './reports.repo';
import { queryReports } from './mock-admin.effects';

export const createMockReportsRepo: ReportsRepoFactoryEffect = (_runtime, _input, _config) => {
  return {
    query: queryReports,
    async getById(runtime, input, config) {
      const result = await queryReports(runtime, { page: 1, pageSize: 100 }, config);
      return result.rows.find((row) => row.id === input.id) ?? null;
    },
  };
};
