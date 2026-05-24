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
  app.get('/docs/swagger.json', (req, res) => {
    res.json(swaggerDocument);
  });

  // 1. API Gateway strips trailing slashes, causing an infinite redirect loop if we rely on /docs/
  // Solution: Redirect exactly /docs to /docs/index.html so the browser has a reliable base path.
  app.get('/docs', (req, res) => {
    res.redirect(301, '/docs/index.html');
  });

  // 2. Intercept the HTML and Init JS requests. We use a response interceptor to replace
  // the hardcoded local asset paths (which esbuild doesn't bundle) with CDN links.
  app.use(
    '/docs',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path === '/index.html' || req.path === '/swagger-ui-init.js') {
        // Trick swaggerUi.setup into not doing its own internal redirects
        req.originalUrl = '/docs/';
        
        // Intercept the HTML response to rewrite local paths to CDN
        const originalSend = res.send;
        res.send = function (body: any): express.Response {
          if (typeof body === 'string' && body.includes('swagger-ui-bundle.js')) {
            let customized = body.replace(
              /\.\/swagger-ui-bundle\.js/g, 
              'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js'
            );
            customized = customized.replace(
              /\.\/swagger-ui-standalone-preset\.js/g, 
              'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js'
            );
            customized = customized.replace(
              /\.\/swagger-ui\.css/g, 
              'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css'
            );
            customized = customized.replace(
              /href="\.\/favicon-.*?\.png"/g, 
              'href="data:image/x-icon;base64,"' // Prevent 404s for favicon
            );
            return originalSend.call(this, customized);
          }
          return originalSend.call(this, body);
        };

        return swaggerUi.setup(swaggerDocument)(req, res, next);
      }
      next();
    }
  );
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
