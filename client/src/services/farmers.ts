import { api } from "./api";

export interface Farmer {
  _id: string;
  fullName: string;
  phone: string;
  village: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmerListData {
  farmers: Farmer[];
  total: number;
  page: number;
  pages: number;
}

export interface FarmerInput {
  fullName: string;
  phone: string;
  village?: string;
  notes?: string;
}

export async function listFarmers(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<FarmerListData> {
  const res = await api.get("/farmers", { params });
  return res.data.data;
}

export async function getFarmer(id: string): Promise<Farmer> {
  const res = await api.get(`/farmers/${id}`);
  return res.data.data.farmer;
}

export async function createFarmer(input: FarmerInput): Promise<Farmer> {
  const res = await api.post("/farmers", input);
  return res.data.data.farmer;
}

export async function updateFarmer(id: string, input: Partial<FarmerInput>): Promise<Farmer> {
  const res = await api.put(`/farmers/${id}`, input);
  return res.data.data.farmer;
}
