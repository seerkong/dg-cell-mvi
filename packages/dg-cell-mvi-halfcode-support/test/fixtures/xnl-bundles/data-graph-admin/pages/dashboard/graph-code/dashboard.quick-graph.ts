export function installDashboardSummaryGraph(runtime, input, config) {
  const graph = input?.graph;
  if (graph?.addComputed) {
    graph.addSignal('dashboard.inputs.summary', { total: 0, active: 0, inactive: 0 }, { in: true });
    graph.addComputed('dashboard.outputs.cards', ['dashboard.inputs.summary'], (ctx) => {
      const summary = ctx.graph.get('dashboard.inputs.summary');
      const labels = config?.cardLabels ?? {};
      return (config?.cardOrder ?? ['total']).map((key) => ({
        key,
        id: key,
        label: labels[key] ?? key,
        value: summary?.[key] ?? 0,
      }));
    });
  }
  return graph;
}
