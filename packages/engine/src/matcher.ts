import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import {
  TransactionType,
  MatchStatus,
  ReconciliationConfig,
  TransactionSource,
  IngestionStatus,
} from '@repo/types';
import { TransactionDocument, TransactionModel, ReconciliationResultModel } from '@repo/database';
import { logger } from '@repo/logger';

// .lean() strips Mongoose Document internals and returns plain objects.
// This type accurately represents what lean() returns so we avoid unsafe casts.
type LeanTransaction = mongoose.FlattenMaps<TransactionDocument> &
  Required<{ _id: mongoose.Types.ObjectId }>;

// ─────────────────────────────────────────────────────────────────────────────
// Perspective Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a transaction type to its counterpart from the opposite perspective.
 * A USER's TRANSFER_OUT and an EXCHANGE's TRANSFER_IN describe the same event.
 */
const PERSPECTIVE_COUNTERPART: Partial<Record<TransactionType, TransactionType>> = {
  [TransactionType.TRANSFER_OUT]: TransactionType.TRANSFER_IN,
  [TransactionType.TRANSFER_IN]: TransactionType.TRANSFER_OUT,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildIndexKey(asset: string, type: TransactionType): string {
  return `${asset}__${type}`;
}

/**
 * Calculates the absolute percentage difference between two decimal amounts.
 * Uses Decimal.js to avoid IEEE-754 precision errors.
 * Returns Infinity if the base amount is zero.
 */
function quantityDiffPct(a: string, b: string): number {
  const decA = new Decimal(a);
  const decB = new Decimal(b);
  if (decA.isZero()) return Infinity;
  return decA.minus(decB).abs().div(decA).times(100).toNumber();
}

/**
 * Returns the absolute timestamp difference in seconds between two dates.
 */
function timestampDiffSeconds(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Matching Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full matching pass for a reconciliation run and persists results.
 *
 * Algorithm:
 *   1. Load all VALID transactions for the run from MongoDB (2 queries total).
 *   2. Build an in-memory index of exchange transactions, keyed by (asset, type).
 *      Exchange transactions are also indexed under their perspective counterpart
 *      so USER TRANSFER_OUT candidates include EXCHANGE TRANSFER_IN entries.
 *   3. For each valid USER transaction, find the best exchange candidate:
 *      - Must be within the timestamp tolerance window
 *      - Must not already be matched (1-to-1 guarantee via matchedExchangeIds Set)
 *      - Pick candidate with smallest quantity difference
 *      - If qty diff ≤ tolerance → MATCHED
 *      - If candidates exist but all exceed qty tolerance → CONFLICTING
 *      - If no candidates at all → UNMATCHED_USER
 *   4. All unmatched VALID exchange transactions → UNMATCHED_EXCHANGE
 *   5. All INVALID transactions on either side → UNMATCHED with validation reason
 *
 * Results are bulk-inserted into ReconciliationResult in a single call.
 */
export async function runMatcher(
  runId: string,
  config: ReconciliationConfig,
): Promise<void> {
  logger.info('Starting matching pass', { runId, config });

  // ── Step 1: Load transactions ──────────────────────────────────────────────
  const [validUserTxs, validExchangeTxs, invalidUserTxs, invalidExchangeTxs] = await Promise.all([
    TransactionModel.find({
      runId,
      source: TransactionSource.USER,
      ingestionStatus: IngestionStatus.VALID,
    }).lean(),
    TransactionModel.find({
      runId,
      source: TransactionSource.EXCHANGE,
      ingestionStatus: IngestionStatus.VALID,
    }).lean(),
    TransactionModel.find({
      runId,
      source: TransactionSource.USER,
      ingestionStatus: IngestionStatus.INVALID,
    }).lean(),
    TransactionModel.find({
      runId,
      source: TransactionSource.EXCHANGE,
      ingestionStatus: IngestionStatus.INVALID,
    }).lean(),
  ]);

  logger.info('Transactions loaded', {
    runId,
    validUser: validUserTxs.length,
    validExchange: validExchangeTxs.length,
    invalidUser: invalidUserTxs.length,
    invalidExchange: invalidExchangeTxs.length,
  });

  // ── Step 2: Build exchange index ───────────────────────────────────────────
  // Map<indexKey, LeanTransaction[]>
  // Each exchange transaction is indexed under its own type key AND its
  // perspective counterpart key so user-side lookups find it in either case.
  const exchangeIndex = new Map<string, LeanTransaction[]>();
  const allExchangeIds = new Set<string>();

  for (const tx of validExchangeTxs) {
    const type = tx.type as TransactionType;
    allExchangeIds.add(String(tx._id));

    // Index under own type
    const ownKey = buildIndexKey(tx.asset, type);
    if (!exchangeIndex.has(ownKey)) exchangeIndex.set(ownKey, []);
    exchangeIndex.get(ownKey)!.push(tx);

    // Index under perspective counterpart (if applicable)
    const counterpart = PERSPECTIVE_COUNTERPART[type];
    if (counterpart) {
      const flipKey = buildIndexKey(tx.asset, counterpart);
      if (!exchangeIndex.has(flipKey)) exchangeIndex.set(flipKey, []);
      exchangeIndex.get(flipKey)!.push(tx);
    }
  }

  // ── Step 3: Match valid user transactions ──────────────────────────────────
  const matchedExchangeIds = new Set<string>();
  const results: object[] = [];

  const { timestampToleranceSeconds, quantityTolerancePct } = config;

  for (const userTx of validUserTxs) {
    const userType = userTx.type as TransactionType;
    const candidates = exchangeIndex.get(buildIndexKey(userTx.asset, userType)) ?? [];

    // Filter: within time window AND not already matched
    const timeWindowMs = timestampToleranceSeconds * 1000;
    const userTime = userTx.timestamp!.getTime();

    const eligible = candidates.filter((exc) => {
      if (matchedExchangeIds.has(String(exc._id))) return false;
      const diff = Math.abs(exc.timestamp!.getTime() - userTime);
      return diff <= timeWindowMs;
    });

    if (eligible.length === 0) {
      results.push({
        runId,
        status: MatchStatus.UNMATCHED_USER,
        reason: `No exchange transaction found within ±${timestampToleranceSeconds}s for asset ${userTx.asset} type ${userType}`,
        userTransactionId: String(userTx._id),
        exchangeTransactionId: null,
      });
      continue;
    }

    // Pick the candidate with the smallest quantity difference
    let bestCandidate: LeanTransaction | null = null;
    let bestQtyDiff = Infinity;

    for (const candidate of eligible) {
      const diff = quantityDiffPct(userTx.amount, candidate.amount);
      if (diff < bestQtyDiff) {
        bestQtyDiff = diff;
        bestCandidate = candidate;
      }
    }

    const timeDiff = timestampDiffSeconds(userTx.timestamp!, bestCandidate!.timestamp!);
    const excId = String(bestCandidate!._id);

    if (bestQtyDiff <= quantityTolerancePct) {
      matchedExchangeIds.add(excId);
      results.push({
        runId,
        status: MatchStatus.MATCHED,
        reason: `Matched: qty diff ${bestQtyDiff.toFixed(6)}% ≤ ${quantityTolerancePct}%, timestamp diff ${timeDiff.toFixed(1)}s`,
        userTransactionId: String(userTx._id),
        exchangeTransactionId: excId,
      });
    } else {
      // Candidates exist in time window but quantity is too far off
      matchedExchangeIds.add(excId); // still consume the best candidate to prevent re-matching
      results.push({
        runId,
        status: MatchStatus.CONFLICTING,
        reason: `Conflicting: qty diff ${bestQtyDiff.toFixed(6)}% exceeds ${quantityTolerancePct}% tolerance (user: ${userTx.amount}, exchange: ${bestCandidate!.amount})`,
        userTransactionId: String(userTx._id),
        exchangeTransactionId: excId,
      });
    }
  }

  // ── Step 4: Unmatched valid exchange transactions ──────────────────────────
  for (const excTx of validExchangeTxs) {
    const excId = String(excTx._id);
    if (matchedExchangeIds.has(excId)) continue;
    results.push({
      runId,
      status: MatchStatus.UNMATCHED_EXCHANGE,
      reason: `No matching user transaction found for asset ${excTx.asset} type ${excTx.type} at ${excTx.timestamp?.toISOString()}`,
      userTransactionId: null,
      exchangeTransactionId: excId,
    });
  }

  // ── Step 5: Invalid rows ───────────────────────────────────────────────────
  for (const tx of invalidUserTxs) {
    results.push({
      runId,
      status: MatchStatus.UNMATCHED_USER,
      reason: `Invalid row — skipped matching. Errors: ${tx.validationErrors.join('; ')}`,
      userTransactionId: String(tx._id),
      exchangeTransactionId: null,
    });
  }

  for (const tx of invalidExchangeTxs) {
    results.push({
      runId,
      status: MatchStatus.UNMATCHED_EXCHANGE,
      reason: `Invalid row — skipped matching. Errors: ${tx.validationErrors.join('; ')}`,
      userTransactionId: null,
      exchangeTransactionId: String(tx._id),
    });
  }

  // ── Persist results ────────────────────────────────────────────────────────
  await ReconciliationResultModel.insertMany(results, { ordered: false });

  logger.info('Matching complete', {
    runId,
    matched: results.filter((r: any) => r.status === MatchStatus.MATCHED).length,
    conflicting: results.filter((r: any) => r.status === MatchStatus.CONFLICTING).length,
    unmatchedUser: results.filter((r: any) => r.status === MatchStatus.UNMATCHED_USER).length,
    unmatchedExchange: results.filter((r: any) => r.status === MatchStatus.UNMATCHED_EXCHANGE).length,
  });
}
