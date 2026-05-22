import { ReconciliationStatus, ReconciliationConfig, TransactionSource } from '@repo/types';
import { ReconciliationRunModel } from '@repo/database';
import { logger } from '@repo/logger';
import { ingestCsv } from './ingestion';
import { runMatcher } from './matcher';
import { resolveConfig } from './config';

export interface ReconciliationPayload {
  userCsvBuffer: Buffer;
  exchangeCsvBuffer: Buffer;
  configOverrides?: Partial<ReconciliationConfig>;
}

export interface ReconciliationResponse {
  runId: string;
  status: ReconciliationStatus;
  message: string;
}

/**
 * Orchestrates the full reconciliation process:
 * 1. Creates a new PENDING run record in the database
 * 2. Ingests both CSV files, linking them to the runId
 * 3. Executes the matching engine
 * 4. Updates the run record to COMPLETED (or FAILED if an error occurs)
 *
 * This function returns quickly with a PENDING runId if we want to run
 * the actual heavy work asynchronously, but for this implementation
 * we await the entire process so the API layer can be simple.
 */
export async function executeReconciliation(
  payload: ReconciliationPayload,
): Promise<ReconciliationResponse> {
  const { userCsvBuffer, exchangeCsvBuffer, configOverrides } = payload;
  const config = resolveConfig(configOverrides);

  // ── 1. Initialize Run ────────────────────────────────────────────────────────
  const runRecord = await ReconciliationRunModel.create({
    status: ReconciliationStatus.PENDING,
    config,
  });
  const runId = String(runRecord._id);

  logger.info(`Initialized reconciliation run`, { runId, config });

  try {
    // Set to running
    await ReconciliationRunModel.updateOne(
      { _id: runRecord._id },
      { $set: { status: ReconciliationStatus.RUNNING } },
    );

    // ── 2. Ingestion ───────────────────────────────────────────────────────────
    logger.info(`Starting ingestion phase`, { runId });
    const userResult = await ingestCsv(userCsvBuffer, TransactionSource.USER, runId);
    const exchangeResult = await ingestCsv(exchangeCsvBuffer, TransactionSource.EXCHANGE, runId);

    // ── 3. Matching ────────────────────────────────────────────────────────────
    logger.info(`Starting matching phase`, { runId });
    await runMatcher(runId, config);

    // ── 4. Finalize ────────────────────────────────────────────────────────────
    // In a production app, we would aggregate the ReconciliationResult table
    // to populate the runRecord metrics here. For now, we just mark it complete.
    await ReconciliationRunModel.updateOne(
      { _id: runRecord._id },
      {
        $set: {
          status: ReconciliationStatus.COMPLETED,
          completedAt: new Date(),
        },
      },
    );

    logger.info(`Reconciliation run completed successfully`, { runId });

    return {
      runId,
      status: ReconciliationStatus.COMPLETED,
      message: 'Reconciliation completed successfully',
    };
  } catch (error) {
    logger.error(`Reconciliation run failed`, {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });

    await ReconciliationRunModel.updateOne(
      { _id: runRecord._id },
      {
        $set: {
          status: ReconciliationStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error during reconciliation',
          completedAt: new Date(),
        },
      },
    );

    return {
      runId,
      status: ReconciliationStatus.FAILED,
      message: 'Reconciliation failed. Check logs for details.',
    };
  }
}
