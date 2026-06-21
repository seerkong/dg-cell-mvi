export function computeFilteredRows(runtime, input, config) {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const query = input?.query ?? {};
  const keyword = String(query.keyword ?? '').toLowerCase();
  const status = query.status ?? 'all';
  return rows.filter((row) => {
    const nameMatched = !keyword || String(row.name ?? '').toLowerCase().includes(keyword);
    const statusMatched = status === 'all' || row.status === status;
    return nameMatched && statusMatched;
  });
}

export function computeSummary(runtime, input, config) {
  const rows = Array.isArray(input?.filteredRows)
    ? input.filteredRows
    : Array.isArray(input?.rows)
      ? input.rows
      : [];
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    inactive: rows.filter((row) => row.status === 'inactive').length,
  };
}

export function applyQuery(runtime, input, config) {
  return runtime?.fixtures?.users ?? [];
}
