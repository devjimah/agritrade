import { api } from "./api";

export interface Customer {
  _id: string;
  fullName: string;
  phone: string;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListData {
  customers: Customer[];
  total: number;
  page: number;
  pages: number;
}

export interface CustomerInput {
  fullName: string;
  phone: string;
  location?: string;
  notes?: string;
}

export async function listCustomers(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<CustomerListData> {
  const res = await api.get("/customers", { params });
  return res.data.data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const res = await api.get(`/customers/${id}`);
  return res.data.data.customer;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const res = await api.post("/customers", input);
  return res.data.data.customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  const res = await api.put(`/customers/${id}`, input);
  return res.data.data.customer;
}
