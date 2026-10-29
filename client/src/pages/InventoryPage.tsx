import { useEffect, useState } from "react";
import { Boxes, Clock3, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CROP_LABELS } from "@/lib/crops";
import { getApiErrorMessage } from "@/services/api";
import { getInventory } from "@/services/inventory";
import type { InventoryItem } from "@/services/inventory";

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getInventory();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalBags = items.reduce((sum, i) => sum + i.quantityBags, 0);
  const lastMovement = items
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Warehouse className="h-4 w-4" /> Stock room
          </div>
          <h2 className="mt-3 text-3xl font-semibold">Inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">Repayments add stock; credit sales will draw it down.</p>
        </div>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total bags in stock</p>
              <p className="text-3xl font-semibold">{loading ? "--" : totalBags}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last movement</p>
              <p className="text-lg font-semibold">
                {lastMovement ? new Date(lastMovement).toLocaleString("en-GH") : "No movement yet"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crop mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inventory yet.</p>
            ) : (
              items.map((item) => {
                const percent = totalBags > 0 ? Math.round((item.quantityBags / totalBags) * 100) : 0;
                return (
                  <div key={item.cropType} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{CROP_LABELS[item.cropType]}</span>
                      <span className="text-muted-foreground">{percent}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted">
                      <div
                        className="h-3 rounded-full bg-primary"
                        style={{ width: `${Math.max(percent, item.quantityBags > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Stock balances</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crop</TableHead>
                    <TableHead>Bags in stock</TableHead>
                    <TableHead>Last movement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.cropType}>
                      <TableCell className="font-medium">{CROP_LABELS[item.cropType]}</TableCell>
                      <TableCell>{item.quantityBags}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString("en-GH") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
