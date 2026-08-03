import { defineConfig } from 'vitest/config';
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
      {
        find: /^dg-cell-mvi-halfcode-contract$/,
        replacement: new URL('../dg-cell-mvi-halfcode-contract/src/index.ts', import.meta.url).pathname,
      },
    ],
  },
});
