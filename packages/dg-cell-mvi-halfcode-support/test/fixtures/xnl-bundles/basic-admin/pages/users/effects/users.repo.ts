import type { UserRow, UsersQueryConfig, UsersQueryInput, UsersQueryOutput, UsersQueryRuntime } from './users.effects';

export type UsersRepoFactoryEffect = (
  runtime: UsersQueryRuntime,
  input: Record<string, never>,
  config: Record<string, never>,
) => UsersRepoEffects;

export interface UsersRepoEffects {
  query(
    runtime: UsersQueryRuntime,
    input: UsersQueryInput,
    config: UsersQueryConfig,
  ): Promise<UsersQueryOutput>;

  getById(
    runtime: UsersQueryRuntime,
    input: { id: string },
    config: Record<string, never>,
  ): Promise<UserRow | null>;
}
