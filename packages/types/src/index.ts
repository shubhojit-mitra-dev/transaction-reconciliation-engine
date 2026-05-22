// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export enum TransactionSource {
  USER = 'USER',
  EXCHANGE = 'EXCHANGE',
}

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  UNKNOWN = 'UNKNOWN',
}

export enum IngestionStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
}

export enum ReconciliationStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum MatchStatus {
  MATCHED = 'MATCHED',
  CONFLICTING = 'CONFLICTING',
  UNMATCHED_USER = 'UNMATCHED_USER',
  UNMATCHED_EXCHANGE = 'UNMATCHED_EXCHANGE',
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Data Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw row as parsed directly from a CSV before any normalization.
 * All values are strings — CSVs have no type system.
 */
export interface RawTransactionRow {
  [key: string]: string | undefined;
}

/**
 * A fully normalized, database-ready transaction.
 *
 * `amount` is intentionally stored as a string to preserve decimal precision.
 * All arithmetic MUST be performed using Decimal.js in the engine layer —
 * never with native JS Number, which cannot represent crypto quantities exactly.
 */
export interface NormalizedTransaction {
  source: TransactionSource;
  originalId: string;
  timestamp: Date | null; // null for invalid/unparseable rows
  asset: string;          // Always uppercase, e.g. 'BTC'
  amount: string;         // String-encoded decimal, e.g. '0.00512300'
  type: TransactionType;
  rawData: RawTransactionRow;
  ingestionStatus: IngestionStatus;
  validationErrors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matching tolerances for a reconciliation run.
 * Configurable via ENV vars, a config file, or POST /reconcile request body.
 */
export interface ReconciliationConfig {
  /** Max allowable timestamp difference in seconds. Default: 300 */
  timestampToleranceSeconds: number;
  /**
   * Max allowable quantity difference as a percentage.
   * 0.01 means 0.01% (not 1%). Default: 0.01
   */
  quantityTolerancePct: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run Metrics & Results
// ─────────────────────────────────────────────────────────────────────────────

export interface RunMetrics {
  totalUser: number;
  totalExchange: number;
  matched: number;
  conflicting: number;
  unmatchedUser: number;
  unmatchedExchange: number;
  invalidUser: number;
  invalidExchange: number;
}

export interface ReconciliationResult {
  runId: string;
  status: MatchStatus;
  reason: string;
  userTransactionId?: string;
  exchangeTransactionId?: string;
}
