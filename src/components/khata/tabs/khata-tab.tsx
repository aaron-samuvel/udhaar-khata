"use client";

/**
 * TAB 1 — Khata dashboard: summary stats, the core entry card (parse + manual
 * with an explicit confirm step), demo banner and today's recent activity.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Wallet,
  Users,
  CircleCheck,
  Mic,
  MicOff,
  Loader2,
  SearchCheck,
  X,
  ClipboardPen,
  WifiOff,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { parse } from "@/lib/parser";
import type { CustomerPublic, ReportsResponse } from "@/lib/types";
import {
  EXAMPLE_SENTENCES,
  errOf,
  isValidPhone,
  khataPost,
} from "../api";
import { useVoiceInput } from "../use-voice";
import { EmptyState, SkeletonRows, TxnLine } from "../txn-line";
import { emptyEntry, EntryForm, type EntryValues } from "../entry-form";

type EntryMode = "parse" | "manual";
type Status = { msg: string; kind: "ok" | "error" | "" };

/** localStorage key for the in-progress entry (survives page reloads). */
const DRAFT_KEY = "udhaar-khata-draft-v1";

interface ConfirmState {
  text: string;
  values: EntryValues;
  parsedCustomer: string;
  parsedAmount: number;
}

export function KhataTab({
  customers,
  todayReport,
  loading,
  demoData,
  demoDismissed,
  onDismissDemo,
  refreshAll,
}: {
  customers: CustomerPublic[];
  todayReport: ReportsResponse | null;
  loading: boolean;
  demoData: boolean;
  demoDismissed: boolean;
  onDismissDemo: () => void;
  refreshAll: () => Promise<void>;
}) {
  const { toast } = useToast();

  const [entryMode, setEntryMode] = useState<EntryMode>("parse");
  const [sentence, setSentence] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [manual, setManual] = useState<EntryValues>(emptyEntry);
  const [status, setStatus] = useState<Status>({ msg: "", kind: "" });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{
    error: string;
    body: Record<string, unknown>;
  } | null>(null);

  /* ---------- offline awareness (no fake offline sync — honest banner) ---------- */
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  /* ---------- draft persistence: typed text + manual form survive reloads ---------- */
  const [draftHydrated, setDraftHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { sentence?: string; manual?: EntryValues };
        if (typeof d.sentence === "string") setSentence(d.sentence);
        if (d.manual && typeof d.manual === "object") {
          setManual({ ...emptyEntry, ...d.manual });
        }
      }
    } catch {
      // corrupted draft — ignore, start fresh
    }
    setDraftHydrated(true);
  }, []);
  useEffect(() => {
    if (!draftHydrated) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ sentence, manual }));
    } catch {
      // storage full/blocked — drafts are a nicety, not a requirement
    }
  }, [sentence, manual, draftHydrated]);

  /* ---------- voice input (preserved feature) ---------- */
  const voice = useVoiceInput((text) => setSentence(text));
  useEffect(() => {
    if (voice.error) setStatus({ msg: voice.error, kind: "error" });
  }, [voice.error]);

  /* ---------- "/" shortcut jumps to the entry box (desktop speed) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return; // already typing somewhere — don't hijack
      }
      e.preventDefault();
      document.getElementById("entry-sentence")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- summary stats ---------- */
  const totalOutstandingPaise = customers.reduce(
    (sum, c) => sum + Math.max(0, c.balancePaise),
    0
  );
  const withDues = customers.filter((c) => c.balancePaise > 0).length;
  const collectedTodayPaise = todayReport?.totals.paymentsPaise ?? null;

  /* ---------- parse preview (client-side; never saves) ---------- */
  const checkEntry = useCallback(() => {
    const text = sentence.trim();
    if (!text) {
      setStatus({
        msg: "Please enter a sentence, for example: 'Ramesh took 2 kg rice for 120 rupees'.",
        kind: "error",
      });
      return;
    }
    const parsed = parse(text);
    if (!parsed.ok || parsed.customer === undefined || parsed.amount === undefined) {
      setStatus({
        msg: parsed.error ?? "Could not read that line. Try: 'Ramesh paid 50'.",
        kind: "error",
      });
      setConfirm(null);
      return;
    }
    setStatus({ msg: "Check the entry below, then confirm to save.", kind: "" });
    setConfirm({
      text,
      parsedCustomer: parsed.customer,
      parsedAmount: parsed.amount,
      values: {
        customer: parsed.customer,
        amountRupees: String(parsed.amount),
        txnType: parsed.txnType ?? "UDHAAR",
        phone: "",
        note: "",
      },
    });
  }, [sentence]);

  /* ---------- save (the ONLY call that writes to the ledger) ---------- */
  const saveEntry = useCallback(
    async (values: EntryValues, forceBody?: Record<string, unknown>) => {
      if (!navigator.onLine) {
        setStatus({
          msg: "You are offline — the entry was kept as a draft. Save it once the connection returns.",
          kind: "error",
        });
        return;
      }
      const phone = values.phone.trim();
      if (phone && !isValidPhone(phone)) {
        setStatus({
          msg: "Phone should be exactly 10 digits — or leave it blank.",
          kind: "error",
        });
        return;
      }

      let body: Record<string, unknown>;
      if (forceBody) {
        body = { ...forceBody, force: true };
      } else if (confirm) {
        const amount = Number.parseFloat(values.amountRupees);
        if (!values.customer.trim()) {
          setStatus({ msg: "Customer name is required.", kind: "error" });
          return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          setStatus({ msg: "Amount must be greater than zero.", kind: "error" });
          return;
        }
        const edited =
          values.customer.trim() !== confirm.parsedCustomer ||
          Math.round(amount * 100) !== Math.round(confirm.parsedAmount * 100);
        body = edited
          ? {
              mode: "manual",
              customer: values.customer.trim(),
              amountRupees: amount,
              txnType: values.txnType,
              phone: phone || undefined,
            }
          : {
              mode: "parse",
              text: confirm.text,
              txnType: values.txnType,
              phone: phone || undefined,
            };
      } else {
        const amount = Number.parseFloat(values.amountRupees);
        if (!values.customer.trim()) {
          setStatus({ msg: "Customer name is required.", kind: "error" });
          return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          setStatus({ msg: "Amount must be greater than zero.", kind: "error" });
          return;
        }
        body = {
          mode: "manual",
          customer: values.customer.trim(),
          amountRupees: amount,
          txnType: values.txnType,
          phone: phone || undefined,
          note: values.note.trim() || undefined,
        };
      }

      setSaving(true);
      setStatus({ msg: "Saving…", kind: "" });
      try {
        const result = await khataPost<{
          ok: boolean;
          error?: string;
          transaction?: { amountPaise: number; txnType: string };
          customer?: { name: string; balancePaise: number };
          overLimit?: { creditLimitPaise: number; balanceAfterPaise: number } | null;
        }>("/api/transactions", body);

        if (result.status === 409) {
          setDuplicate({ error: errOf(result), body });
          setStatus({ msg: "", kind: "" });
          return;
        }
        if (!result.ok || !result.data.transaction || !result.data.customer) {
          setStatus({ msg: errOf(result, "Could not save the entry."), kind: "error" });
          return;
        }

        const txn = result.data.transaction;
        const cust = result.data.customer;
        const verb = txn.txnType === "PAYMENT" ? "payment" : "udhaar";
        setStatus({
          msg: `${cust.name}: recorded ${verb} of ${formatINR(txn.amountPaise)}. Balance is now ${formatINR(cust.balancePaise)}.`,
          kind: "ok",
        });
        toast({
          title: verb === "payment" ? "Payment recorded" : "Udhaar recorded",
          description: `${cust.name} · ${formatINR(txn.amountPaise)} · balance ${formatINR(cust.balancePaise)}`,
        });
        if (result.data.overLimit) {
          toast({
            title: "Credit limit crossed",
            description: `${cust.name}'s balance ${formatINR(
              result.data.overLimit.balanceAfterPaise
            )} is now above their ${formatINR(result.data.overLimit.creditLimitPaise)} limit.`,
          });
        }
        setSentence("");
        setConfirm(null);
        setManual(emptyEntry);
        await refreshAll();
      } catch (err) {
        setStatus({ msg: (err as Error).message, kind: "error" });
      } finally {
        setSaving(false);
      }
    },
    [confirm, refreshAll, toast]
  );

  const modeChip = (mode: EntryMode, label: string) => (
    <button
      type="button"
      aria-pressed={entryMode === mode}
      onClick={() => {
        setEntryMode(mode);
        setConfirm(null);
        setStatus({ msg: "", kind: "" });
      }}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        entryMode === mode
          ? "bg-[#0f5c4c] text-white"
          : "bg-[#efe4d2] text-[#5c6b62] hover:text-[#1c261f]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* ---------- offline banner ---------- */}
      {!online && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-[#9b2c2c]/40 bg-[#f6d9d9] px-4 py-3"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0 text-[#9b2c2c]" aria-hidden="true" />
          <p className="text-sm text-[#7a231f]">
            You are offline. Entries can&apos;t be saved right now — anything you type
            is kept as a draft and will still be here when the connection returns.
          </p>
        </div>
      )}

      {/* ---------- demo banner ---------- */}
      {demoData && !demoDismissed && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-2xl border border-[#c56a16]/40 bg-[#fde8d0] px-4 py-3"
        >
          <p className="text-sm text-[#7a4210]">
            This ledger contains demonstration data — not real business records. You
            can clear it in Settings.
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-[#7a4210] hover:bg-[#c56a16]/15"
            aria-label="Dismiss demonstration data notice"
            onClick={onDismissDemo}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* ---------- summary stats ---------- */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Today&apos;s summary
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="khata-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[#5c6b62]">
              <Wallet className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Total outstanding
              </span>
            </div>
            {loading && customers.length === 0 ? (
              <div className="mt-2">
                <SkeletonRows rows={1} />
              </div>
            ) : (
              <p className="mt-1.5 font-serif-khata text-2xl font-bold text-[#9b2c2c] tabular-nums">
                {formatINR(totalOutstandingPaise)}
              </p>
            )}
          </div>
          <div className="khata-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[#5c6b62]">
              <Users className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Customers with dues
              </span>
            </div>
            {loading && customers.length === 0 ? (
              <div className="mt-2">
                <SkeletonRows rows={1} />
              </div>
            ) : (
              <p className="mt-1.5 font-serif-khata text-2xl font-bold text-[#1c261f] tabular-nums">
                {withDues}
              </p>
            )}
          </div>
          <div className="khata-card rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[#5c6b62]">
              <CircleCheck className="size-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Collected today
              </span>
            </div>
            {loading && !todayReport ? (
              <div className="mt-2">
                <SkeletonRows rows={1} />
              </div>
            ) : (
              <p className="mt-1.5 font-serif-khata text-2xl font-bold text-[#0f5c4c] tabular-nums">
                {collectedTodayPaise === null ? "—" : formatINR(collectedTodayPaise)}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------- entry card ---------- */}
      <section aria-labelledby="entry-heading">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="entry-heading"
              className="font-serif-khata text-lg font-bold text-[#1c261f]"
            >
              New entry
            </h2>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Choose entry mode"
            >
              {modeChip("parse", "Speak or type a line")}
              {modeChip("manual", "Manual entry")}
            </div>
          </div>

          {entryMode === "parse" ? (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  id="entry-sentence"
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  placeholder="e.g. Ramesh took 2 kg rice for 120 rupees"
                  aria-label="Entry sentence"
                  aria-keyshortcuts="/"
                  className="bg-white border-[#e2d5c0]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") checkEntry();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={voice.listening ? "Stop listening" : "Speak the entry"}
                  aria-pressed={voice.listening}
                  onClick={voice.toggle}
                  className={`shrink-0 border-[#e2d5c0] ${
                    voice.listening
                      ? "khata-listening bg-[#9b2c2c] text-white hover:bg-[#9b2c2c] hover:text-white"
                      : "text-[#0f5c4c] hover:bg-[#0f5c4c]/10"
                  }`}
                >
                  {voice.listening ? (
                    <MicOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Mic className="size-4" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={checkEntry}
                  disabled={saving || voice.listening}
                  className="shrink-0 bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
                >
                  <SearchCheck className="size-4" aria-hidden="true" />
                  Check entry
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {EXAMPLE_SENTENCES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setSentence(example)}
                    className="rounded-full bg-[#efe4d2] px-3 py-1 text-xs font-medium text-[#5c6b62] transition-colors hover:text-[#1c261f]"
                    aria-label={`Fill example: ${example}`}
                  >
                    {example}
                  </button>
                ))}
                <span className="hidden sm:inline text-xs text-[#5c6b62]/70">
                  Tip: press{" "}
                  <kbd className="rounded border border-[#e2d5c0] bg-white px-1 py-0.5 text-[10px] font-semibold">
                    /
                  </kbd>{" "}
                  to jump here
                </span>
              </div>

              {voice.listening && (
                <p className="text-sm font-medium text-[#9b2c2c]" aria-live="polite">
                  Listening… speak the line the way you would write it.
                </p>
              )}

              {confirm && (
                <div className="mt-2 rounded-xl border border-[#e2d5c0] bg-white/70 p-3 sm:p-4">
                  <p className="text-sm text-[#5c6b62] italic mb-3">
                    You said: &ldquo;{confirm.text}&rdquo;
                  </p>
                  <EntryForm
                    values={confirm.values}
                    disabled={saving}
                    showNote={false}
                    onChange={(patch) =>
                      setConfirm((prev) =>
                        prev ? { ...prev, values: { ...prev.values, ...patch } } : prev
                      )
                    }
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => saveEntry(confirm.values)}
                      className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35] font-semibold"
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CircleCheck className="size-4" aria-hidden="true" />
                      )}
                      Confirm &amp; save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setConfirm(null)}
                      className="border-[#e2d5c0] text-[#5c6b62] hover:bg-[#efe4d2]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <EntryForm
                values={manual}
                disabled={saving}
                showNote
                onChange={(patch) => setManual((prev) => ({ ...prev, ...patch }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => saveEntry(manual)}
                  className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35] font-semibold"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ClipboardPen className="size-4" aria-hidden="true" />
                  )}
                  Save entry
                </Button>
              </div>
            </div>
          )}

          {/* live status line */}
          <p
            className={`mt-3 text-sm min-h-5 ${
              status.kind === "ok"
                ? "text-[#0f5c4c] font-medium"
                : status.kind === "error"
                  ? "text-[#9b2c2c] font-medium"
                  : "text-[#5c6b62]"
            }`}
            aria-live="polite"
          >
            {status.msg}
          </p>
        </div>
      </section>

      {/* ---------- recent activity ---------- */}
      <section aria-labelledby="recent-heading">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h2
            id="recent-heading"
            className="font-serif-khata text-lg font-bold text-[#1c261f] mb-1"
          >
            Recent activity
          </h2>
          <p className="text-xs text-[#5c6b62] mb-2">Entries recorded today</p>
          {loading && !todayReport ? (
            <SkeletonRows rows={4} />
          ) : (todayReport?.recent?.length ?? 0) === 0 ? (
            <EmptyState text="No entries today yet — the first line of the khata is yours to write." />
          ) : (
            <ul className="max-h-72 overflow-y-auto khata-scroll px-1">
              {todayReport!.recent.map((txn) => (
                <TxnLine key={txn.id} txn={txn} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- duplicate confirm ---------- */}
      <AlertDialog
        open={duplicate !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicate(null);
        }}
      >
        <AlertDialogContent className="khata-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
              Possible duplicate
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#5c6b62]">
              {duplicate?.error}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
              Don&apos;t save
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
              onClick={() => {
                const body = duplicate?.body;
                setDuplicate(null);
                if (body) void saveEntry(confirm?.values ?? emptyEntry, body);
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
