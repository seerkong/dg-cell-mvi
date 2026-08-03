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
    alias: [
      {
        find: /^dg-cell-mvi-halfcode-contract\/test-fixtures\/xnl-rich-document$/,
        replacement: new URL('../dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document.ts', import.meta.url).pathname,
      },
      { find: 'depa-data-graph-core', replacement: path.resolve(DEPA_ROOT, 'packages/core/src/index.ts') },
      { find: 'dg-cell-mvi-core', replacement: new URL('../dg-cell-mvi-core/src/index.ts', import.meta.url).pathname },
      { find: /^dg-cell-mvi-halfcode-contract$/, replacement: new URL('../dg-cell-mvi-halfcode-contract/src/index.ts', import.meta.url).pathname },
      { find: 'dg-cell-mvi-halfcode-logic', replacement: new URL('../dg-cell-mvi-halfcode-logic/src/index.ts', import.meta.url).pathname },
      { find: 'xnl-core', replacement: path.resolve(__dirname, '../../../../lang/xnl.ts/packages/core/src/index.ts') },
    ],
  },
});
