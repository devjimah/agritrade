import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGHS } from "@/lib/money";
import { getApiErrorMessage } from "@/services/api";
import {
  getDebtors,
  getFarmerBalances,
  listTransactions,
  TRANSACTION_TYPE_LABELS,
} from "@/services/reports";
import type {
  DebtorRow,
  FarmerBalanceRow,
  LedgerTransaction,
  TransactionType,
} from "@/services/reports";

export function ReportsPage() {
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [balances, setBalances] = useState<FarmerBalanceRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [txType, setTxType] = useState<TransactionType | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [debtorData, balanceData, txData] = await Promise.all([
          getDebtors(),
          getFarmerBalances(),
          listTransactions({ type: txType || undefined, limit: 25 }),
        ]);
        if (cancelled) return;
        setDebtors(debtorData);
        setBalances(balanceData);
        setTransactions(txData.transactions);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txType]);

  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <FileBarChart className="h-4 w-4" /> Business reports
        </div>
        <h2 className="mt-3 text-3xl font-semibold">Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Outstanding debts, farmer balances, and the full transaction ledger.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Outstanding customer debts</CardTitle>
            {debtors.length === 50 && (
              <p className="text-xs text-muted-foreground">Showing the top 50 debtors.</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : debtors.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No outstanding debts. Well done.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Open sales</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtors.map((debtor) => (
                    <TableRow key={debtor.customerId}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/customers/${debtor.customerId}`}
                          className="text-primary hover:underline"
                        >
                          {debtor.fullName}
                        </Link>
                      </TableCell>
                      <TableCell>{debtor.phone}</TableCell>
                      <TableCell>{debtor.unpaidSales}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatGHS(debtor.outstandingBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Farmer balances (bags owed)</CardTitle>
            {balances.length === 50 && (
              <p className="text-xs text-muted-foreground">Showing the top 50 farmers by balance.</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : balances.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No open advances.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farmer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Bags owed</TableHead>
                    <TableHead className="text-right">Open value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((row) => (
                    <TableRow key={row.farmerId}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/farmers/${row.farmerId}`}
                          className="text-primary hover:underline"
                        >
                          {row.fullName}
                        </Link>
                      </TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell>{row.bagsOutstanding}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatGHS(row.outstandingAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Transaction ledger</CardTitle>
          <Select
            value={txType}
            onChange={(e) => setTxType(e.target.value as TransactionType | "")}
            className="w-52"
            aria-label="Filter by transaction type"
          >
            <option value="">All types</option>
            {(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map((type) => (
              <option key={type} value={type}>
                {TRANSACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No transactions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx._id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString("en-GH")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {TRANSACTION_TYPE_LABELS[tx.type]}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {tx.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">
                      {tx.amount > 0 ? formatGHS(tx.amount) : `${tx.bags ?? 0} bag(s)`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
