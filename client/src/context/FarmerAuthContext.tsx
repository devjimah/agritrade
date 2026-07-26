import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import {
  clearFarmerToken,
  farmerLoginRequest,
  fetchFarmerMe,
  hasFarmerToken,
} from "@/services/farmerPortal";
import type { Farmer } from "@/services/farmerPortal";
import { FarmerAuthContext } from "@/context/farmerAuthContextObject";

export function FarmerAuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasFarmerToken()) {
      setLoading(false);
      return;
    }
    fetchFarmerMe()
      .then(setFarmer)
      .catch((err) => {
        // Only discard the token when the server rejected it; keep it through
        // transient network failures so a brief outage doesn't log farmers out.
        if (axios.isAxiosError(err) && err.response?.status === 401) clearFarmerToken();
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(phone: string, pin: string) {
    await farmerLoginRequest(phone, pin);
    const me = await fetchFarmerMe();
    setFarmer(me);
  }

  function logout() {
    clearFarmerToken();
    setFarmer(null);
  }

  const value = useMemo(() => ({ farmer, loading, login, logout }), [farmer, loading]);

  return <FarmerAuthContext.Provider value={value}>{children}</FarmerAuthContext.Provider>;
}
