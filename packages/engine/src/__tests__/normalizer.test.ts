import { describe, it, expect } from 'vitest';
import { normalizeAsset, normalizeType, normalizeAmount, normalizeTimestamp } from '../normalizer';
import { TransactionType } from '@repo/types';

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAsset
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeAsset', () => {
  it('returns the ticker unchanged when already canonical', () => {
    expect(normalizeAsset('BTC')).toBe('BTC');
    expect(normalizeAsset('ETH')).toBe('ETH');
  });

  it('uppercases a lowercase ticker', () => {
    expect(normalizeAsset('btc')).toBe('BTC');
    expect(normalizeAsset('eth')).toBe('ETH');
  });

  it('maps a full name alias to its ticker', () => {
    expect(normalizeAsset('Bitcoin')).toBe('BTC');
    expect(normalizeAsset('bitcoin')).toBe('BTC');
    expect(normalizeAsset('BITCOIN')).toBe('BTC');
    expect(normalizeAsset('Ethereum')).toBe('ETH');
    expect(normalizeAsset('Solana')).toBe('SOL');
  });

  it('trims surrounding whitespace before mapping', () => {
    expect(normalizeAsset('  Bitcoin  ')).toBe('BTC');
    expect(normalizeAsset(' BTC ')).toBe('BTC');
  });

  it('returns the uppercased value for an unknown asset', () => {
    // Unknown assets are uppercased and returned as-is (MATIC, LINK, etc.)
    expect(normalizeAsset('matic')).toBe('MATIC');
    expect(normalizeAsset('LINK')).toBe('LINK');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeType
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeType', () => {
  it('maps canonical types correctly', () => {
    expect(normalizeType('BUY')).toBe(TransactionType.BUY);
    expect(normalizeType('SELL')).toBe(TransactionType.SELL);
    expect(normalizeType('TRANSFER_IN')).toBe(TransactionType.TRANSFER_IN);
    expect(normalizeType('TRANSFER_OUT')).toBe(TransactionType.TRANSFER_OUT);
    expect(normalizeType('DEPOSIT')).toBe(TransactionType.DEPOSIT);
    expect(normalizeType('WITHDRAWAL')).toBe(TransactionType.WITHDRAWAL);
  });

  it('maps aliases to the correct canonical type', () => {
    expect(normalizeType('PURCHASE')).toBe(TransactionType.BUY);
    expect(normalizeType('SALE')).toBe(TransactionType.SELL);
    expect(normalizeType('TRANSFERIN')).toBe(TransactionType.TRANSFER_IN);
    expect(normalizeType('TRANSFER IN')).toBe(TransactionType.TRANSFER_IN);
    expect(normalizeType('TRANSFEROUT')).toBe(TransactionType.TRANSFER_OUT);
    expect(normalizeType('TRANSFER OUT')).toBe(TransactionType.TRANSFER_OUT);
    expect(normalizeType('WITHDRAW')).toBe(TransactionType.WITHDRAWAL);
  });

  it('is case-insensitive', () => {
    expect(normalizeType('buy')).toBe(TransactionType.BUY);
    expect(normalizeType('Sell')).toBe(TransactionType.SELL);
  });

  it('returns UNKNOWN for an unrecognised type', () => {
    expect(normalizeType('')).toBe(TransactionType.UNKNOWN);
    expect(normalizeType('SWAP')).toBe(TransactionType.UNKNOWN);
    expect(normalizeType('???')).toBe(TransactionType.UNKNOWN);
  });

  it('normalises hyphens to underscores before lookup', () => {
    expect(normalizeType('TRANSFER-IN')).toBe(TransactionType.TRANSFER_IN);
    expect(normalizeType('TRANSFER-OUT')).toBe(TransactionType.TRANSFER_OUT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeAmount', () => {
  it('returns a plain numeric string unchanged', () => {
    expect(normalizeAmount('0.5')).toBe('0.5');
    expect(normalizeAmount('100')).toBe('100');
  });

  it('strips currency symbols', () => {
    expect(normalizeAmount('$1000.00')).toBe('1000.00');
    expect(normalizeAmount('€500')).toBe('500');
    expect(normalizeAmount('£250.5')).toBe('250.5');
  });

  it('strips 3-letter currency codes from the start', () => {
    expect(normalizeAmount('USD 123.45')).toBe('123.45');
  });

  it('strips 3-letter currency codes from the end', () => {
    expect(normalizeAmount('123.45 EUR')).toBe('123.45');
  });

  it('strips thousands separators', () => {
    expect(normalizeAmount('1,000,000.00')).toBe('1000000.00');
  });

  it('handles scientific notation (crypto sub-satoshi amounts)', () => {
    expect(normalizeAmount('1.23e-5')).toBe('1.23e-5');
  });

  it('returns null for an empty string', () => {
    expect(normalizeAmount('')).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    expect(normalizeAmount('not-a-number')).toBeNull();
    expect(normalizeAmount('abc')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAmount('  0.5  ')).toBe('0.5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTimestamp
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTimestamp', () => {
  it('parses a valid ISO 8601 string into a Date', () => {
    const result = normalizeTimestamp('2024-03-01T09:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2024-03-01T09:00:00.000Z');
  });

  it('returns null for an empty string', () => {
    expect(normalizeTimestamp('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(normalizeTimestamp('   ')).toBeNull();
  });

  it('returns null for a malformed timestamp like the one in the test data', () => {
    // USR-018 has "2024-03-09T" — no time component, invalid ISO string
    expect(normalizeTimestamp('2024-03-09T')).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    const result = normalizeTimestamp('  2024-03-01T09:00:00Z  ');
    expect(result).toBeInstanceOf(Date);
  });
});
