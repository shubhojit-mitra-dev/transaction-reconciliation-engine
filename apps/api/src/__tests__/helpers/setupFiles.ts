import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '@repo/database';

const MONGODB_URI = process.env['MONGODB_URI'];

beforeAll(async () => {
  if (!MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is not set in API test env.');
  }
  if (mongoose.connection.readyState === 0) {
    await connectDatabase(MONGODB_URI);
  }
});

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((col) => col.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
  }
});
