import type { DataGraph, MountedGraphModule } from 'depa-data-graph-core';
import type { CounterGraphModule } from './counter.graph.types';

type CounterRefs = MountedGraphModule<typeof CounterGraphModule.definition>;

interface CounterRuntime {
  graph(name: 'counter'): { graph: DataGraph<unknown>; refs: CounterRefs } | undefined;
}

export function incrementCounter(runtime: CounterRuntime, input: { step?: number }, config: { step?: number }) {
  const mounted = runtime.graph('counter');
  if (!mounted) throw new Error('Counter graph is not visible in the current Scope.');
  const { graph, refs } = mounted;
  const step = Number(config?.step ?? 1);
  graph.set(refs.state.count, (prev) => Number(prev ?? 0) + step);
  return {
    value: graph.get(refs.outputs.value),
    label: graph.get(refs.outputs.label),
  };
}
