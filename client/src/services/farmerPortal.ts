import axios from "axios";
import type { CropType } from "@/lib/crops";

export const FARMER_TOKEN_KEY = "agritrade_farmer_token";

// Separate instance from the staff `api` in services/api.ts: distinct token
// key and a distinct 401-redirect target (/portal/login vs /login), so a
// trader and a farmer can be signed in at the same time in one browser.
export const farmerApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
});

farmerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(FARMER_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

farmerApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(FARMER_TOKEN_KEY);
      if (window.location.pathname !== "/portal/login") window.location.assign("/portal/login");
    }
    return Promise.reject(error);
  }
);

export interface Farmer {
  _id: string;
  fullName: string;
  phone: string;
  village: string;
}

export async function farmerLoginRequest(phone: string, pin: string): Promise<void> {
  const res = await farmerApi.post("/farmer-portal/login", { phone, pin });
  const { token } = res.data.data as { token: string };
  localStorage.setItem(FARMER_TOKEN_KEY, token);
}

export async function fetchFarmerMe(): Promise<Farmer> {
  const res = await farmerApi.get("/farmer-portal/me");
  return res.data.data.farmer as Farmer;
}

export function clearFarmerToken(): void {
  localStorage.removeItem(FARMER_TOKEN_KEY);
}

export function hasFarmerToken(): boolean {
  return Boolean(localStorage.getItem(FARMER_TOKEN_KEY));
}

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

export interface FarmerAdvanceSummary {
  /** Integer pesewas, server-computed pro-rated outstanding balance. */
  outstandingAmount: number;
  totalAdvances: number;
  pendingAdvances: number;
}

export interface MyAdvancesData {
  advances: Advance[];
  total: number;
  page: number;
  pages: number;
  summary: FarmerAdvanceSummary;
}

export async function fetchMyAdvances(): Promise<MyAdvancesData> {
  const res = await farmerApi.get("/farmer-portal/advances", { params: { limit: 100 } });
  return res.data.data;
}

export interface Repayment {
  _id: string;
  advanceId: string;
  farmerId: string;
  cropType: CropType;
  bagsSupplied: number;
  notes: string;
  createdAt: string;
}

export interface MyRepaymentsData {
  repayments: Repayment[];
  total: number;
  page: number;
  pages: number;
}

export async function fetchMyRepayments(): Promise<MyRepaymentsData> {
  const res = await farmerApi.get("/farmer-portal/repayments", { params: { limit: 100 } });
  return res.data.data;
}

export type RepaymentClaimStatus = "pending" | "confirmed" | "rejected";

export interface RepaymentClaim {
  _id: string;
  advanceId: string;
  farmerId: string;
  bagsClaimed: number;
  status: RepaymentClaimStatus;
  rejectionReason?: string;
  createdAt: string;
}

export interface SubmitClaimInput {
  advanceId: string;
  bagsClaimed: number;
  /** Generate once per dialog-open; retries must reuse it. */
  idempotencyKey: string;
}

export async function submitClaim(input: SubmitClaimInput): Promise<RepaymentClaim> {
  const res = await farmerApi.post("/farmer-portal/repayment-claims", input);
  return res.data.data.claim;
}

export interface MyClaimsData {
  claims: RepaymentClaim[];
  total: number;
  page: number;
  pages: number;
}

export async function fetchMyClaims(): Promise<MyClaimsData> {
  const res = await farmerApi.get("/farmer-portal/repayment-claims", { params: { limit: 100 } });
  return res.data.data;
}
