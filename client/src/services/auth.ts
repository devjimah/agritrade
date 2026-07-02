import { api, TOKEN_KEY } from "./api";

export interface User {
  _id: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
}

export async function loginRequest(email: string, password: string): Promise<User> {
  const res = await api.post("/auth/login", { email, password });
  const { user, token } = res.data.data as { user: User; token: string };
  localStorage.setItem(TOKEN_KEY, token);
  return user;
}

export async function fetchMe(): Promise<User> {
  const res = await api.get("/auth/me");
  return res.data.data.user as User;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
