import type { ReportsQueryEffect } from './reports.effects';

const reports = [
  { id: 'r1', title: 'Weekly Sales', period: 'week' },
  { id: 'r2', title: 'Monthly Retention', period: 'month' },
  { id: 'r3', title: 'Quarterly Margin', period: 'quarter' },
];

export const queryReports: ReportsQueryEffect = async (_runtime, input, config) => {
  const period = input.period ?? config.defaultPeriod;
  const filtered = period ? reports.filter((report) => report.period === period) : reports;
  const start = (input.page - 1) * input.pageSize;
  return { rows: filtered.slice(start, start + input.pageSize), total: filtered.length };
};
