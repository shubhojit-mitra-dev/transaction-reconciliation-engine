import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save and restore env vars around each test so they don't bleed across tests.
 */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, val] of Object.entries(original)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  // Clear any env vars that could leak from the test environment
  beforeEach(() => {
    delete process.env['TIMESTAMP_TOLERANCE_SECONDS'];
    delete process.env['QUANTITY_TOLERANCE_PCT'];
  });

  afterEach(() => {
    delete process.env['TIMESTAMP_TOLERANCE_SECONDS'];
    delete process.env['QUANTITY_TOLERANCE_PCT'];
  });

  describe('defaults', () => {
    it('returns the hardcoded defaults when no env vars or overrides are present', () => {
      const config = resolveConfig();
      expect(config.timestampToleranceSeconds).toBe(300);
      expect(config.quantityTolerancePct).toBe(0.01);
    });
  });

  describe('environment variable resolution', () => {
    it('picks up TIMESTAMP_TOLERANCE_SECONDS from the environment', () => {
      withEnv({ TIMESTAMP_TOLERANCE_SECONDS: '600' }, () => {
        const config = resolveConfig();
        expect(config.timestampToleranceSeconds).toBe(600);
        expect(config.quantityTolerancePct).toBe(0.01); // default unchanged
      });
    });

    it('picks up QUANTITY_TOLERANCE_PCT from the environment', () => {
      withEnv({ QUANTITY_TOLERANCE_PCT: '0.05' }, () => {
        const config = resolveConfig();
        expect(config.quantityTolerancePct).toBe(0.05);
        expect(config.timestampToleranceSeconds).toBe(300); // default unchanged
      });
    });

    it('ignores an invalid (non-finite) TIMESTAMP_TOLERANCE_SECONDS env var', () => {
      withEnv({ TIMESTAMP_TOLERANCE_SECONDS: 'not-a-number' }, () => {
        const config = resolveConfig();
        // Falls back to the hardcoded default
        expect(config.timestampToleranceSeconds).toBe(300);
      });
    });

    it('ignores a non-positive TIMESTAMP_TOLERANCE_SECONDS env var', () => {
      withEnv({ TIMESTAMP_TOLERANCE_SECONDS: '0' }, () => {
        const config = resolveConfig();
        expect(config.timestampToleranceSeconds).toBe(300);
      });
    });

    it('ignores an invalid QUANTITY_TOLERANCE_PCT env var', () => {
      withEnv({ QUANTITY_TOLERANCE_PCT: 'abc' }, () => {
        const config = resolveConfig();
        expect(config.quantityTolerancePct).toBe(0.01);
      });
    });
  });

  describe('override resolution', () => {
    it('applies a valid override for timestampToleranceSeconds', () => {
      const config = resolveConfig({ timestampToleranceSeconds: 120 });
      expect(config.timestampToleranceSeconds).toBe(120);
    });

    it('applies a valid override for quantityTolerancePct', () => {
      const config = resolveConfig({ quantityTolerancePct: 0.5 });
      expect(config.quantityTolerancePct).toBe(0.5);
    });

    it('allows quantityTolerancePct to be exactly 0 (strict match mode)', () => {
      const config = resolveConfig({ quantityTolerancePct: 0 });
      expect(config.quantityTolerancePct).toBe(0);
    });

    it('throws on an invalid timestampToleranceSeconds override', () => {
      expect(() => resolveConfig({ timestampToleranceSeconds: -1 })).toThrow();
      expect(() => resolveConfig({ timestampToleranceSeconds: 0 })).toThrow();
      expect(() => resolveConfig({ timestampToleranceSeconds: Infinity })).toThrow();
    });

    it('throws on an invalid quantityTolerancePct override', () => {
      expect(() => resolveConfig({ quantityTolerancePct: -1 })).toThrow();
      expect(() => resolveConfig({ quantityTolerancePct: NaN })).toThrow();
    });

    it('overrides take priority over env vars (highest precedence)', () => {
      withEnv({ TIMESTAMP_TOLERANCE_SECONDS: '600' }, () => {
        const config = resolveConfig({ timestampToleranceSeconds: 60 });
        // Override (60) wins over env var (600)
        expect(config.timestampToleranceSeconds).toBe(60);
      });
    });
  });
});
