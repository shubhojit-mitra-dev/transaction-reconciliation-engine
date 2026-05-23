import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { ReconciliationRunModel, ReconciliationResultModel } from '@repo/database';
import { ReconciliationStatus, MatchStatus, TransactionSource } from '@repo/types';

describe('GET /report endpoints', () => {
  let runId: string;

  beforeAll(async () => {
    // Seed database with a fake run and results
    const run = await ReconciliationRunModel.create({
      status: ReconciliationStatus.COMPLETED,
      config: { quantityTolerancePct: 0.01, timestampToleranceSeconds: 60 },
    });
    runId = String(run._id);

    await ReconciliationResultModel.create([
      {
        runId,
        status: MatchStatus.MATCHED,
        userTransactionId: 'u1',
        exchangeTransactionId: 'e1',
        reason: 'Exact match',
      },
      {
        runId,
        status: MatchStatus.UNMATCHED_USER,
        userTransactionId: 'u2',
        reason: 'No exchange transaction found',
      },
    ]);
  });

  describe('GET /report/:runId', () => {
    it('should return paginated results for a given runId', async () => {
      const res = await request(app).get(`/report/${runId}?page=1&limit=10`);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toHaveProperty('total', 2);
    });

    it('should return 404 for an invalid runId format', async () => {
      const res = await request(app).get('/report/invalid-id');
      expect(res.status).toBe(400); // Bad Request for invalid mongo ObjectId
    });
  });

  describe('GET /report/:runId/summary', () => {
    it('should return aggregated metrics for the run', async () => {
      const res = await request(app).get(`/report/${runId}/summary`);
      
      expect(res.status).toBe(200);
      expect(res.body.totalProcessed).toBeGreaterThanOrEqual(2);
      expect(res.body.matched).toBe(1);
      expect(res.body.unmatchedUser).toBe(1);
    });
  });

  describe('GET /report/:runId/unmatched', () => {
    it('should return only unmatched transactions', async () => {
      const res = await request(app).get(`/report/${runId}/unmatched`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe(MatchStatus.UNMATCHED_USER);
    });
  });
});
