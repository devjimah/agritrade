import axios from "axios";

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
