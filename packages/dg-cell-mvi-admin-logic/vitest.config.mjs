import { defineConfig } from 'vitest/config';
import path from 'path';

// Workspace `dg-cell-mvi-*` packages publish TS source as `main`, so alias them to source for tests.
// depa-* packages (depa-actor / depa-processor / depa-data-graph-core) are real npm deps resolved
// via node_modules — intentionally NOT aliased here (no infra-dev hack for the new admin chassis).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The published depa-actor / depa-processor ship ESM with extensionless relative imports
    // (e.g. `from './core/ActorSystem'`), which Node's native ESM loader rejects. Inline them so
    // they go through Vite's (extension-tolerant) resolver/transform instead of native import.
    server: {
      deps: {
        inline: [/depa-actor/, /depa-processor/],
      },
    },
  },
  resolve: {
    alias: {
      'dg-cell-mvi-core': path.resolve(__dirname, '../dg-cell-mvi-core/src/index.ts'),
      'dg-cell-mvi-admin-contract': path.resolve(
        __dirname,
        '../dg-cell-mvi-admin-contract/src/index.ts',
      ),
    },
  },
});
