import { api } from "./api";
import type { CropType } from "@/lib/crops";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface CreditSale {
  _id: string;
  customerId: string;
  cropType: CropType;
  bagsTaken: number;
  /** Integer pesewas. */
  pricePerBag: number;
  totalAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  paymentStatus: PaymentStatus;
  notes: string;
  createdAt: string;
}

export interface CreditSaleListData {
  sales: CreditSale[];
  total: number;
  page: number;
  pages: number;
}

export interface CreditSaleInput {
  customerId: string;
  cropType: CropType;
  bagsTaken: number;
  /** Integer pesewas. */
  pricePerBag: number;
  /** Generate once per submission attempt; retries must reuse it. */
  idempotencyKey: string;
  notes?: string;
}

export interface DebtSummary {
  /** Integer pesewas. */
  outstandingBalance: number;
  totalSales: number;
  unpaidSales: number;
}

export async function listCreditSales(params: {
  customerId?: string;
  paymentStatus?: PaymentStatus;
  page?: number;
  limit?: number;
}): Promise<CreditSaleListData> {
  const res = await api.get("/credit-sales", { params });
  return res.data.data;
}

export async function createCreditSale(input: CreditSaleInput): Promise<CreditSale> {
  const res = await api.post("/credit-sales", input);
  return res.data.data.sale;
}

export async function getDebtSummary(customerId: string): Promise<DebtSummary> {
  const res = await api.get("/credit-sales/summary", { params: { customerId } });
  return res.data.data.summary;
}
