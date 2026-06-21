import { queryUsers } from './mock-admin.effects';
import { createMockUsersRepo } from './mock-users.repo';

export const adminEffectImpls = {
  'users.query': queryUsers,
  'users.repo': createMockUsersRepo,
};
