import { Navigate, Outlet } from "react-router-dom";
import { getAppMode, isSmallScreen } from "@/lib/appMode";

/**
 * Guards the full desk. Lite users go to their chat screen; phone users who
 * haven't picked a version yet see the welcome screen first. Desktops with no
 * choice default to the full desk.
 */
export function ModeGate() {
  const mode = getAppMode();
  if (mode === "lite") return <Navigate to="/lite" replace />;
  if (mode === null && isSmallScreen()) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}
