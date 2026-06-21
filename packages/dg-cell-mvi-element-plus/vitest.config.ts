import { defineConfig } from 'vitest/config';
import path from 'path';

// Mirrors dg-cell-mvi-vue's vitest config (workspace source aliases). The element-plus-layer tests run
// in the `node` environment — they exercise `elementUiRegistry`'s PURE component resolution +
// (element-plus-mocked) imperative UI, so no DOM/component mount is required.
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
      'depa-data-graph-vue': path.resolve(DEPA_ROOT, 'packages/vue/src/index.ts'),
      'dg-cell-mvi-core': path.resolve(__dirname, '../dg-cell-mvi-core/src/index.ts'),
      'dg-cell-mvi-crud': path.resolve(__dirname, '../dg-cell-mvi-crud/src/index.ts'),
      'dg-cell-mvi-vue': path.resolve(__dirname, '../dg-cell-mvi-vue/src/index.ts'),
    },
  },
});
