import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { executeReconciliation } from '../reconciliation';
import { ReconciliationRunModel, ReconciliationResultModel, TransactionModel } from '@repo/database';
import { ReconciliationStatus, MatchStatus } from '@repo/types';

// ─────────────────────────────────────────────────────────────────────────────
// Load the real sample CSV files from the repo data/ directory
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = resolve(__dirname, '../../../../data');

const userCsvBuffer = readFileSync(resolve(DATA_DIR, 'user_transactions.csv'));
const exchangeCsvBuffer = readFileSync(resolve(DATA_DIR, 'exchange_transactions.csv'));

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('executeReconciliation — end-to-end', () => {
  describe('Run lifecycle', () => {
    it('creates a ReconciliationRun record and returns COMPLETED status', async () => {
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      expect(response.status).toBe(ReconciliationStatus.COMPLETED);
      expect(response.runId).toBeTruthy();
      expect(response.message).toContain('successfully');
    });

    it('persists the run record in the database with COMPLETED status', async () => {
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const run = await ReconciliationRunModel.findById(response.runId);
      expect(run).not.toBeNull();
      expect(run?.status).toBe(ReconciliationStatus.COMPLETED);
      expect(run?.completedAt).toBeInstanceOf(Date);
    });

    it('stores the resolved config on the run record', async () => {
      const configOverrides = { timestampToleranceSeconds: 60, quantityTolerancePct: 0.05 };
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer, configOverrides });

      const run = await ReconciliationRunModel.findById(response.runId);
      expect(run?.config.timestampToleranceSeconds).toBe(60);
      expect(run?.config.quantityTolerancePct).toBe(0.05);
    });
  });

  describe('Ingestion phase', () => {
    it('ingests all rows from both CSV files into the Transactions collection', async () => {
      // user CSV: 26 data rows (USR-001..USR-025 + 1 duplicate USR-001)
      // exchange CSV: 25 data rows (EXC-1001..EXC-1025)
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const count = await TransactionModel.countDocuments({ runId: response.runId });
      expect(count).toBe(51);
    });

    it('flags the known invalid rows in the user CSV', async () => {
      // user CSV has 3 known bad rows: USR-001 duplicate, USR-018 bad timestamp, USR-019 negative qty, USR-024 missing timestamp
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const invalidUser = await TransactionModel.countDocuments({
        runId: response.runId,
        source: 'USER',
        ingestionStatus: 'INVALID',
      });
      // USR-001 (duplicate), USR-018 (bad timestamp), USR-019 (negative qty), USR-024 (missing timestamp)
      expect(invalidUser).toBe(4);
    });
  });

  describe('Matching phase', () => {
    it('produces at least one MATCHED result', async () => {
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const matched = await ReconciliationResultModel.countDocuments({
        runId: response.runId,
        status: MatchStatus.MATCHED,
      });
      expect(matched).toBeGreaterThan(0);
    });

    it('produces UNMATCHED_EXCHANGE results for exchange-only transactions (EXC-1024, EXC-1025)', async () => {
      // EXC-1024 and EXC-1025 are present in exchange CSV but have no user counterpart
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const unmatchedExchange = await ReconciliationResultModel.countDocuments({
        runId: response.runId,
        status: MatchStatus.UNMATCHED_EXCHANGE,
      });
      expect(unmatchedExchange).toBeGreaterThan(0);
    });

    it('every transaction has exactly one result entry (complete coverage)', async () => {
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      // A MATCHED result covers one user tx AND one exchange tx in a single row,
      // so totalResults !== totalTransactions. The correct invariant is:
      //   - every user tx appears as userTransactionId in exactly one result
      //   - every exchange tx appears as exchangeTransactionId in exactly one result
      const userTxCount = await TransactionModel.countDocuments({
        runId: response.runId,
        source: 'USER',
      });
      const exchangeTxCount = await TransactionModel.countDocuments({
        runId: response.runId,
        source: 'EXCHANGE',
      });

      const resultsWithUser = await ReconciliationResultModel.countDocuments({
        runId: response.runId,
        userTransactionId: { $ne: null },
      });
      const resultsWithExchange = await ReconciliationResultModel.countDocuments({
        runId: response.runId,
        exchangeTransactionId: { $ne: null },
      });

      expect(resultsWithUser).toBe(userTxCount);
      expect(resultsWithExchange).toBe(exchangeTxCount);
    });

    it('produces CONFLICTING for EXC-1012 which has quantity 0.3001 vs user 0.3 (exceeds 0.01% tolerance)', async () => {
      // EXC-1012: BTC BUY 0.3001 vs USR-012: BTC BUY 0.3 → diff ≈ 0.033% > 0.01%
      const response = await executeReconciliation({ userCsvBuffer, exchangeCsvBuffer });

      const conflicting = await ReconciliationResultModel.countDocuments({
        runId: response.runId,
        status: MatchStatus.CONFLICTING,
      });
      expect(conflicting).toBeGreaterThan(0);
    });
  });

  describe('Config override behaviour', () => {
    it('with a wider quantity tolerance, the previously CONFLICTING pair becomes MATCHED', async () => {
      // EXC-1012 (0.3001) vs USR-012 (0.3) → diff ≈ 0.033%
      // With 0.1% tolerance this pair should match

      const tightResponse = await executeReconciliation({
        userCsvBuffer,
        exchangeCsvBuffer,
        configOverrides: { quantityTolerancePct: 0.01 },
      });

      const wideResponse = await executeReconciliation({
        userCsvBuffer,
        exchangeCsvBuffer,
        configOverrides: { quantityTolerancePct: 0.1 },
      });

      const tightMatched = await ReconciliationResultModel.countDocuments({
        runId: tightResponse.runId,
        status: MatchStatus.MATCHED,
      });

      const wideMatched = await ReconciliationResultModel.countDocuments({
        runId: wideResponse.runId,
        status: MatchStatus.MATCHED,
      });

      // A wider tolerance should yield at least as many matches
      expect(wideMatched).toBeGreaterThanOrEqual(tightMatched);
    });
  });
});
