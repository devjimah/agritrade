import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFarmerAuth } from "@/context/useFarmerAuth";

// Placeholder body only: advances/repayments/claims UI lands in Task 8.
export function PortalDashboardPage() {
  const { farmer } = useFarmerAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {farmer?.fullName}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Your advances and repayments will appear here soon.
        </p>
      </CardContent>
    </Card>
  );
}
