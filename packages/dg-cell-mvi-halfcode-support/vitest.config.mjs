import { defineConfig } from 'vitest/config';
import path from 'path';

const DEPA_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT ||
  path.resolve(__dirname, '../../../depa-data-graph');

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      'depa-data-graph-core': path.resolve(DEPA_ROOT, 'packages/core/src/index.ts'),
      'dg-cell-mvi-core': new URL('../dg-cell-mvi-core/src/index.ts', import.meta.url).pathname,
      'dg-cell-mvi-halfcode-contract': new URL('../dg-cell-mvi-halfcode-contract/src/index.ts', import.meta.url).pathname,
      'dg-cell-mvi-halfcode-logic': new URL('../dg-cell-mvi-halfcode-logic/src/index.ts', import.meta.url).pathname,
      'xnl-core': path.resolve(__dirname, '../../../../lang/xnl.ts/packages/core/src/index.ts'),
    },
  },
});
