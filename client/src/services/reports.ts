import { api } from "./api";
import type { InventoryItem } from "./inventory";

export interface DashboardReport {
  counts: { farmers: number; customers: number };
  inventory: InventoryItem[];
  /** Integer pesewas. */
  outstandingAdvances: number;
  outstandingDebt: number;
  today: {
    salesCount: number;
    salesValue: number;
    paymentsCount: number;
    paymentsValue: number;
    repaymentBags: number;
  };
}

export interface DebtorRow {
  customerId: string;
  fullName: string;
  phone: string;
  outstandingBalance: number;
  unpaidSales: number;
}

export interface FarmerBalanceRow {
  farmerId: string;
  fullName: string;
  phone: string;
  outstandingAmount: number;
  openAdvances: number;
  bagsOutstanding: number;
}

export type TransactionType =
  | "advance_given"
  | "repayment_received"
  | "credit_sale"
  | "payment_received";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  advance_given: "Advance given",
  repayment_received: "Repayment received",
  credit_sale: "Credit sale",
  payment_received: "Payment received",
};

export interface LedgerTransaction {
  _id: string;
  type: TransactionType;
  /** Integer pesewas; 0 for pure commodity movements. */
  amount: number;
  bags?: number;
  description: string;
  createdAt: string;
}

export interface TransactionListData {
  transactions: LedgerTransaction[];
  total: number;
  page: number;
  pages: number;
}

export async function getDashboardReport(): Promise<DashboardReport> {
  const res = await api.get("/reports/dashboard");
  return res.data.data.report;
}

export async function getDebtors(): Promise<DebtorRow[]> {
  const res = await api.get("/reports/debtors");
  return res.data.data.debtors;
}

export async function getFarmerBalances(): Promise<FarmerBalanceRow[]> {
  const res = await api.get("/reports/farmer-balances");
  return res.data.data.balances;
}

export async function listTransactions(params: {
  type?: TransactionType;
  page?: number;
  limit?: number;
}): Promise<TransactionListData> {
  const res = await api.get("/transactions", { params });
  return res.data.data;
}
