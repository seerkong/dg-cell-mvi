export interface ReportRow {
  id: string;
  title: string;
  period: string;
}

export interface ReportsQueryRuntime {
  now(): Date;
}

export interface ReportsQueryInput {
  period?: string;
  page: number;
  pageSize: number;
}

export interface ReportsQueryConfig {
  defaultPeriod?: string;
}

export interface ReportsQueryOutput {
  rows: ReportRow[];
  total: number;
}

export type ReportsQueryEffect = (
  runtime: ReportsQueryRuntime,
  input: ReportsQueryInput,
  config: ReportsQueryConfig,
) => Promise<ReportsQueryOutput>;
