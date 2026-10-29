import { useEffect, useState } from "react";
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
import { getApiErrorMessage } from "@/services/api";
import { getAiUsage } from "@/services/ai";
import type { UsageReport } from "@/services/ai";

const nf = new Intl.NumberFormat("en-GH");

/**
 * What the assistant has spent on the Model API. Token counts are only as
 * good as the API reports them: requests without counts are listed as
 * "unreported" instead of being added in as zero.
 */
export function AiUsageCard() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    getAiUsage(days)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const t = report?.totals;
  const stats = t
    ? [
        { label: "Requests", value: nf.format(t.requests), note: t.failed ? `${nf.format(t.failed)} failed` : undefined },
        { label: "Model calls", value: nf.format(t.calls) },
        { label: "Tokens", value: nf.format(t.totalTokens), note: `${nf.format(t.promptTokens)} in · ${nf.format(t.completionTokens)} out` },
      ]
    : [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Assistant usage</CardTitle>
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-40"
          aria-label="Usage period"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!report && !error && <p className="text-sm text-muted-foreground">Loading...</p>}
        {report && t && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
                  {s.note && <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>}
                </div>
              ))}
            </div>
            {t.unreported > 0 && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                {nf.format(t.unreported)} request(s) came back without token counts, so the real total is higher
                than shown.
              </p>
            )}
            {report.byDay.length > 0 && (
              <div className="-mx-6 -mb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byDay.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell>{d.date}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(d.requests)}
                          {d.failed > 0 && <span className="text-red-600"> ({d.failed} failed)</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{nf.format(d.calls)}</TableCell>
                        <TableCell className="text-right tabular-nums">{nf.format(d.totalTokens)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
