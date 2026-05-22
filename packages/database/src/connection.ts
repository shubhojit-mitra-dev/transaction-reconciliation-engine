import mongoose from 'mongoose';
import { logger } from '@repo/logger';

let isConnected = false;

/**
 * Establishes a connection to MongoDB Atlas.
 *
 * Lambda-safe: on a warm invocation, the container already holds an open
 * mongoose connection. We guard against re-connecting with the `isConnected`
 * flag, preventing connection pool exhaustion under high concurrency.
 *
 * @param uri - MongoDB connection string (from MONGODB_URI env var)
 */
export async function connectDatabase(uri: string): Promise<void> {
  if (isConnected) {
    logger.debug('Reusing existing MongoDB connection');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      // bufferCommands: false — queries fail immediately if called before
      // the connection is ready, rather than silently queuing.
      bufferCommands: false,
    });

    isConnected = true;
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed', { error });
    throw error;
  }
}

/**
 * Gracefully disconnects from MongoDB.
 * Primarily used in test teardown; rarely needed in Lambda.
 */
export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected');
}
