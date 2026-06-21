import { defineConfig } from 'vitest/config';
import path from 'path';

const DEPA_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT ||
  path.resolve(__dirname, '../../../depa-data-graph');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'depa-data-graph-core': path.resolve(DEPA_ROOT, 'packages/core/src/index.ts'),
      'dg-cell-mvi-core': path.resolve(__dirname, '../dg-cell-mvi-core/src/index.ts'),
    },
  },
});
