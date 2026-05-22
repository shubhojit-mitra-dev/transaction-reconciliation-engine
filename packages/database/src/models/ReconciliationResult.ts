import mongoose, { Schema, Document, Model } from 'mongoose';
import { MatchStatus } from '@repo/types';

export interface ReconciliationResultDocument extends Document {
  runId: string;
  status: MatchStatus;
  reason: string;
  userTransactionId?: string | null;
  exchangeTransactionId?: string | null;
}

const ReconciliationResultSchema = new Schema<ReconciliationResultDocument>(
  {
    runId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MatchStatus),
      required: true,
    },
    // Human-readable explanation of why this categorization was assigned.
    // Examples: "Exact match on ID", "Quantity diff 0.05% exceeds 0.01% tolerance"
    reason: {
      type: String,
      required: true,
    },
    // Both sides are optional — UNMATCHED rows will only have one side populated
    userTransactionId: {
      type: String,
      default: null,
    },
    exchangeTransactionId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Primary access pattern: fetch all results for a run (report endpoint)
ReconciliationResultSchema.index({ runId: 1 });

// Secondary: filter results by status within a run (unmatched endpoint)
ReconciliationResultSchema.index({ runId: 1, status: 1 });

export const ReconciliationResultModel: Model<ReconciliationResultDocument> =
  mongoose.model<ReconciliationResultDocument>('ReconciliationResult', ReconciliationResultSchema);
