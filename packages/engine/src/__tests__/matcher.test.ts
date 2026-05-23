import { describe, it, expect } from 'vitest';
import { runMatcher } from '../matcher';
import { TransactionModel, ReconciliationResultModel } from '@repo/database';
import {
  TransactionSource,
  TransactionType,
  IngestionStatus,
  MatchStatus,
} from '@repo/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures & Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  timestampToleranceSeconds: 300, // ±5 minutes
  quantityTolerancePct: 0.01,     // ±0.01%
};

const RUN_ID = 'test-run-matcher-001';

/**
 * Inserts a valid USER transaction document directly into the DB.
 * Bypasses ingestCsv to keep matcher tests focused on matching logic only.
 */
async function seedUserTx(overrides: Partial<{
  originalId: string;
  asset: string;
  amount: string;
  type: TransactionType;
  timestamp: Date;
  ingestionStatus: IngestionStatus;
  validationErrors: string[];
}> = {}) {
  return TransactionModel.create({
    runId: RUN_ID,
    source: TransactionSource.USER,
    originalId: overrides.originalId ?? 'USR-001',
    asset: overrides.asset ?? 'BTC',
    amount: overrides.amount ?? '0.5',
    type: overrides.type ?? TransactionType.BUY,
    timestamp: overrides.timestamp ?? new Date('2024-03-01T09:00:00Z'),
    rawData: {},
    ingestionStatus: overrides.ingestionStatus ?? IngestionStatus.VALID,
    validationErrors: overrides.validationErrors ?? [],
  });
}

/**
 * Inserts a valid EXCHANGE transaction document directly into the DB.
 */
async function seedExchangeTx(overrides: Partial<{
  originalId: string;
  asset: string;
  amount: string;
  type: TransactionType;
  timestamp: Date;
  ingestionStatus: IngestionStatus;
  validationErrors: string[];
}> = {}) {
  return TransactionModel.create({
    runId: RUN_ID,
    source: TransactionSource.EXCHANGE,
    originalId: overrides.originalId ?? 'EXC-1001',
    asset: overrides.asset ?? 'BTC',
    amount: overrides.amount ?? '0.5',
    type: overrides.type ?? TransactionType.BUY,
    timestamp: overrides.timestamp ?? new Date('2024-03-01T09:00:00Z'),
    rawData: {},
    ingestionStatus: overrides.ingestionStatus ?? IngestionStatus.VALID,
    validationErrors: overrides.validationErrors ?? [],
  });
}

