import { useContext } from "react";
import { FarmerAuthContext } from "@/context/farmerAuthContextObject";
import type { FarmerAuthContextValue } from "@/context/farmerAuthContextObject";

export function useFarmerAuth(): FarmerAuthContextValue {
  const ctx = useContext(FarmerAuthContext);
  if (!ctx) throw new Error("useFarmerAuth must be used within FarmerAuthProvider");
  return ctx;
}
