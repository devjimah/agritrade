import { z } from "zod";
import { TransactionDocument, TransactionModel } from "../models/transaction.model";
import { TRANSACTION_TYPES } from "../types";

export const listTransactionsQuerySchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export interface TransactionListResult {
  transactions: TransactionDocument[];
  total: number;
  page: number;
  pages: number;
}

/** Read-only view over the append-only ledger. */
export async function listTransactions(
  query: ListTransactionsQuery
): Promise<TransactionListResult> {
  const filter = query.type ? { type: query.type } : {};

  const [transactions, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    transactions,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
