import { api } from "./api";

export type RepaymentClaimStatus = "pending" | "confirmed" | "rejected";

export interface ClaimFarmerRef {
  _id: string;
  fullName: string;
  phone: string;
}

export interface StaffRepaymentClaim {
  _id: string;
  advanceId: string;
  farmerId: ClaimFarmerRef;
  bagsClaimed: number;
  status: RepaymentClaimStatus;
  rejectionReason?: string;
  createdAt: string;
}

export interface ClaimListData {
  claims: StaffRepaymentClaim[];
  total: number;
  page: number;
  pages: number;
}

export async function listRepaymentClaims(params: {
  status?: RepaymentClaimStatus;
  page?: number;
  limit?: number;
}): Promise<ClaimListData> {
  const res = await api.get("/repayment-claims", { params });
  return res.data.data;
}

export async function confirmRepaymentClaim(id: string): Promise<StaffRepaymentClaim> {
  const res = await api.post(`/repayment-claims/${id}/confirm`);
  return res.data.data.claim;
}

export async function rejectRepaymentClaim(id: string, reason: string): Promise<StaffRepaymentClaim> {
  const res = await api.post(`/repayment-claims/${id}/reject`, { reason });
  return res.data.data.claim;
}
