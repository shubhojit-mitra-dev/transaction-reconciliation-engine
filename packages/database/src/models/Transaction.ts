import mongoose, { Schema, Document, Model } from 'mongoose';
import { TransactionSource, TransactionType, IngestionStatus, NormalizedTransaction } from '@repo/types';

export interface TransactionDocument extends Omit<NormalizedTransaction, 'timestamp'>, Document {
  timestamp: Date | null;
  runId: string;
}

const TransactionSchema = new Schema<TransactionDocument>(
  {
    runId: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(TransactionSource),
      required: true,
    },
    originalId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: null,
    },
    asset: {
      type: String,
      default: null,
      // uppercase: true is not a mongoose option; normalization happens in the engine layer
    },
    // Stored as String to avoid IEEE-754 floating-point precision loss.
    // All arithmetic is done via Decimal.js in the engine — never with JS Number.
    amount: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: [...Object.values(TransactionType), null],
      default: null,
    },
    rawData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    ingestionStatus: {
      type: String,
      enum: Object.values(IngestionStatus),
      required: true,
      default: IngestionStatus.VALID,
    },
    validationErrors: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Primary matching query: find exchange transactions within a time window
// for the same asset — this compound index makes that O(log n) instead of O(n).
TransactionSchema.index({ runId: 1, source: 1, asset: 1, timestamp: 1 });

// Secondary: fetch all valid transactions for a run by source
TransactionSchema.index({ runId: 1, source: 1, ingestionStatus: 1 });

export const TransactionModel: Model<TransactionDocument> = mongoose.model<TransactionDocument>(
  'Transaction',
  TransactionSchema,
);
