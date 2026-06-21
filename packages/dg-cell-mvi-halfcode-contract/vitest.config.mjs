import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'dg-cell-mvi-halfcode-contract': path.resolve(__dirname, './src/index.ts'),
    },
  },
});
