import { beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase } from '@repo/database';

const MONGODB_URI = process.env['MONGODB_URI'] ?? '';

/**
 * Connect to MongoDB once per test file, inside the fork that actually
 * runs the tests. globalSetup runs in the parent Vitest process and its
 * mongoose connection is NOT inherited by forked workers.
 */
beforeAll(async () => {
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

