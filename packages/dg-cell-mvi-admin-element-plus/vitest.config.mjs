import { defineConfig } from 'vitest/config';
import path from 'path';

const DEPA_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT || path.resolve(__dirname, '../../../depa-data-graph');

// App-layer unit tests run in node. Under test: the framework-neutral crud↔HttpPort bridge
// (src/common/httpCrudRequest.ts — takes an INJECTED HttpPort, a fake in the test) and the
// halfcode-unit-bundles preview model (src/views/halfcode-unit-bundles/preview.ts — pure
// load→compile→project over an in-memory file map). No DOM/jsdom and no vue/element is needed.
// Workspace `dg-cell-mvi-*` packages publish TS source, so imports are aliased to source like in
// vite.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'dg-cell-mvi-admin-contract': path.resolve(
        __dirname,
        '../dg-cell-mvi-admin-contract/src/index.ts',
      ),
      'dg-cell-mvi-core': path.resolve(__dirname, '../dg-cell-mvi-core/src/index.ts'),
      'dg-cell-mvi-halfcode-contract': path.resolve(
        __dirname,
        '../dg-cell-mvi-halfcode-contract/src/index.ts',
      ),
      'dg-cell-mvi-halfcode-logic': path.resolve(
        __dirname,
        '../dg-cell-mvi-halfcode-logic/src/index.ts',
      ),
      'dg-cell-mvi-halfcode-support': path.resolve(
        __dirname,
        '../dg-cell-mvi-halfcode-support/src/index.ts',
      ),
      'xnl-core': path.resolve(__dirname, '../../../../lang/xnl.ts/packages/core/src/index.ts'),
      'depa-data-graph-core': path.resolve(DEPA_ROOT, 'packages/core/src/index.ts'),
    },
  },
});
