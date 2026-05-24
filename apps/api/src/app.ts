import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { executeReconciliation } from '@repo/engine';
import multer from 'multer';
import { reportRouter } from './routes/report';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler';

const app: Express = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic healthcheck route to verify Express is working
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post(
  '/reconcile',
  upload.fields([
    { name: 'user_file', maxCount: 1 },
    { name: 'exchange_file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files || !files.user_file || !files.exchange_file) {
        return res.status(400).json({ error: 'Both user_file and exchange_file are required' });
      }

      const userCsvBuffer = files.user_file[0].buffer;
      const exchangeCsvBuffer = files.exchange_file[0].buffer;

      // Parse optional configuration from the form data
      const configOverrides: Record<string, number> = {};
      if (req.body.quantityTolerance) configOverrides.quantityTolerance = parseFloat(req.body.quantityTolerance);
      if (req.body.timestampTolerance) configOverrides.timestampToleranceMs = parseInt(req.body.timestampTolerance, 10);

      const result = await executeReconciliation({
        userCsvBuffer,
        exchangeCsvBuffer,
        configOverrides,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'An unexpected error occurred during reconciliation' });
    }
  }
);

app.use('/report', reportRouter);

// Test-only route: triggers the global error handler to verify 500 behaviour.
// Guard prevents this route from existing outside test runs.
if (process.env.NODE_ENV === 'test') {
  app.get('/test-error', () => {
    throw new Error('Intentional test error');
  });
}

// ── Error handling (must be mounted last) ────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export { app };
