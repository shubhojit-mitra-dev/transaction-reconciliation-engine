import { connectDatabase, disconnectDatabase } from '@repo/database';

const MONGODB_URI = process.env['MONGODB_URI'];

/**
 * Vitest globalSetup — executed ONCE before the entire test suite starts.
 * Establishes the single shared MongoDB connection for all integration tests.
 */
export async function setup(): Promise<void> {
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Make sure .env.test is present and dotenv is loaded in vitest.config.ts',
    );
  }
  await connectDatabase(MONGODB_URI);
}

/**
 * Vitest globalSetup — executed ONCE after the entire test suite finishes.
 * Closes the MongoDB connection cleanly.
 */
export async function teardown(): Promise<void> {
  await disconnectDatabase();
}
