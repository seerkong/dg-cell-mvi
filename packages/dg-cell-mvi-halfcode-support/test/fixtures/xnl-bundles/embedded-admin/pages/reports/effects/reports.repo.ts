import type { ReportRow, ReportsQueryConfig, ReportsQueryInput, ReportsQueryOutput, ReportsQueryRuntime } from './reports.effects';

export type ReportsRepoFactoryEffect = (
  runtime: ReportsQueryRuntime,
  input: Record<string, never>,
  config: Record<string, never>,
) => ReportsRepoEffects;

export interface ReportsRepoEffects {
  query(
    runtime: ReportsQueryRuntime,
    input: ReportsQueryInput,
    config: ReportsQueryConfig,
  ): Promise<ReportsQueryOutput>;

  getById(
    runtime: ReportsQueryRuntime,
    input: { id: string },
    config: Record<string, never>,
  ): Promise<ReportRow | null>;
}
