import { DataGraph } from 'depa-data-graph-core';

export function getUsersStoreGraph(runtime, input, config) {
  return new DataGraph(() => runtime);
}
