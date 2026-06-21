import { defineConfig } from 'vitest/config';
import path from 'path';

// Tests run in node: the StoragePort takes an injected in-memory backend and the HttpPort takes a
// fake axios instance, so no DOM/jsdom is needed. Workspace `dg-cell-mvi-*` packages publish TS
// source as `main`, so alias them to source for tests.
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
    },
  },
});
