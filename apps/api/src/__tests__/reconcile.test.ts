import { describe, it, expect } from 'vitest';
import request from 'supertest';
import path from 'path';
import { app } from '../app';

describe('POST /reconcile', () => {
  it('should accept CSV files and return a runId', async () => {
    // We assume test CSV files exist in the data folder at the monorepo root
    const userCsvPath = path.resolve(__dirname, '../../../../data/user_transactions.csv');
    const exchangeCsvPath = path.resolve(__dirname, '../../../../data/exchange_transactions.csv');

    const res = await request(app)
      .post('/reconcile')
      .field('quantityTolerance', '0.01')
      .field('timestampTolerance', '60000') // 1 minute in ms
      .attach('user_file', userCsvPath)
      .attach('exchange_file', exchangeCsvPath);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('runId');
    expect(res.body).toHaveProperty('status', 'COMPLETED');
  });

  it('should return 400 if files are missing', async () => {
    const res = await request(app)
      .post('/reconcile')
      .field('quantityTolerance', '0.01');
      
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
