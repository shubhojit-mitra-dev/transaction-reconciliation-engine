import { beforeEach } from 'vitest';
import mongoose from 'mongoose';

/**
 * Registered as a Vitest setupFile — runs in every test worker before each test.
 *
 * Drops all documents from every collection so each test starts with a
 * completely clean database state. This is faster than dropping and recreating
 * the database, and safer than trying to track per-test cleanup manually.
 */
beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.collections();
  await Promise.all(collections.map((col) => col.deleteMany({})));
});
