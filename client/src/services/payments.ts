import { api } from "./api";

export type PaymentMethod = "cash" | "mobile_money" | "bank";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank: "Bank",
};

export interface Payment {
  _id: string;
  creditSaleId: string;
  customerId: string;
  /** Integer pesewas. */
  amountPaid: number;
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: string;
}

export interface PaymentInput {
  creditSaleId: string;
  /** Integer pesewas. */
  amountPaid: number;
  paymentMethod: PaymentMethod;
  /** Generate once per submission attempt; retries must reuse it. */
  idempotencyKey: string;
  notes?: string;
}

export async function createPayment(input: PaymentInput): Promise<Payment> {
  const res = await api.post("/payments", input);
  return res.data.data.payment;
}
