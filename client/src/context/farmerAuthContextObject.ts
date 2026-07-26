import { createContext } from "react";
import type { Farmer } from "@/services/farmerPortal";

export interface FarmerAuthContextValue {
  farmer: Farmer | null;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => void;
}

export const FarmerAuthContext = createContext<FarmerAuthContextValue | undefined>(undefined);
