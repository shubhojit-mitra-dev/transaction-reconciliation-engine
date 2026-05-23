import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load test credentials from the repo root .env.test before any test runs.
// This keeps secrets out of source files while remaining explicit about
// which env file is being used.
dotenv.config({ path: resolve(__dirname, '../../.env.test') });

export default defineConfig({
  test: {
    // Wipe all collections and establish the DB connection before every test file.
    // setupFiles runs inside the forked worker — the correct process for mongoose.
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
    server: {
      deps: {
        // Vite-node must not attempt to bundle native Node.js / CJS packages.
        // Tell it to load them directly via Node's require() instead.
        external: [/node_modules/],
      },
    },
  },
});
