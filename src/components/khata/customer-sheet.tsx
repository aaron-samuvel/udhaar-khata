"use client";

/**
 * Customer detail sheet: profile editing, WhatsApp reminder, full ledger
 * history with per-entry reversal (behind an explicit confirm dialog).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, MessageCircle, ReceiptText, Undo2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { CustomerPublic, TxnPublic } from "@/lib/types";
import { errOf, khataFetch, khataPost } from "./api";
import { EmptyState, SkeletonRows, TxnLine } from "./txn-line";

export function CustomerSheet({
  nameKey,
  open,
  onOpenChange,
  onMutated,
}: {
  /** The selected customer's nameKey; null closes and clears. */
  nameKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any mutation so the parent list + dashboard refresh. */
  onMutated: () => void;
}) {
  const { toast } = useToast();
  const [customer, setCustomer] = useState<CustomerPublic | null>(null);
  const [transactions, setTransactions] = useState<TxnPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingStatement, setSendingStatement] = useState(false);
  const [reversing, setReversing] = useState<TxnPublic | null>(null);
  const [reversingBusy, setReversingBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!nameKey) return;
    setLoading(true);
    setError("");
    try {
      const result = await khataFetch<{
        ok: boolean;
        error?: string;
        customer?: CustomerPublic;
        transactions?: TxnPublic[];
      }>(`/api/customers/${encodeURIComponent(nameKey)}/transactions`);
      if (!result.ok || !result.data.customer) {
        setError(errOf(result, "Could not load this customer's khata."));
        return;
      }
      setCustomer(result.data.customer);
      setTransactions(result.data.transactions ?? []);
      setPhone(result.data.customer.phone ?? "");
      setNotes(result.data.customer.notes ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [nameKey]);

  useEffect(() => {
    if (open && nameKey) {
      void loadDetail();
    }
    if (!open) {
      setCustomer(null);
      setTransactions([]);
      setError("");
    }
  }, [open, nameKey, loadDetail]);

  const saveProfile = useCallback(async () => {
    if (!nameKey) return;
    setSavingProfile(true);
    try {
      const result = await khataFetch<{
        ok: boolean;
        error?: string;
        customer?: CustomerPublic;
      }>(`/api/customers/${encodeURIComponent(nameKey)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), notes: notes.trim() }),
      });
      if (!result.ok || !result.data.customer) {
        toast({ title: "Could not save profile", description: errOf(result), variant: "destructive" });
        return;
      }
      setCustomer(result.data.customer);
      toast({ title: "Profile saved", description: `${result.data.customer.name}'s details updated.` });
      onMutated();
    } catch (e) {
      toast({ title: "Could not save profile", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }, [nameKey, phone, notes, toast, onMutated]);

  const sendReminder = useCallback(async () => {
    if (!customer) return;
    setSendingReminder(true);
    try {
      const result = await khataPost<{ ok: boolean; reminder?: { whatsappUrl: string } }>(
        "/api/reminders/customer",
        { name: customer.name }
      );
      if (result.status === 201 && result.data.reminder) {
        toast({
          title: "Reminder ready",
          description: "WhatsApp opened with the reminder message.",
        });
        window.open(result.data.reminder.whatsappUrl, "_blank", "noopener,noreferrer");
        onMutated();
      } else {
        toast({
          title: "No reminder sent",
          description: errOf(result, "This customer has no outstanding balance."),
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "No reminder sent", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSendingReminder(false);
    }
  }, [customer, toast, onMutated]);

  /** WhatsApp-ready statement (last ledger lines + balance) — works even
   *  for settled customers, so it doubles as a receipt. */
  const sendStatement = useCallback(async () => {
    if (!customer) return;
    setSendingStatement(true);
    try {
      const result = await khataPost<{
        ok: boolean;
        statement?: { whatsappUrl: string; lines: number };
      }>(`/api/customers/${encodeURIComponent(customer.nameKey)}/statement`, {});
      if (result.status === 201 && result.data.statement) {
        toast({
          title: "Statement ready",
          description: `${result.data.statement.lines} ledger line(s) — WhatsApp opened with the message.`,
        });
        window.open(result.data.statement.whatsappUrl, "_blank", "noopener,noreferrer");
      } else {
        toast({
          title: "No statement sent",
          description: errOf(result, "Could not build the statement."),
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "No statement sent", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSendingStatement(false);
    }
  }, [customer, toast]);

  const confirmReverse = useCallback(async () => {
    if (!reversing) return;
    setReversingBusy(true);
    try {
      const result = await khataPost(`/api/transactions/${reversing.id}/reverse`, {});
      if (!result.ok) {
        toast({ title: "Could not reverse entry", description: errOf(result), variant: "destructive" });
        return;
      }
      toast({ title: "Entry reversed", description: "A correction line was added to the ledger." });
      setReversing(null);
      await loadDetail();
      onMutated();
    } catch (e) {
      toast({ title: "Could not reverse entry", description: (e as Error).message, variant: "destructive" });
    } finally {
      setReversingBusy(false);
    }
  }, [reversing, toast, loadDetail, onMutated]);

  const isDue = (customer?.balancePaise ?? 0) > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="khata-card sm:max-w-md overflow-y-auto khata-scroll"
        >
          <SheetHeader>
            <SheetTitle className="font-serif-khata text-xl text-[#1c261f]">
              {customer?.name ?? "Customer"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Customer khata details, profile editing and ledger history.
            </SheetDescription>
            {customer && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                    isDue
                      ? "bg-[#f6d9d9] text-[#9b2c2c]"
                      : "bg-[#d8e8e1] text-[#0f5c4c]"
                  }`}
                >
                  {isDue
                    ? `Due ${formatINR(customer.balancePaise)}`
                    : `Settled ${formatINR(customer.balancePaise)}`}
                </span>
                {customer.phone && (
                  <span className="text-sm text-[#5c6b62]">{customer.phone}</span>
                )}
              </div>
            )}
          </SheetHeader>

          {loading ? (
            <div className="px-4 pb-6">
              <SkeletonRows rows={5} />
            </div>
          ) : error ? (
            <p className="px-4 pb-6 text-sm font-medium text-[#9b2c2c]" role="alert">
              {error}
            </p>
          ) : !customer ? null : (
            <div className="space-y-6 px-4 pb-8">
              {/* profile */}
              <section aria-label="Customer profile">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5c6b62] mb-2">
                  Profile
                </h3>
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cust-phone" className="text-sm">
                      Phone
                    </Label>
                    <Input
                      id="cust-phone"
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      placeholder="9876543210"
                      onChange={(e) => setPhone(e.target.value)}
                      className="bg-white border-[#e2d5c0]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cust-notes" className="text-sm">
                      Notes
                    </Label>
                    <Textarea
                      id="cust-notes"
                      value={notes}
                      placeholder="Private note about this customer…"
                      onChange={(e) => setNotes(e.target.value)}
                      className="bg-white border-[#e2d5c0] min-h-20"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
                  >
                    {savingProfile && (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    )}
                    Save profile
                  </Button>
                </div>
              </section>

              {/* quick actions */}
              <section aria-label="Quick actions">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5c6b62] mb-2">
                  Quick actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={sendingReminder}
                    onClick={sendReminder}
                    className="bg-[#128c7e] text-white hover:bg-[#0e7263]"
                    aria-label={`Send WhatsApp reminder to ${customer.name}`}
                  >
                    {sendingReminder ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageCircle className="size-4" aria-hidden="true" />
                    )}
                    WhatsApp reminder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sendingStatement}
                    onClick={sendStatement}
                    className="border-[#128c7e] text-[#128c7e] hover:bg-[#128c7e]/10"
                    aria-label={`Send WhatsApp statement to ${customer.name}`}
                  >
                    {sendingStatement ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ReceiptText className="size-4" aria-hidden="true" />
                    )}
                    Send statement
                  </Button>
                </div>
              </section>

              {/* ledger history */}
              <section aria-label="Ledger history">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5c6b62] mb-2">
                  Ledger history
                </h3>
                {transactions.length === 0 ? (
                  <EmptyState text="No entries yet for this customer." />
                ) : (
                  <ul className="max-h-96 overflow-y-auto khata-scroll pr-1">
                    {transactions.map((txn) => (
                      <TxnLine
                        key={txn.id}
                        txn={txn}
                        showName={false}
                        onReverse={(t) => setReversing(t)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* reverse confirmation */}
      <AlertDialog
        open={reversing !== null}
        onOpenChange={(open) => {
          if (!open) setReversing(null);
        }}
      >
        <AlertDialogContent className="khata-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
              Reverse this entry?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#5c6b62]">
              A correction line will be added and the balance adjusted. This does not
              delete history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#9b2c2c] text-white hover:bg-[#7a231f]"
              onClick={confirmReverse}
              disabled={reversingBusy}
            >
              {reversingBusy && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              <Undo2 className="size-4" aria-hidden="true" />
              Reverse entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