async function getResults() {
  return ReconciliationResultModel.find({ runId: RUN_ID }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('runMatcher — integration', () => {
  describe('MATCHED status', () => {
    it('produces MATCHED for identical asset, type, timestamp, and quantity', async () => {
      await seedUserTx();
      await seedExchangeTx();

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe(MatchStatus.MATCHED);
    });

    it('produces MATCHED when quantity is within tolerance (exactly at boundary)', async () => {
      // user: 1.0, exchange: 1.0001 → diff = 0.01% = exactly at the tolerance limit
      await seedUserTx({ amount: '1.0' });
      await seedExchangeTx({ amount: '1.0001' });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.status).toBe(MatchStatus.MATCHED);
    });

    it('produces MATCHED when timestamp differs but is within the tolerance window', async () => {
      const userTime = new Date('2024-03-01T09:00:00Z');
      const exchTime = new Date('2024-03-01T09:04:59Z'); // 299s apart — within 300s window

      await seedUserTx({ timestamp: userTime });
      await seedExchangeTx({ timestamp: exchTime });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.status).toBe(MatchStatus.MATCHED);
    });

    it('links both transaction IDs in the MATCHED result', async () => {
      const userDoc = await seedUserTx();
      const exchDoc = await seedExchangeTx();

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.userTransactionId).toBe(String(userDoc._id));
      expect(results[0]?.exchangeTransactionId).toBe(String(exchDoc._id));
    });
  });

  describe('CONFLICTING status', () => {
    it('produces CONFLICTING when quantity exceeds tolerance but timestamp is in window', async () => {
      // user: 0.3, exchange: 0.3001 → diff = 0.0333% > 0.01% tolerance
      await seedUserTx({ amount: '0.3' });
      await seedExchangeTx({ amount: '0.3001' });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.status).toBe(MatchStatus.CONFLICTING);
    });

    it('includes the quantity diff and both amounts in the CONFLICTING reason', async () => {
      await seedUserTx({ amount: '0.3' });
      await seedExchangeTx({ amount: '0.3001' });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.reason).toContain('0.3');
      expect(results[0]?.reason).toContain('0.3001');
    });
  });

  describe('UNMATCHED_USER status', () => {
    it('produces UNMATCHED_USER when no exchange transaction exists', async () => {
      await seedUserTx();
      // No exchange transaction seeded

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe(MatchStatus.UNMATCHED_USER);
    });

    it('produces UNMATCHED_USER when exchange timestamp is outside the window', async () => {
      const userTime = new Date('2024-03-01T09:00:00Z');
      const exchTime = new Date('2024-03-01T10:00:00Z'); // 3600s — outside 300s window

      await seedUserTx({ timestamp: userTime });
      await seedExchangeTx({ timestamp: exchTime });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      // User tx has no eligible match → UNMATCHED_USER
      // Exchange tx has no match → UNMATCHED_EXCHANGE
      const userResult = results.find((r) => r.status === MatchStatus.UNMATCHED_USER);
      expect(userResult).toBeDefined();
      expect(userResult?.userTransactionId).toBe(String((await TransactionModel.findOne({ source: TransactionSource.USER, runId: RUN_ID }))!._id));
    });

    it('produces UNMATCHED_USER when asset does not match', async () => {
      await seedUserTx({ asset: 'BTC' });
      await seedExchangeTx({ asset: 'ETH' }); // different asset

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      const userResult = results.find((r) => r.status === MatchStatus.UNMATCHED_USER);
      expect(userResult).toBeDefined();
    });
  });

  describe('UNMATCHED_EXCHANGE status', () => {
    it('produces UNMATCHED_EXCHANGE for an exchange transaction with no user counterpart', async () => {
      // No user transaction seeded
      await seedExchangeTx();

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe(MatchStatus.UNMATCHED_EXCHANGE);
    });
  });

  describe('Perspective mapping (TRANSFER_OUT ↔ TRANSFER_IN)', () => {
    it('matches a USER TRANSFER_OUT to an EXCHANGE TRANSFER_IN on the same asset', async () => {
      await seedUserTx({ type: TransactionType.TRANSFER_OUT });
      await seedExchangeTx({ type: TransactionType.TRANSFER_IN });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.status).toBe(MatchStatus.MATCHED);
    });

    it('does NOT match a USER TRANSFER_OUT to an EXCHANGE TRANSFER_OUT (same perspective)', async () => {
      await seedUserTx({ type: TransactionType.TRANSFER_OUT });
      await seedExchangeTx({ type: TransactionType.TRANSFER_OUT });

      await runMatcher(RUN_ID, BASE_CONFIG);

      // User TRANSFER_OUT looks for exchange TRANSFER_IN counterpart — won't find TRANSFER_OUT
      const results = await getResults();
      const matched = results.find((r) => r.status === MatchStatus.MATCHED);
      expect(matched).toBeUndefined();
    });
  });

  describe('1-to-1 matching guarantee', () => {
    it('does not match one exchange transaction to two user transactions', async () => {
      const sharedTimestamp = new Date('2024-03-01T09:00:00Z');

      // Two identical user transactions competing for the same exchange transaction
      await seedUserTx({ originalId: 'USR-001', timestamp: sharedTimestamp });
      await seedUserTx({ originalId: 'USR-002', timestamp: sharedTimestamp });
      await seedExchangeTx({ originalId: 'EXC-1001', timestamp: sharedTimestamp });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      const matched = results.filter((r) => r.status === MatchStatus.MATCHED);

      // Only one user tx can be matched to the single exchange tx
      expect(matched).toHaveLength(1);
    });

    it('produces the correct total result count (matched + unmatched = total transactions)', async () => {
      const sharedTimestamp = new Date('2024-03-01T09:00:00Z');

      await seedUserTx({ originalId: 'USR-001', timestamp: sharedTimestamp });
      await seedUserTx({ originalId: 'USR-002', timestamp: sharedTimestamp });
      await seedExchangeTx({ originalId: 'EXC-1001', timestamp: sharedTimestamp });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      // 1 MATCHED + 1 UNMATCHED_USER + 1 exchange result already consumed = 3 total
      expect(results).toHaveLength(3);
    });
  });

  describe('Invalid row handling', () => {
    it('produces UNMATCHED_USER for an invalid user transaction (never silently dropped)', async () => {
      await seedUserTx({
        originalId: 'USR-BAD',
        ingestionStatus: IngestionStatus.INVALID,
        validationErrors: ['Invalid or missing timestamp: ""'],
      });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe(MatchStatus.UNMATCHED_USER);
      expect(results[0]?.reason).toContain('Invalid row');
    });

    it('produces UNMATCHED_EXCHANGE for an invalid exchange transaction', async () => {
      await seedExchangeTx({
        originalId: 'EXC-BAD',
        ingestionStatus: IngestionStatus.INVALID,
        validationErrors: ['Missing transaction_id'],
      });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      expect(results[0]?.status).toBe(MatchStatus.UNMATCHED_EXCHANGE);
    });
  });

  describe('Multiple transaction matching (realistic scenario)', () => {
    it('correctly matches multiple pairs in one run', async () => {
      const t1 = new Date('2024-03-01T09:00:00Z');
      const t2 = new Date('2024-03-01T11:30:00Z');

      await seedUserTx({ originalId: 'USR-001', asset: 'BTC', amount: '0.5', timestamp: t1 });
      await seedUserTx({ originalId: 'USR-002', asset: 'ETH', amount: '2.0', type: TransactionType.BUY, timestamp: t2 });
      await seedExchangeTx({ originalId: 'EXC-1001', asset: 'BTC', amount: '0.5', timestamp: t1 });
      await seedExchangeTx({ originalId: 'EXC-1002', asset: 'ETH', amount: '2.0', type: TransactionType.BUY, timestamp: t2 });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      const matched = results.filter((r) => r.status === MatchStatus.MATCHED);
      expect(matched).toHaveLength(2);
    });

    it('correctly identifies the unmatched exchange transaction in a mixed run', async () => {
      const t1 = new Date('2024-03-01T09:00:00Z');
      const t2 = new Date('2024-03-13T18:00:00Z'); // extra exchange tx — no user counterpart

      await seedUserTx({ originalId: 'USR-001', asset: 'BTC', amount: '0.5', timestamp: t1 });
      await seedExchangeTx({ originalId: 'EXC-1001', asset: 'BTC', amount: '0.5', timestamp: t1 });
      await seedExchangeTx({ originalId: 'EXC-EXTRA', asset: 'ETH', amount: '0.6', type: TransactionType.BUY, timestamp: t2 });

      await runMatcher(RUN_ID, BASE_CONFIG);

      const results = await getResults();
      const unmatched = results.filter((r) => r.status === MatchStatus.UNMATCHED_EXCHANGE);
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0]?.exchangeTransactionId).toBeDefined();
    });
  });
});
