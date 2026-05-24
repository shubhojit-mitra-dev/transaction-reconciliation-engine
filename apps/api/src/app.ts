import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { executeReconciliation } from '@repo/engine';
import multer from 'multer';
import { reportRouter } from './routes/report';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler';

import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

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
      if (req.body.quantityTolerancePct) {
        configOverrides.quantityTolerancePct = parseFloat(req.body.quantityTolerancePct);
      }
      if (req.body.timestampToleranceSeconds) {
        configOverrides.timestampToleranceSeconds = parseFloat(req.body.timestampToleranceSeconds);
      }

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

const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
const isSwaggerDocsEnabled = nodeEnv !== 'prod' && nodeEnv !== 'production';

if (isSwaggerDocsEnabled) {
  app.use('/docs', (_req, res, next) => {
    // Swagger UI relies on inline script/style blocks, so docs route needs a relaxed policy.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    );
    next();
  });

  // Serve the raw swagger JSON
  app.get('/docs/swagger.json', (_req, res) => {
    res.json(swaggerDocument);
  });

  // Serve the interactive Swagger UI
  // Splitting serve and setup is a known workaround for the serverless-offline infinite redirect loop
  app.use('/docs', swaggerUi.serve);
  app.get('/docs', swaggerUi.setup(swaggerDocument));
}

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
