import { describe, it, expect } from 'vitest';
import { ingestCsv } from '../ingestion';
import { TransactionModel } from '@repo/database';
import { TransactionSource, IngestionStatus, TransactionType } from '@repo/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const VALID_USER_CSV = Buffer.from(
  [
    'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
    'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,Monthly DCA',
    'USR-002,2024-03-01T11:30:00Z,BUY,ETH,2.0,3400.00,0.002,',
    'USR-003,2024-03-02T08:15:00Z,SELL,BTC,0.1,63200.00,0.0001,Partial exit',
  ].join('\n'),
);

const CSV_WITH_ALIAS = Buffer.from(
  [
    'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
    // "bitcoin" should be normalised to "BTC"
    'USR-005,2024-03-03T10:00:00Z,BUY,bitcoin,0.25,61800.00,0.00025,',
  ].join('\n'),
);

const CSV_WITH_INVALID_ROWS = Buffer.from(
  [
    'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
    // Valid row
    'USR-010,2024-03-05T15:00:00Z,BUY,ETH,1.5,3500.00,0.0015,',
    // Missing timestamp
    'USR-018,2024-03-09T,SELL,ETH,0.3,3510.00,0.0003,Malformed timestamp',
    // Negative quantity
    'USR-019,2024-03-10T08:00:00Z,BUY,BTC,-0.1,62000.00,0.0001,Negative qty',
    // Missing transaction_id
    ',2024-03-10T09:00:00Z,BUY,BTC,0.1,62000.00,0.0001,No ID',
  ].join('\n'),
);

const CSV_WITH_DUPLICATE_ID = Buffer.from(
  [
    'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
    'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,First',
    // Same ID as above — duplicate within this file
    'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,Duplicate',
  ].join('\n'),
);

const RUN_ID = 'test-run-ingestion-001';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ingestCsv — integration', () => {
  describe('result counts', () => {
    it('reports the correct total/valid/invalid counts for a clean CSV', async () => {
      const result = await ingestCsv(VALID_USER_CSV, TransactionSource.USER, RUN_ID);

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);
    });

    it('correctly separates valid and invalid rows', async () => {
      const result = await ingestCsv(CSV_WITH_INVALID_ROWS, TransactionSource.USER, RUN_ID);

      expect(result.totalRows).toBe(4);
      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(3);
    });

    it('marks the duplicate row as invalid', async () => {
      const result = await ingestCsv(CSV_WITH_DUPLICATE_ID, TransactionSource.USER, RUN_ID);

      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(1);
    });
  });

  describe('database persistence', () => {
    it('persists all rows to the Transactions collection', async () => {
      await ingestCsv(VALID_USER_CSV, TransactionSource.USER, RUN_ID);

      const count = await TransactionModel.countDocuments({ runId: RUN_ID });
      expect(count).toBe(3);
    });

    it('stores the correct source on each document', async () => {
      await ingestCsv(VALID_USER_CSV, TransactionSource.EXCHANGE, RUN_ID);

      const docs = await TransactionModel.find({ runId: RUN_ID });
      expect(docs.every((d) => d.source === TransactionSource.EXCHANGE)).toBe(true);
    });

    it('stores the correct runId on every document', async () => {
      await ingestCsv(VALID_USER_CSV, TransactionSource.USER, RUN_ID);

      const docs = await TransactionModel.find({ runId: RUN_ID });
      expect(docs.every((d) => d.runId === RUN_ID)).toBe(true);
    });
  });

  describe('normalisation applied at ingestion', () => {
    it('normalises asset aliases to their canonical ticker (bitcoin → BTC)', async () => {
      await ingestCsv(CSV_WITH_ALIAS, TransactionSource.USER, RUN_ID);

      const doc = await TransactionModel.findOne({ runId: RUN_ID, originalId: 'USR-005' });
      expect(doc?.asset).toBe('BTC');
    });

    it('normalises the BUY type string correctly', async () => {
      await ingestCsv(VALID_USER_CSV, TransactionSource.USER, RUN_ID);

      const doc = await TransactionModel.findOne({ runId: RUN_ID, originalId: 'USR-001' });
      expect(doc?.type).toBe(TransactionType.BUY);
    });

    it('stores amount as a string (not a Number) to preserve precision', async () => {
      await ingestCsv(VALID_USER_CSV, TransactionSource.USER, RUN_ID);

      const doc = await TransactionModel.findOne({ runId: RUN_ID, originalId: 'USR-001' });
      expect(typeof doc?.amount).toBe('string');
      expect(doc?.amount).toBe('0.5');
    });
  });

  describe('invalid row handling', () => {
    it('marks a row with a malformed timestamp as INVALID', async () => {
      await ingestCsv(CSV_WITH_INVALID_ROWS, TransactionSource.USER, RUN_ID);

      const doc = await TransactionModel.findOne({ runId: RUN_ID, originalId: 'USR-018' });
      expect(doc?.ingestionStatus).toBe(IngestionStatus.INVALID);
      expect(doc?.validationErrors.length).toBeGreaterThan(0);
    });

    it('marks a row with a negative quantity as INVALID', async () => {
      await ingestCsv(CSV_WITH_INVALID_ROWS, TransactionSource.USER, RUN_ID);

      const doc = await TransactionModel.findOne({ runId: RUN_ID, originalId: 'USR-019' });
      expect(doc?.ingestionStatus).toBe(IngestionStatus.INVALID);
    });

    it('marks the duplicate row as INVALID and includes an error message', async () => {
      await ingestCsv(CSV_WITH_DUPLICATE_ID, TransactionSource.USER, RUN_ID);

      const docs = await TransactionModel.find({
        runId: RUN_ID,
        ingestionStatus: IngestionStatus.INVALID,
      });
      expect(docs).toHaveLength(1);
      expect(docs[0]?.validationErrors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('still persists an invalid row to the DB (never silently drops data)', async () => {
      await ingestCsv(CSV_WITH_INVALID_ROWS, TransactionSource.USER, RUN_ID);

      // 4 rows in the CSV → 4 documents in the DB regardless of validity
      const count = await TransactionModel.countDocuments({ runId: RUN_ID });
      expect(count).toBe(4);
    });
  });
});
