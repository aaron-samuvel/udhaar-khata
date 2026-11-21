"use client";

/**
 * Data-safety cards for the Settings tab:
 *  - RestoreBackupCard: upload a backup JSON and restore it (merge or replace)
 *  - ActivityLogCard: read-only view of the append-only audit trail
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FilePlus2,
  History,
  Loader2,
  RotateCcw,
  Store,
  Undo2,
  Upload,
  UserPen,
  FileUp,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import type { AuditPublic } from "@/lib/types";
import { errOf, khataFetch, khataPost, relTime } from "./api";

/* ==================================================================== */
/*  Restore from backup                                                 */
/* ==================================================================== */

interface PendingRestore {
  backup: Record<string, unknown>;
  customers: number;
  transactions: number;
  exportedAt: string | null;
}

export function RestoreBackupCard({ refreshAll }: { refreshAll: () => Promise<void> }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [busyMode, setBusyMode] = useState<"merge" | "replace" | null>(null);

  const onFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed?.format !== "udhaar-khata-backup" || !Array.isArray(parsed.customers)) {
        toast({
          title: "Not a khata backup",
          description:
            "Pick a JSON file produced by 'Full backup (JSON)' on the Reports or Settings tab.",
          variant: "destructive",
        });
        return;
      }
      const backupCustomers = Array.isArray(parsed.customers) ? parsed.customers.length : 0;
      const backupTransactions = Array.isArray(parsed.transactions)
        ? parsed.transactions.length
        : 0;
      if (backupCustomers === 0 && backupTransactions === 0) {
        toast({
          title: "Empty backup",
          description: "This backup has no customers or transactions to restore.",
          variant: "destructive",
        });
        return;
      }
      setPending({
        backup: parsed,
        customers: backupCustomers,
        transactions: backupTransactions,
        exportedAt:
          typeof parsed.exportedAt === "string"
            ? new Date(parsed.exportedAt).toLocaleString("en-IN")
            : null,
      });
    } catch {
      toast({
        title: "Could not read the file",
        description: "Make sure it is the exported backup JSON file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const restore = useCallback(
    async (mode: "merge" | "replace") => {
      if (!pending) return;
      setBusyMode(mode);
      try {
        const result = await khataPost<{
          ok: boolean;
          error?: string;
          result?: { importedCustomers: number; importedTransactions: number; skippedTransactions: number };
        }>("/api/import", { mode, backup: pending.backup });
        if (!result.ok || !result.data.result) {
          toast({ title: "Restore failed", description: errOf(result), variant: "destructive" });
          return;
        }
        const r = result.data.result;
        toast({
          title: mode === "replace" ? "Ledger replaced from backup" : "Backup merged",
          description: `${r.importedTransactions} transaction(s) imported${
            r.skippedTransactions > 0 ? `, ${r.skippedTransactions} duplicate(s) skipped` : ""
          }. Balances were recomputed from the ledger.`,
        });
        setPending(null);
        await refreshAll();
      } catch (e) {
        toast({ title: "Restore failed", description: (e as Error).message, variant: "destructive" });
      } finally {
        setBusyMode(null);
      }
    },
    [pending, toast, refreshAll]
  );

  return (
    <div className="mt-3 rounded-xl border border-[#e2d5c0] bg-white/60 p-3">
      <p className="text-sm font-semibold text-[#1c261f]">Restore from a backup</p>
      <p className="mt-1 text-xs text-[#5c6b62]">
        Merge adds what is missing (never overwrites your edits). Replace wipes the
        current ledger and rebuilds it from the file. Balances are always recomputed
        from the ledger lines in the file.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Choose a backup JSON file to restore"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="mt-2 border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden="true" />
        Choose backup file
      </Button>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent className="khata-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
              Restore this backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[#5c6b62]">
                <p>
                  {pending?.customers ?? 0} customer(s) and {pending?.transactions ?? 0}
                  {" "}transaction(s){pending?.exportedAt ? ` · exported ${pending.exportedAt}` : ""}.
                </p>
                <p>
                  <strong>Merge</strong> keeps everything currently in the ledger and adds
                  only new lines. <strong>Replace</strong> erases the current ledger first —
                  download a fresh backup if you are not sure.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={busyMode !== null}
              className="border-[#0f5c4c] text-[#0f5c4c] hover:bg-[#0f5c4c]/10"
              onClick={() => void restore("merge")}
            >
              {busyMode === "merge" && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              <FileUp className="size-4" aria-hidden="true" />
              Merge into ledger
            </Button>
            <AlertDialogAction
              className="bg-[#9b2c2c] text-white hover:bg-[#7a231f]"
              disabled={busyMode !== null}
              onClick={(e) => {
                e.preventDefault();
                void restore("replace");
              }}
            >
              {busyMode === "replace" && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Replace everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ==================================================================== */
/*  Activity log (audit trail)                                          */
/* ==================================================================== */

const ACTION_META: Record<
  string,
  { label: string; Icon: typeof History; className: string }
> = {
  transaction_create: { label: "Entry recorded", Icon: FilePlus2, className: "bg-[#d8e8e1] text-[#0f5c4c]" },
  transaction_reverse: { label: "Entry reversed", Icon: Undo2, className: "bg-[#f6d9d9] text-[#9b2c2c]" },
  update_customer: { label: "Customer updated", Icon: UserPen, className: "bg-[#efe4d2] text-[#5c6b62]" },
  settings_update: { label: "Settings changed", Icon: Store, className: "bg-[#efe4d2] text-[#5c6b62]" },
  demo_reset: { label: "Ledger reset to demo", Icon: RotateCcw, className: "bg-[#fde8d0] text-[#7a4210]" },
  import_backup: { label: "Backup restored", Icon: Upload, className: "bg-[#fde8d0] text-[#7a4210]" },
};

function describeEvent(action: string, raw: string): string {
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return "";
  }
  const rupees = (p: unknown) =>
    typeof p === "number" ? formatINR(p) : "";
  switch (action) {
    case "transaction_create": {
      const type = d.txnType === "PAYMENT" ? "payment" : "udhaar";
      const forced = d.forced === true ? " (saved after duplicate warning)" : "";
      return `${String(d.customer ?? "")} · ${rupees(d.amountPaise)} ${type}${forced}`;
    }
    case "transaction_reverse":
      return `${String(d.customer ?? "")} · ${rupees(d.amountPaise)} ${String(
        d.originalType ?? ""
      ).toLowerCase()} voided`;
    case "import_backup":
      return `${String(d.mode ?? "")}: ${String(d.importedTransactions ?? 0)} transaction(s)${
        Number(d.skippedTransactions ?? 0) > 0
          ? `, ${String(d.skippedTransactions)} duplicate(s) skipped`
          : ""
      }`;
    case "settings_update": {
      const parts: string[] = [];
      if (typeof d.shopName === "string") parts.push(`shop "${d.shopName}"`);
      if (typeof d.overdueDays === "number") parts.push(`overdue ${d.overdueDays}d`);
      if (typeof d.reminderTemplate === "string") parts.push("reminder template");
      if (d.demoData === false) parts.push("demo flag off");
      return parts.join(" · ");
    }
    case "demo_reset":
      return `${String(d.customers ?? 0)} customer(s), ${String(d.transactions ?? 0)} entry(ies) seeded`;
    default:
      return "";
  }
}

export function ActivityLogCard() {
  const [events, setEvents] = useState<AuditPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await khataFetch<{ ok: boolean; error?: string; events?: AuditPublic[] }>(
          "/api/audit?limit=50"
        );
        if (!result.ok) {
          setError(errOf(result, "Could not load the activity log."));
          return;
        }
        setEvents(result.data.events ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="khata-card rounded-2xl p-4 sm:p-5">
      <h2 className="font-serif-khata text-lg font-bold text-[#1c261f] flex items-center gap-2">
        <History className="size-5 text-[#0f5c4c]" aria-hidden="true" />
        Activity log
      </h2>
      <p className="mt-2 text-sm text-[#5c6b62]">
        Append-only audit trail — entries, reversals, restores and settings changes.
        Nothing here can be edited or deleted.
      </p>

      {error ? (
        <p className="mt-3 text-sm font-medium text-[#9b2c2c]" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-[#efe4d2]/70" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="mt-3 text-sm text-[#5c6b62]">
          No activity yet — record your first entry and it will appear here.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 overflow-y-auto khata-scroll pr-1 space-y-1">
          {events.map((ev) => {
            const meta = ACTION_META[ev.action] ?? {
              label: ev.action,
              Icon: History,
              className: "bg-[#efe4d2] text-[#5c6b62]",
            };
            const Icon = meta.Icon;
            const detail = describeEvent(ev.action, ev.data);
            return (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#efe4d2]/50"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}
                  aria-hidden="true"
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#1c261f]">
                    {meta.label}
                  </span>
                  {detail && (
                    <span className="block truncate text-xs text-[#5c6b62]">{detail}</span>
                  )}
                </span>
                <time
                  className="shrink-0 text-xs text-[#5c6b62] tabular-nums"
                  dateTime={ev.createdAt}
                  title={new Date(ev.createdAt).toLocaleString("en-IN")}
                >
                  {relTime(ev.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
