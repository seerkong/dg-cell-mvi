import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      'dg-cell-mvi-halfcode-contract': new URL('../dg-cell-mvi-halfcode-contract/src/index.ts', import.meta.url).pathname,
    },
  },
});
