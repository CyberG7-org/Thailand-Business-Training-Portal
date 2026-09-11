import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      'server-only': `${root}tests/stubs/server-only.ts`,
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
