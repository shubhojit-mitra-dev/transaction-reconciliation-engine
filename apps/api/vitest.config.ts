import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load .env.test from the monorepo root
dotenv.config({ path: resolve(__dirname, '../../.env.test') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Run test files sequentially to prevent parallel DB interference
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    setupFiles: ['./src/__tests__/helpers/setupFiles.ts'],
    server: {
      deps: {
        external: ['mongoose'],
      },
    },
  },
});
