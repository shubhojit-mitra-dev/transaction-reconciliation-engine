import { ReconciliationConfig } from '@repo/types';

const DEFAULTS: ReconciliationConfig = {
  timestampToleranceSeconds: 300, // ±5 minutes
  quantityTolerancePct: 0.01,     // ±0.01%
};

function isValidTimestampTolerance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidQuantityTolerance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Resolves the final ReconciliationConfig for a run.
 *
 * Priority (highest to lowest):
 *   1. `overrides` — values passed directly on POST /reconcile request body
 *   2. Environment variables — TIMESTAMP_TOLERANCE_SECONDS, QUANTITY_TOLERANCE_PCT
 *   3. Hardcoded defaults — 300s, 0.01%
 *
 * This satisfies the requirement that tolerances are "configurable without
 * code changes" while still allowing per-run overrides for flexibility.
 */
export function resolveConfig(overrides?: Partial<ReconciliationConfig>): ReconciliationConfig {
  const fromEnv: Partial<ReconciliationConfig> = {};

  if (process.env['TIMESTAMP_TOLERANCE_SECONDS']) {
    const parsed = Number(process.env['TIMESTAMP_TOLERANCE_SECONDS']);
    if (isValidTimestampTolerance(parsed)) {
      fromEnv.timestampToleranceSeconds = parsed;
    }
  }

  if (process.env['QUANTITY_TOLERANCE_PCT']) {
    const parsed = Number(process.env['QUANTITY_TOLERANCE_PCT']);
    if (isValidQuantityTolerance(parsed)) {
      fromEnv.quantityTolerancePct = parsed;
    }
  }

  if (
    overrides?.timestampToleranceSeconds !== undefined &&
    !isValidTimestampTolerance(overrides.timestampToleranceSeconds)
  ) {
    throw new Error(
      'Invalid config override: timestampToleranceSeconds must be a finite number greater than 0',
    );
  }

  if (
    overrides?.quantityTolerancePct !== undefined &&
    !isValidQuantityTolerance(overrides.quantityTolerancePct)
  ) {
    throw new Error(
      'Invalid config override: quantityTolerancePct must be a finite number greater than or equal to 0',
    );
  }

  return {
    timestampToleranceSeconds:
      overrides?.timestampToleranceSeconds ??
      fromEnv.timestampToleranceSeconds ??
      DEFAULTS.timestampToleranceSeconds,

    quantityTolerancePct:
      overrides?.quantityTolerancePct ??
      fromEnv.quantityTolerancePct ??
      DEFAULTS.quantityTolerancePct,
  };
}
