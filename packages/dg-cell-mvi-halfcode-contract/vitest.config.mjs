import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: [
      {
        find: /^dg-cell-mvi-halfcode-contract\/test-fixtures\/xnl-rich-document$/,
        replacement: path.resolve(__dirname, './test-fixtures/xnl-rich-document.ts'),
      },
      {
        find: /^dg-cell-mvi-halfcode-contract$/,
        replacement: path.resolve(__dirname, './src/index.ts'),
      },
    ],
  },
});
