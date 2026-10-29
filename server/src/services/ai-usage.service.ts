import { AiUsageModel, IAiUsage } from "../models/ai-usage.model";

export async function recordUsage(row: IAiUsage): Promise<void> {
  try {
    await AiUsageModel.create(row);
  } catch (err) {
    // Usage is bookkeeping: losing one row must never fail the trader's request.
    console.error("Failed to record AI usage:", err);
  }
}

export interface UsageTotals {
  requests: number;
  failed: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Requests whose response carried no token counts: their tokens are unknown, not zero. */
  unreported: number;
}

export interface UsageReport {
  days: number;
  totals: UsageTotals;
  byDay: (UsageTotals & { date: string })[];
}

const TOTALS = {
  requests: { $sum: 1 },
  failed: { $sum: { $cond: ["$ok", 0, 1] } },
  calls: { $sum: "$calls" },
  promptTokens: { $sum: "$promptTokens" },
  completionTokens: { $sum: "$completionTokens" },
  totalTokens: { $sum: "$totalTokens" },
  unreported: { $sum: { $cond: ["$usageReported", 0, 1] } },
};

const EMPTY: UsageTotals = {
  requests: 0, failed: 0, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, unreported: 0,
};

/** Assistant spend over the last `days` days (UTC), overall and per day. */
export async function getUsageReport(days: number): Promise<UsageReport> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [totals, byDay] = await Promise.all([
    AiUsageModel.aggregate<UsageTotals>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, ...TOTALS } },
      { $project: { _id: 0 } },
    ]),
    AiUsageModel.aggregate<UsageTotals & { date: string }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, ...TOTALS } },
      { $sort: { _id: -1 } },
      { $project: { _id: 0, date: "$_id", requests: 1, failed: 1, calls: 1, promptTokens: 1, completionTokens: 1, totalTokens: 1, unreported: 1 } },
    ]),
  ]);

  return { days, totals: totals[0] ?? EMPTY, byDay };
}
