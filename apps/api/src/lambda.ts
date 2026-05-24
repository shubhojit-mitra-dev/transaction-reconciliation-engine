import serverless from 'serverless-http';
import { app } from './app';
import { connectDatabase } from '@repo/database';
import { logger } from '@repo/logger';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI?.trim()) {
  throw new Error('MONGODB_URI is required for Lambda initialization.');
}

const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  try {
    // Ensure DB is fully connected BEFORE passing the request to Express.
    // This prevents Mongoose "Cannot call aggregate before initial connection" errors.
    await connectDatabase(MONGODB_URI);
    return await serverlessHandler(event, context);
  } catch (err) {
    logger.error('Failed to connect to database during Lambda execution', { error: err });
    throw err;
  }
};
