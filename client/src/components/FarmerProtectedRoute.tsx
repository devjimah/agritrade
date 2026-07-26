import { Navigate, Outlet } from "react-router-dom";
import { useFarmerAuth } from "@/context/useFarmerAuth";

export function FarmerProtectedRoute() {
  const { farmer, loading } = useFarmerAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Loading…</div>
    );
  }
  return farmer ? <Outlet /> : <Navigate to="/portal/login" replace />;
}
