import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic healthcheck route to verify Express is working
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export { app };
