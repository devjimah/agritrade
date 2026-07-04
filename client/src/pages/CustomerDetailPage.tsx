import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Banknote, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CROP_LABELS, CROP_TYPES } from "@/lib/crops";
import type { CropType } from "@/lib/crops";
import { formatGHS, parseGHSToPesewas } from "@/lib/money";
import { getApiErrorMessage } from "@/services/api";
import { createCreditSale, getDebtSummary, listCreditSales } from "@/services/creditSales";
import type { CreditSale, DebtSummary, PaymentStatus } from "@/services/creditSales";
import { getCustomer } from "@/services/customers";
import type { Customer } from "@/services/customers";
import { getInventory } from "@/services/inventory";
import type { InventoryItem } from "@/services/inventory";

const STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};

const STATUS_STYLES: Record<PaymentStatus, string> = {
  unpaid: "bg-amber-100 text-amber-800",
  partial: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<CreditSale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cropType, setCropType] = useState<CropType>("maize");
  const [bags, setBags] = useState("");
  const [priceGHS, setPriceGHS] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // One key per dialog-open: a double-click or retry resubmits the SAME key,
  // which the server answers with the original sale instead of a duplicate.
  const [saleKey, setSaleKey] = useState("");

  // Same stale-response guard as the other detail page: /customers/A ->
  // /customers/B does not remount, so slow responses must not clobber B.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setPageError("");
    try {
      const [customerData, salesData, summaryData, inventoryData] = await Promise.all([
        getCustomer(id),
        listCreditSales({ customerId: id, limit: 100 }),
        getDebtSummary(id),
        getInventory(),
      ]);
      if (seq !== requestSeq.current) return;
      setCustomer(customerData);
      setSales(salesData.sales);
      setSalesTotal(salesData.total);
      setSummary(summaryData);
      setInventory(inventoryData);
      setLoading(false);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setPageError(getApiErrorMessage(err));
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openRecordSale() {
    setCropType("maize");
    setBags("");
    setPriceGHS("");
    setNotes("");
    setFormError("");
    setSaleKey(crypto.randomUUID());
    setDialogOpen(true);
  }

  const stockFor = (crop: CropType) =>
    inventory.find((i) => i.cropType === crop)?.quantityBags ?? 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const bagCount = Number(bags);
    if (!Number.isInteger(bagCount) || bagCount < 1) {
      setFormError("Bags must be a whole number of at least 1");
      return;
    }
    const available = stockFor(cropType);
    if (bagCount > available) {
      setFormError(`Only ${available} bag(s) of ${CROP_LABELS[cropType]} in stock`);
      return;
    }
    const price = parseGHSToPesewas(priceGHS);
    if (price === null) {
      setFormError("Enter a valid price per bag in GHS, e.g. 150 or 150.50");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createCreditSale({
        customerId: id,
        cropType,
        bagsTaken: bagCount,
        pricePerBag: price,
        idempotencyKey: saleKey,
        notes,
      });
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (pageError) return <p className="text-sm text-red-600">{pageError}</p>;
  if (!customer) return null;

  const bagCount = Number(bags);
  const pricePesewas = parseGHSToPesewas(priceGHS);
  const previewTotal =
    Number.isInteger(bagCount) && bagCount > 0 && pricePesewas !== null
      ? bagCount * pricePesewas
      : null;

  return (
    <div className="space-y-5">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold">{customer.fullName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.phone}
            {customer.location ? ` · ${customer.location}` : ""}
          </p>
          {customer.notes && (
            <p className="mt-1 text-sm text-muted-foreground">{customer.notes}</p>
          )}
        </div>
        <Button onClick={openRecordSale}>
          <Plus className="mr-1 h-4 w-4" /> Record sale
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Outstanding debt</p>
              <p className="text-3xl font-semibold">
                {summary ? formatGHS(summary.outstandingBalance) : "--"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Credit sales</p>
              <p className="text-3xl font-semibold">{summary?.totalSales ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {summary?.unpaidSales ?? 0} with a balance
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Credit sales</CardTitle>
          {salesTotal > sales.length && (
            <p className="text-xs text-muted-foreground">
              Showing latest {sales.length} of {salesTotal} sales.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No credit sales recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Bags</TableHead>
                  <TableHead>Price/bag</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale._id}>
                    <TableCell>{new Date(sale.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell>{CROP_LABELS[sale.cropType]}</TableCell>
                    <TableCell>{sale.bagsTaken}</TableCell>
                    <TableCell>{formatGHS(sale.pricePerBag)}</TableCell>
                    <TableCell className="font-medium">{formatGHS(sale.totalAmount)}</TableCell>
                    <TableCell>{formatGHS(sale.amountPaid)}</TableCell>
                    <TableCell className="font-medium">
                      {formatGHS(sale.balanceRemaining)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sale.paymentStatus]}`}
                      >
                        {STATUS_LABELS[sale.paymentStatus]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Record credit sale">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="saleCrop">Crop</Label>
            <Select
              id="saleCrop"
              value={cropType}
              onChange={(e) => setCropType(e.target.value as CropType)}
            >
              {CROP_TYPES.map((crop) => (
                <option key={crop} value={crop}>
                  {CROP_LABELS[crop]} ({stockFor(crop)} in stock)
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="saleBags">Bags</Label>
            <Input
              id="saleBags"
              required
              inputMode="numeric"
              placeholder="5"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {stockFor(cropType)} bag(s) of {CROP_LABELS[cropType]} available.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salePrice">Price per bag (GHS)</Label>
            <Input
              id="salePrice"
              required
              inputMode="decimal"
              placeholder="150.00"
              value={priceGHS}
              onChange={(e) => setPriceGHS(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="saleNotes">Notes</Label>
            <Input id="saleNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {previewTotal !== null && (
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">{formatGHS(previewTotal)}</span>{" "}
              on credit
            </p>
          )}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Record sale"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
