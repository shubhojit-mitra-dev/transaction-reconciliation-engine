import mongoose, { Schema, Document, Model } from 'mongoose';
import { ReconciliationStatus, ReconciliationConfig, RunMetrics } from '@repo/types';

export interface ReconciliationRunDocument extends Document {
  status: ReconciliationStatus;
  config: ReconciliationConfig;
  metrics?: RunMetrics;
  errorMessage?: string;
  completedAt?: Date;
}

const ReconciliationRunSchema = new Schema<ReconciliationRunDocument>(
  {
    status: {
      type: String,
      enum: Object.values(ReconciliationStatus),
      required: true,
      default: ReconciliationStatus.PENDING,
      index: true,
    },
    config: {
      timestampToleranceSeconds: { type: Number, required: true },
      quantityTolerancePct: { type: Number, required: true },
    },
    // Populated atomically when the run completes — null until then
    metrics: {
      totalUser: Number,
      totalExchange: Number,
      matched: Number,
      conflicting: Number,
      unmatchedUser: Number,
      unmatchedExchange: Number,
      invalidUser: Number,
      invalidExchange: Number,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = run trigger time
    versionKey: false,
  },
);

export const ReconciliationRunModel: Model<ReconciliationRunDocument> =
  mongoose.model<ReconciliationRunDocument>('ReconciliationRun', ReconciliationRunSchema);
