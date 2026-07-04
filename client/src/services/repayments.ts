import { api } from "./api";
import type { CropType } from "@/lib/crops";

export interface Repayment {
  _id: string;
  advanceId: string;
  farmerId: string;
  cropType: CropType;
  bagsSupplied: number;
  notes: string;
  createdAt: string;
}

export interface RepaymentInput {
  advanceId: string;
  bagsSupplied: number;
  /** Generate once per submission attempt; retries must reuse it. */
  idempotencyKey: string;
  notes?: string;
}

export async function createRepayment(input: RepaymentInput): Promise<Repayment> {
  const res = await api.post("/repayments", input);
  return res.data.data.repayment;
}
