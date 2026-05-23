import serverless from 'serverless-http';
import { app } from './app';
import { connectDatabase } from '@repo/database';
import { logger } from '@repo/logger';

const MONGODB_URI = process.env.MONGODB_URI ?? '';

// Connect to DB once when the lambda container is initialized (Cold Start)
connectDatabase(MONGODB_URI).catch((err) => {
  logger.error('Failed to connect to database during Lambda init', { error: err });
});

export const handler = serverless(app);
