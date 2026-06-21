import path from 'node:path';
import { defineConfig } from 'vitest/config';

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const DEPA_DATA_GRAPH_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT || path.resolve(WORKSPACE_ROOT, '../depa-data-graph');

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      'depa-data-graph-core': path.resolve(DEPA_DATA_GRAPH_ROOT, 'packages/core/src/index.ts'),
      'dg-cell-mvi-core': path.resolve(WORKSPACE_ROOT, 'packages/dg-cell-mvi-core/src/index.ts'),
      'dg-cell-mvi-halfcode-contract': path.resolve(
        WORKSPACE_ROOT,
        'packages/dg-cell-mvi-halfcode-contract/src/index.ts',
      ),
      'dg-cell-mvi-halfcode-support': path.resolve(
        WORKSPACE_ROOT,
        'packages/dg-cell-mvi-halfcode-support/src/index.ts',
      ),
    },
  },
});
