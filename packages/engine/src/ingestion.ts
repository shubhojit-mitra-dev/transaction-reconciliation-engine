import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { TransactionSource, IngestionStatus, RawTransactionRow } from '@repo/types';
import { TransactionModel } from '@repo/database';
import { logger } from '@repo/logger';
import { normalizeAsset, normalizeType, normalizeAmount, normalizeTimestamp } from './normalizer';

const BATCH_SIZE = 500;

export interface IngestionResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

/**
 * Ingests a CSV buffer into the database, associated with a given run.
 *
 * Design decisions:
 * - Streaming via csv-parse: handles large files without loading them into memory.
 * - Batch inserts (500 rows): prevents overwhelming MongoDB with individual writes.
 * - Never throws on a bad row: all errors are captured into validationErrors
 *   and the row is stored with ingestionStatus: INVALID.
 *
 * @param csvBuffer - Raw CSV file content
 * @param source    - Whether this is the USER or EXCHANGE file
 * @param runId     - The reconciliation run this ingestion belongs to
 */
export async function ingestCsv(
  csvBuffer: Buffer,
  source: TransactionSource,
  runId: string,
): Promise<IngestionResult> {
  logger.info(`Starting CSV ingestion`, { source, runId });

  const result: IngestionResult = { totalRows: 0, validRows: 0, invalidRows: 0 };
  const batch: object[] = [];

  const seenIds = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const stream = Readable.from(csvBuffer);

    stream
      .pipe(
        parse({
          columns: true,        // Use first row as column names
          skip_empty_lines: true,
          trim: true,           // Trim whitespace from all values
          relax_column_count: true, // Don't throw on rows with mismatched column count
        }),
      )
      .on('data', async (rawRow: RawTransactionRow) => {
        result.totalRows++;

        const validationErrors: string[] = [];

        // ── Field extraction ─────────────────────────────────────────────────
        const originalId = (rawRow['transaction_id'] ?? '').trim();
        const rawTimestamp = rawRow['timestamp'] ?? '';
        const rawType = rawRow['type'] ?? '';
        const rawAsset = rawRow['asset'] ?? '';
        const rawAmount = rawRow['quantity'] ?? '';

        // ── Validation ───────────────────────────────────────────────────────
        if (!originalId) {
          validationErrors.push('Missing transaction_id');
        }

        // Duplicate detection within this file
        if (originalId && seenIds.has(originalId)) {
          validationErrors.push(`Duplicate transaction_id: ${originalId}`);
        } else if (originalId) {
          seenIds.add(originalId);
        }

        const timestamp = normalizeTimestamp(rawTimestamp);
        if (!timestamp) {
          validationErrors.push(`Invalid or missing timestamp: "${rawTimestamp}"`);
        }

        const asset = rawAsset ? normalizeAsset(rawAsset) : null;
        if (!asset) {
          validationErrors.push('Missing asset');
        }

        const amount = rawAmount ? normalizeAmount(rawAmount) : null;
        if (amount === null) {
          validationErrors.push(`Invalid or missing quantity: "${rawAmount}"`);
        } else if (parseFloat(amount) < 0) {
          validationErrors.push(`Negative quantity is invalid: "${amount}"`);
        }

        const type = rawType ? normalizeType(rawType) : null;
        // We don't fail on unknown type — UNKNOWN is a valid enum value

        const isValid = validationErrors.length === 0;

        if (!isValid) {
          logger.warn(`Invalid row detected`, {
            source,
            runId,
            originalId: originalId || '(missing)',
            errors: validationErrors,
          });
        }

        // ── Build document ───────────────────────────────────────────────────
        batch.push({
          runId,
          source,
          originalId: originalId || `MISSING_ID_ROW_${result.totalRows}`,
          timestamp: timestamp ?? null,
          asset: asset ?? 'UNKNOWN',
          amount: amount ?? '0',
          type,
          rawData: rawRow,
          ingestionStatus: isValid ? IngestionStatus.VALID : IngestionStatus.INVALID,
          validationErrors,
        });

        isValid ? result.validRows++ : result.invalidRows++;

        // ── Flush batch ──────────────────────────────────────────────────────
        if (batch.length >= BATCH_SIZE) {
          const toInsert = batch.splice(0, BATCH_SIZE);
          await TransactionModel.insertMany(toInsert, { ordered: false });
        }
      })
      .on('error', (err) => {
        logger.error('CSV parse error', { source, runId, error: err.message });
        reject(err);
      })
      .on('end', async () => {
        // Flush remaining rows
        if (batch.length > 0) {
          await TransactionModel.insertMany(batch, { ordered: false });
        }

        logger.info('CSV ingestion complete', {
          source,
          runId,
          ...result,
        });

        resolve();
      });
  });

  return result;
}
