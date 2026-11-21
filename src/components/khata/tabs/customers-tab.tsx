"use client";

/**
 * TAB 2 — Customers: search + filter chips, customer rows and the detail sheet.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { CustomerPublic } from "@/lib/types";
import { daysSince, errOf, khataFetch, relTime } from "../api";
import { EmptyState, SkeletonRows } from "../txn-line";
import { CustomerSheet } from "../customer-sheet";

type CustomerFilter = "all" | "due" | "settled" | "archived";

export function CustomersTab({ refreshAll }: { refreshAll: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [list, setList] = useState<CustomerPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CustomerPublic | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce the search query (250 ms) before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The "Archived" chip swaps the fetch to the archived-only endpoint;
      // all other chips read the active list and filter client-side.
      const archivedOnly = filter === "archived";
      const base = archivedOnly ? "/api/customers?archived=1" : "/api/customers";
      const url = debounced
        ? `${base}${archivedOnly ? "&" : "?"}q=${encodeURIComponent(debounced)}`
        : base;
      const result = await khataFetch<{
        ok: boolean;
        error?: string;
        customers?: CustomerPublic[];
      }>(url);
      if (!result.ok) {
        setError(errOf(result, "Could not load customers."));
        return;
      }
      setList(result.data.customers ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [debounced, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshFromSheet = useCallback(() => {
    void load();
    void refreshAll();
  }, [load, refreshAll]);

  const visible = list.filter((c) => {
    if (filter === "archived") return true; // the server already filtered
    if (filter === "due") return c.balancePaise > 0;
    if (filter === "settled") return c.balancePaise <= 0;
    return true;
  });

  const filterChip = (value: CustomerFilter, label: string) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        filter === value
          ? "bg-[#0f5c4c] text-white"
          : "bg-[#efe4d2] text-[#5c6b62] hover:text-[#1c261f]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <section aria-labelledby="customers-heading">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="customers-heading"
            className="font-serif-khata text-lg font-bold text-[#1c261f]"
          >
            Customers
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#5c6b62]"
            aria-label="Refresh customer list"
            onClick={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Refresh
          </Button>
        </div>

        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#5c6b62]"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="pl-9 bg-white border-[#e2d5c0]"
            />
          </div>
          <div className="flex gap-2" role="group" aria-label="Filter customers">
            {filterChip("all", "All")}
            {filterChip("due", "Due")}
            {filterChip("settled", "Settled")}
            {filterChip("archived", "Archived")}
          </div>
        </div>

        <div className="mt-3 khata-card rounded-2xl p-3 sm:p-4">
          {error ? (
            <p className="text-sm font-medium text-[#9b2c2c] py-3 px-1" role="alert">
              {error}
            </p>
          ) : loading && list.length === 0 ? (
            <SkeletonRows rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              text={
                query
                  ? "No customers match that search."
                  : filter === "archived"
                    ? "No archived customers — settled customers can be archived from their khata sheet."
                    : "No customers yet — record your first entry on the Khata tab."
              }
            />
          ) : (
            <ul>
              {visible.map((c) => {
                const due = c.balancePaise > 0;
                const dueDays = daysSince(c.firstDueAt);
                const overLimit =
                  c.creditLimitPaise != null && c.balancePaise > c.creditLimitPaise;
                return (
                  <li key={c.nameKey}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setSheetOpen(true);
                      }}
                      className={`w-full text-left px-2 py-3 rounded-xl hover:bg-[#efe4d2]/60 focus-visible:bg-[#efe4d2]/80 transition-colors border-b border-[#e2d5c0]/70 last:border-b-0 ${
                        c.archived ? "opacity-70" : ""
                      }`}
                      aria-label={`Open khata for ${c.name}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 font-bold text-[#1c261f]">
                            <span className="truncate">{c.name}</span>
                            {c.archived && (
                              <span className="rounded-full bg-[#e2d5c0] px-2 py-0.5 text-[10px] font-bold text-[#5c6b62]">
                                Archived
                              </span>
                            )}
                            {overLimit && (
                              <span className="rounded-full bg-[#fde8d0] px-2 py-0.5 text-[10px] font-bold text-[#c56a16]">
                                Over limit
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[#5c6b62] mt-0.5 truncate">
                            {c.phone ? `${c.phone} · ` : ""}
                            {c.lastTxnAt ? `last entry ${relTime(c.lastTxnAt)}` : "no entries yet"}
                            {due && c.firstDueAt ? ` · due since ${dueDays} day${dueDays === 1 ? "" : "s"}` : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            due ? "text-[#9b2c2c]" : "text-[#0f5c4c]"
                          }`}
                        >
                          {due ? formatINR(c.balancePaise) : "settled"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <CustomerSheet
        nameKey={selected?.nameKey ?? null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onMutated={refreshFromSheet}
      />
    </div>
  );
}
