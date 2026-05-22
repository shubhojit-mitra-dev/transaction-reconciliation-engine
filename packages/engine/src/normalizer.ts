import { TransactionType } from '@repo/types';
import Decimal from 'decimal.js';

// ─────────────────────────────────────────────────────────────────────────────
// Asset Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps common asset name variants to their canonical ticker symbol.
 * Keys must be UPPERCASE. Add entries here as new aliases are discovered.
 */
const ASSET_ALIASES: Record<string, string> = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ETH',
  'ETHEREUM CLASSIC': 'ETC',
  LITECOIN: 'LTC',
  RIPPLE: 'XRP',
  SOLANA: 'SOL',
  CARDANO: 'ADA',
  DOGECOIN: 'DOGE',
  POLKADOT: 'DOT',
  AVALANCHE: 'AVAX',
  TETHER: 'USDT',
  'USD COIN': 'USDC',
  'BINANCE COIN': 'BNB',
};

/**
 * Normalizes a raw asset string to its canonical uppercase ticker.
 * e.g. "Bitcoin" → "BTC", " eth " → "ETH", "BTC" → "BTC"
 */
export function normalizeAsset(raw: string): string {
  const upper = raw.trim().toUpperCase();
  return ASSET_ALIASES[upper] ?? upper;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Type Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps raw type strings (from either CSV) to a canonical TransactionType.
 * The engine operates on a unified internal type perspective — perspective
 * remapping (TRANSFER_IN ↔ TRANSFER_OUT) is handled separately in the matcher.
 */
const TYPE_MAP: Record<string, TransactionType> = {
  BUY: TransactionType.BUY,
  PURCHASE: TransactionType.BUY,
  SELL: TransactionType.SELL,
  SALE: TransactionType.SELL,
  TRANSFER_IN: TransactionType.TRANSFER_IN,
  TRANSFERIN: TransactionType.TRANSFER_IN,
  'TRANSFER IN': TransactionType.TRANSFER_IN,
  DEPOSIT: TransactionType.DEPOSIT,
  TRANSFER_OUT: TransactionType.TRANSFER_OUT,
  TRANSFEROUT: TransactionType.TRANSFER_OUT,
  'TRANSFER OUT': TransactionType.TRANSFER_OUT,
  WITHDRAWAL: TransactionType.WITHDRAWAL,
  WITHDRAW: TransactionType.WITHDRAWAL,
};

/**
 * Normalizes a raw transaction type string to a canonical TransactionType.
 * Returns TransactionType.UNKNOWN if the value cannot be mapped.
 */
export function normalizeType(raw: string): TransactionType {
  const key = raw.trim().toUpperCase().replace(/-/g, '_');
  return TYPE_MAP[key] ?? TransactionType.UNKNOWN;
}

const UPPER_A = 65;
const UPPER_Z = 90;
const LOWER_A = 97;
const LOWER_Z = 122;

function isAsciiLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= UPPER_A && code <= UPPER_Z) || (code >= LOWER_A && code <= LOWER_Z);
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a raw amount string.
 * - Strips whitespace and currency symbols (e.g. "$", "USD")
 * - Strips thousands separators (commas)
 * - Returns the raw string for Decimal.js to parse — we do NOT convert to Number
 *
 * Returns null if the value is empty or non-numeric after cleaning.
 */
export function normalizeAmount(raw: string): string | null {
  let cleaned = raw
    .trim()
    .replace(/[$€£¥]/g, '') // strip currency symbols
    .trim();

  // Strip 3+ letter currency codes from the boundaries (for example, "USD 123.45"
  // or "123.45 EUR") while leaving scientific notation like "1.23e-5" intact.
  let leadingLetters = 0;
  while (leadingLetters < cleaned.length && isAsciiLetter(cleaned[leadingLetters])) {
    leadingLetters += 1;
  }

  if (leadingLetters >= 3) {
    cleaned = cleaned.slice(leadingLetters).trim();
  }

  let trailingStart = cleaned.length;
  while (trailingStart > 0 && isAsciiLetter(cleaned[trailingStart - 1])) {
    trailingStart -= 1;
  }

  if (cleaned.length - trailingStart >= 3) {
    cleaned = cleaned.slice(0, trailingStart).trim();
  }

  cleaned = cleaned.replace(/,/g, '').trim(); // strip thousands separators

  if (cleaned === '') {
    return null;
  }

  try {
    new Decimal(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a raw timestamp string into a Date object.
 * Returns null if the value is missing or cannot be parsed.
 *
 * The native Date constructor handles ISO 8601, Unix timestamps (ms),
 * and most common date string formats reliably enough for this use case.
 */
export function normalizeTimestamp(raw: string): Date | null {
  if (!raw || raw.trim() === '') return null;
  const parsed = new Date(raw.trim());
  return isNaN(parsed.getTime()) ? null : parsed;
}
