"use client";

/**
 * TAB 3 — Reports: range chips, server-computed summary, udhaar vs collections
 * chart, outstanding table and real CSV/JSON exports.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { CreditCard, HandCoins, Scale, ListOrdered, Download } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { ReportsResponse } from "@/lib/types";
import { dayLabel, errOf, khataFetch, KHATA } from "../api";
import { EmptyState, SkeletonRows } from "../txn-line";

type Range = "today" | "7d" | "30d" | "all";

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export function ReportsTab() {
  const [range, setRange] = useState<Range>("30d");
  const [report, setReport] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await khataFetch<ReportsResponse & { ok: boolean; error?: string }>(
        `/api/reports?range=${range}`
      );
      if (!result.ok) {
        setError(errOf(result, "Could not load the report."));
        return;
      }
      setReport(result.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = report?.series ?? [];
  const seriesHasData = series.some((d) => d.credit !== 0 || d.payments !== 0);
  const chartData = series.map((d) => ({
    label: dayLabel(d.date),
    udhaar: d.credit,
    collections: d.payments,
  }));

  const summaryCard = (
    label: string,
    value: string,
    Icon: typeof CreditCard,
    colorClass: string,
    hint?: string
  ) => (
    <div className="khata-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[#5c6b62]">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {loading && !report ? (
        <div className="mt-2">
          <SkeletonRows rows={1} />
        </div>
      ) : (
        <>
          <p
            className={`mt-1.5 font-serif-khata text-2xl font-bold tabular-nums ${colorClass}`}
          >
            {value}
          </p>
          {hint && <p className="text-xs text-[#5c6b62] mt-1">{hint}</p>}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <section aria-labelledby="reports-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="reports-heading"
            className="font-serif-khata text-lg font-bold text-[#1c261f]"
          >
            Reports
          </h2>
          <div className="flex gap-2" role="group" aria-label="Report range">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  range === r.value
                    ? "bg-[#0f5c4c] text-white"
                    : "bg-[#efe4d2] text-[#5c6b62] hover:text-[#1c261f]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm font-medium text-[#9b2c2c]" role="alert">
            {error}
          </p>
        )}
      </section>

      {/* summary */}
      <section aria-label="Report summary">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCard(
            "Credit given",
            report ? formatINR(report.totals.creditPaise) : "—",
            CreditCard,
            "text-[#9b2c2c]"
          )}
          {summaryCard(
            "Collections received",
            report ? formatINR(report.totals.paymentsPaise) : "—",
            HandCoins,
            "text-[#0f5c4c]"
          )}
          {summaryCard(
            "Net outstanding change",
            report ? formatINR(report.totals.net * 100) : "—",
            Scale,
            report && report.totals.net >= 0 ? "text-[#9b2c2c]" : "text-[#0f5c4c]",
            "credit − collections"
          )}
          {summaryCard(
            "Entries",
            report ? String(report.totals.count) : "—",
            ListOrdered,
            "text-[#1c261f]"
          )}
        </div>
      </section>

      {/* chart */}
      <section aria-label="Daily udhaar vs collections chart">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h3 className="font-serif-khata text-base font-bold text-[#1c261f] mb-3">
            Udhaar given vs collections
          </h3>
          {loading && !report ? (
            <SkeletonRows rows={4} />
          ) : !seriesHasData ? (
            <EmptyState text="No entries in this range yet — the chart appears once you record udhaar or payments." />
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2d5c0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: KHATA.muted }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: KHATA.muted }} width={52} />
                  <Tooltip
                    formatter={(value) => formatINR(Number(value) * 100)}
                    contentStyle={{
                      background: "#fffaf2",
                      border: "1px solid #e2d5c0",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="udhaar"
                    name="Udhaar given"
                    fill={KHATA.due}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="collections"
                    name="Collections"
                    fill={KHATA.teal}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* outstanding table */}
      <section aria-label="Outstanding by customer">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h3 className="font-serif-khata text-base font-bold text-[#1c261f] mb-3">
            Outstanding by customer
          </h3>
          {loading && !report ? (
            <SkeletonRows rows={4} />
          ) : (report?.customerOutstanding?.length ?? 0) === 0 ? (
            <EmptyState text="No outstanding dues — sab settle ho gaya!" />
          ) : (
            <div className="max-h-96 overflow-y-auto khata-scroll rounded-lg border border-[#e2d5c0]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#efe4d2]/60 hover:bg-[#efe4d2]/60">
                    <TableHead className="text-[#5c6b62]">Name</TableHead>
                    <TableHead className="text-[#5c6b62]">Phone</TableHead>
                    <TableHead className="text-[#5c6b62] text-right">Balance</TableHead>
                    <TableHead className="text-[#5c6b62] text-right">Days due</TableHead>
                    <TableHead className="text-[#5c6b62]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report!.customerOutstanding.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-semibold text-[#1c261f]">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-[#5c6b62]">{row.phone ?? "—"}</TableCell>
                      <TableCell className="text-right font-bold text-[#9b2c2c] tabular-nums">
                        {formatINR(row.balancePaise)}
                      </TableCell>
                      <TableCell className="text-right text-[#5c6b62] tabular-nums">
                        {row.daysDue}
                      </TableCell>
                      <TableCell className="text-[#5c6b62] max-w-40 truncate">
                        {row.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      {/* exports */}
      <section aria-label="Export data">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h3 className="font-serif-khata text-base font-bold text-[#1c261f] mb-3">
            Export
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10">
              <a href="/api/export/transactions.csv" download>
                <Download className="size-4" aria-hidden="true" />
                Transactions CSV
              </a>
            </Button>
            <Button asChild variant="outline" className="border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10">
              <a href="/api/export/outstanding.csv" download>
                <Download className="size-4" aria-hidden="true" />
                Outstanding CSV
              </a>
            </Button>
            <Button asChild variant="outline" className="border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10">
              <a href="/api/export/backup.json" download>
                <Download className="size-4" aria-hidden="true" />
                Full backup (JSON)
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
