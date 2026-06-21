import { queryReports } from './mock-admin.effects';
import { createMockReportsRepo } from './mock-reports.repo';

export const adminEffectImpls = {
  'reports.query': queryReports,
  'reports.repo': createMockReportsRepo,
};
