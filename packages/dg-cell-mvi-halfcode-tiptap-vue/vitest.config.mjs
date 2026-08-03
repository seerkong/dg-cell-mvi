import path from 'node:path';
import { defineConfig } from 'vitest/config';

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const DEPA_DATA_GRAPH_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT || path.resolve(WORKSPACE_ROOT, '../depa-data-graph');

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [
      {
        find: /^depa-data-graph-core$/,
        replacement: path.resolve(DEPA_DATA_GRAPH_ROOT, 'packages/core/src/index.ts'),
      },
      {
        find: /^dg-cell-mvi-core$/,
        replacement: path.resolve(WORKSPACE_ROOT, 'packages/dg-cell-mvi-core/src/index.ts'),
      },
      {
        find: /^dg-cell-mvi-halfcode-support\/xnl-projection-presenter$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-support/src/xnlProjectionPresenter.ts',
        ),
      },
      {
        find: /^dg-cell-mvi-halfcode-contract\/test-fixtures\/xnl-rich-document$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document.ts',
        ),
      },
      {
        find: /^dg-cell-mvi-halfcode-contract$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-contract/src/index.ts',
        ),
      },
      {
        find: /^dg-cell-mvi-halfcode-logic$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-logic/src/index.ts',
        ),
      },
      {
        find: /^dg-cell-mvi-halfcode-support$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-support/src/index.ts',
        ),
      },
      {
        find: /^dg-cell-mvi-halfcode-vue$/,
        replacement: path.resolve(
          WORKSPACE_ROOT,
          'packages/dg-cell-mvi-halfcode-vue/src/index.ts',
        ),
      },
    ],
  },
});
