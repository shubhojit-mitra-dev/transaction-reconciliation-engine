import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load test credentials from the repo root .env.test before any test runs.
// This keeps secrets out of source files while remaining explicit about
// which env file is being used.
dotenv.config({ path: resolve(__dirname, '../../.env.test') });

export default defineConfig({
  test: {
    // Connect to MongoDB once before the suite and disconnect once after
    globalSetup: './src/__tests__/helpers/globalSetup.ts',
    // Wipe all collections before every individual test
    setupFiles: ['./src/__tests__/helpers/setupFiles.ts'],
    // Run tests sequentially — integration tests share one DB connection
    // and sequential execution prevents inter-test interference
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 15000,
  },
});
