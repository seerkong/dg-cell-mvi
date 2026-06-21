export async function searchReports(runtime, input, config) {
  const query =
    runtime?.scope?.effect?.('reports.query') ??
    runtime?.scope?.effects?.['reports.query'] ??
    runtime?.effects?.['reports.query'];
  return query?.(runtime, input, config);
}
