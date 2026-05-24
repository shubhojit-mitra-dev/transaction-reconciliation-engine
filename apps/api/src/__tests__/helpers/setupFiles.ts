import { beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase } from '@repo/database';

// Give each Vitest worker its own database so parallel files cannot interfere.
const workerId = process.env['VITEST_POOL_ID'] ?? '0';
const MONGODB_BASE_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/reconciliation_test';

// Replace the database name with a worker-scoped one.
// e.g. mongodb://localhost:27017/reconciliation_test  →  reconciliation_test_0
const MONGODB_URI = MONGODB_BASE_URI.replace(
  /\/([^/?]+)(\?|$)/,
  `/reconciliation_test_${workerId}$2`,
);

beforeAll(async () => {
  if (!MONGODB_URI?.trim()) {
    throw new Error(
      'MONGODB_URI is not set. Make sure .env.test is present and dotenv is loaded in vitest.config.ts',
    );
  }
  if (mongoose.connection.readyState === 0) {
    await connectDatabase(MONGODB_URI);
  }
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.collections();
  await Promise.all(collections.map((col) => col.deleteMany({})));
});
