import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ReconciliationResultModel, ReconciliationRunModel } from '@repo/database';
import { MatchStatus } from '@repo/types';

const reportRouter: Router = Router();

/**
 * Validates that a given string is a valid MongoDB ObjectId.
 * Returns a 400 response if not.
 */
function validateRunId(runId: string, res: Response): boolean {
  if (!mongoose.Types.ObjectId.isValid(runId)) {
    res.status(400).json({ error: 'Invalid runId format' });
    return false;
  }
  return true;
}

/**
 * GET /report/:runId
 * Returns a paginated list of all reconciliation results for a given run.
 */
reportRouter.get('/:runId', async (req: Request, res: Response) => {
  const { runId } = req.params;
  if (!validateRunId(runId, res)) return;

  const pageParam = parseInt(String(req.query.page ?? '1'), 10);
  const limitParam = parseInt(String(req.query.limit ?? '20'), 10);

  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const limitRaw = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;
  const limit = Math.min(100, limitRaw);
  const skip = (page - 1) * limit;

  try {
    const [data, total] = await Promise.all([
      ReconciliationResultModel.find({ runId })
        .sort({ createdAt: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReconciliationResultModel.countDocuments({ runId }),
    ]);

    res.status(200).json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve report' });
  }
});

/**
 * GET /report/:runId/summary
 * Returns aggregated metrics for the run.
 */
reportRouter.get('/:runId/summary', async (req: Request, res: Response) => {
  const { runId } = req.params;
  if (!validateRunId(runId, res)) return;

  try {
    const [run, counts] = await Promise.all([
      ReconciliationRunModel.findById(runId).lean(),
      ReconciliationResultModel.aggregate([
        { $match: { runId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    if (!run) return res.status(404).json({ error: 'Run not found' });

    const summary: Record<string, number> = {
      totalProcessed: 0,
      matched: 0,
      conflicting: 0,
      unmatchedUser: 0,
      unmatchedExchange: 0,
    };

    for (const { _id, count } of counts) {
      summary.totalProcessed += count;
      if (_id === MatchStatus.MATCHED) summary.matched = count;
      if (_id === MatchStatus.CONFLICTING) summary.conflicting = count;
      if (_id === MatchStatus.UNMATCHED_USER) summary.unmatchedUser = count;
      if (_id === MatchStatus.UNMATCHED_EXCHANGE) summary.unmatchedExchange = count;
    }

    res.status(200).json({ runId, status: run.status, ...summary });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve summary' });
  }
});

/**
 * GET /report/:runId/unmatched
 * Returns only unmatched transactions (UNMATCHED_USER or UNMATCHED_EXCHANGE).
 */
reportRouter.get('/:runId/unmatched', async (req: Request, res: Response) => {
  const { runId } = req.params;
  if (!validateRunId(runId, res)) return;

  try {
    const data = await ReconciliationResultModel.find({
      runId,
      status: { $in: [MatchStatus.UNMATCHED_USER, MatchStatus.UNMATCHED_EXCHANGE] },
    }).lean();

    res.status(200).json({ data });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve unmatched results' });
  }
});

export { reportRouter };
