import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/layouts/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { FarmersPage } from "@/pages/FarmersPage";
import { FarmerDetailPage } from "@/pages/FarmerDetailPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { FarmerAuthProvider } from "@/context/FarmerAuthContext";
import { FarmerProtectedRoute } from "@/components/FarmerProtectedRoute";
import { PortalLayout } from "@/layouts/PortalLayout";
import { PortalLoginPage } from "@/pages/portal/PortalLoginPage";
import { PortalDashboardPage } from "@/pages/portal/PortalDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/*"
          element={
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/farmers" element={<FarmersPage />} />
                    <Route path="/farmers/:id" element={<FarmerDetailPage />} />
                    <Route path="/customers" element={<CustomersPage />} />
                    <Route path="/customers/:id" element={<CustomerDetailPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                  </Route>
                </Route>
              </Routes>
            </AuthProvider>
          }
        />
        <Route
          path="/portal/*"
          element={
            <FarmerAuthProvider>
              <Routes>
                <Route path="login" element={<PortalLoginPage />} />
                <Route element={<FarmerProtectedRoute />}>
                  <Route element={<PortalLayout />}>
                    <Route index element={<PortalDashboardPage />} />
                  </Route>
                </Route>
              </Routes>
            </FarmerAuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
