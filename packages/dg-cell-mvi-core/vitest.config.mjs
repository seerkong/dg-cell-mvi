import { defineConfig } from 'vitest/config';
import path from 'path';

// Latest depa-data-graph engine consumed from source (its dist is not built); this single alias
// keeps the framework's own tests build-free, mirroring how bastard consumes depa.
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
    },
  },
});
