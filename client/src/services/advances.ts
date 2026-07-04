import { api } from "./api";
import type { CropType } from "@/lib/crops";

export type RepaymentStatus = "pending" | "partial" | "completed";

export interface Advance {
  _id: string;
  farmerId: { _id: string; fullName: string; phone: string } | string;
  /** Integer pesewas. */
  amountGiven: number;
  cropType: CropType;
  expectedBags: number;
  bagsRepaid: number;
  repaymentStatus: RepaymentStatus;
  notes: string;
  createdAt: string;
}

export interface AdvanceListData {
  advances: Advance[];
  total: number;
  page: number;
  pages: number;
}

export interface AdvanceInput {
  farmerId: string;
  /** Integer pesewas. */
  amountGiven: number;
  cropType: CropType;
  expectedBags: number;
  notes?: string;
}

export async function listAdvances(params: {
  farmerId?: string;
  repaymentStatus?: RepaymentStatus;
  page?: number;
  limit?: number;
}): Promise<AdvanceListData> {
  const res = await api.get("/advances", { params });
  return res.data.data;
}

export interface AdvanceSummary {
  /** Integer pesewas. */
  outstandingAmount: number;
  totalAdvances: number;
  pendingAdvances: number;
}

export async function getAdvanceSummary(farmerId: string): Promise<AdvanceSummary> {
  const res = await api.get("/advances/summary", { params: { farmerId } });
  return res.data.data.summary;
}

export async function createAdvance(input: AdvanceInput): Promise<Advance> {
  const res = await api.post("/advances", input);
  return res.data.data.advance;
}
