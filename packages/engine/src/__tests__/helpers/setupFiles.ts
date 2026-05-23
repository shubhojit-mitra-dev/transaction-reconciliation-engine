import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '@repo/database';

const MONGODB_URI = process.env['MONGODB_URI'];

/**
 * Connect to MongoDB once per test file, inside the fork that actually
 * runs the tests. globalSetup runs in the parent Vitest process and its
 * mongoose connection is NOT inherited by forked workers.
 */
beforeAll(async () => {
  if (!MONGODB_URI?.trim()) {
    throw new Error(
      'MONGODB_URI is not set. Make sure .env.test is present and dotenv is loaded in vitest.config.ts',
    );
  }

  // readyState 0 = disconnected — only connect if we haven't already
  if (mongoose.connection.readyState === 0) {
    await connectDatabase(MONGODB_URI);
  }
});

/**
 * Wipe all collections before every individual test for full isolation.
 */
beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.collections();
  await Promise.all(collections.map((col) => col.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
  }
});
