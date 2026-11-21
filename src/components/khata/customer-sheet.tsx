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
import {
  Archive,
  ArchiveRestore,
  Copy,
  IndianRupee,
  Loader2,
  MessageCircle,
  ReceiptText,
  Undo2,
  Wallet,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import type { CustomerPublic, TxnPublic } from "@/lib/types";
import {
  copyText,
  errOf,
  khataFetch,
  khataPost,
  openWhatsApp,
  upiLinkClient,
} from "./api";
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
  /** Credit limit in rupees as typed ("" = no limit). Saved with the profile. */
  const [creditLimit, setCreditLimit] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingStatement, setSendingStatement] = useState(false);
  const [reversing, setReversing] = useState<TxnPublic | null>(null);
  const [reversingBusy, setReversingBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  /** Shop's UPI VPA (from Settings) — null hides the pay-link actions. */
  const [upiId, setUpiId] = useState<string | null>(null);

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
      setCreditLimit(
        result.data.customer.creditLimitPaise != null
          ? String(result.data.customer.creditLimitPaise / 100)
          : ""
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [nameKey]);

  useEffect(() => {
    if (open && nameKey) {
      void loadDetail();
      // Fetch shop settings for the UPI pay-link actions (cheap, cached row).
      void khataFetch<{ ok: boolean; settings?: { upiId: string | null } }>("/api/settings")
        .then((r) => {
          setUpiId(r.ok && r.data.settings?.upiId ? r.data.settings.upiId : null);
        })
        .catch(() => setUpiId(null));
    }
    if (!open) {
      setCustomer(null);
      setTransactions([]);
      setError("");
      setSettleOpen(false);
      setArchiveOpen(false);
      setCreditLimit("");
    }
  }, [open, nameKey, loadDetail]);

  const saveProfile = useCallback(async () => {
    if (!nameKey) return;
    // Credit limit: blank clears the cap; otherwise it must be a valid amount.
    let creditLimitRupees: number | null = null;
    const limitText = creditLimit.trim();
    if (limitText !== "") {
      creditLimitRupees = Number.parseFloat(limitText);
      if (!Number.isFinite(creditLimitRupees) || creditLimitRupees < 0) {
        toast({
          title: "Invalid credit limit",
          description: "Use a number of rupees (0 or more), or leave it blank.",
          variant: "destructive",
        });
        return;
      }
    }
    setSavingProfile(true);
    try {
      const result = await khataFetch<{
        ok: boolean;
        error?: string;
        customer?: CustomerPublic;
      }>(`/api/customers/${encodeURIComponent(nameKey)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          notes: notes.trim(),
          creditLimitRupees,
        }),
      });
      if (!result.ok || !result.data.customer) {
        toast({ title: "Could not save profile", description: errOf(result), variant: "destructive" });
        return;
      }
      setCustomer(result.data.customer);
      toast({
        title: "Profile saved",
        description:
          creditLimitRupees === null
            ? `${result.data.customer.name}'s details updated — no credit limit.`
            : `${result.data.customer.name}'s details updated — credit limit ${formatINR(Math.round(creditLimitRupees * 100))}.`,
      });
      onMutated();
    } catch (e) {
      toast({ title: "Could not save profile", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }, [nameKey, phone, notes, creditLimit, toast, onMutated]);

  const sendReminder = useCallback(async () => {
    if (!customer) return;
    setSendingReminder(true);
    try {
      const result = await khataPost<{
        ok: boolean;
        reminder?: { whatsappUrl: string; message: string };
      }>("/api/reminders/customer", { name: customer.name });
      if (result.status === 201 && result.data.reminder) {
        const { whatsappUrl, message } = result.data.reminder;
        if (openWhatsApp(whatsappUrl)) {
          toast({
            title: "Reminder ready",
            description: "WhatsApp opened with the reminder message.",
          });
        } else {
          // Popup blocked — copy the message so nothing is silently lost.
          const copied = await copyText(message);
          toast({
            title: "Pop-up blocked — text copied",
            description: copied
              ? "The reminder text is on your clipboard. Paste it into any WhatsApp chat."
              : "Allow pop-ups for this site and try again.",
          });
        }
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
  const sendStatement = useCallback(
    async (action: "open" | "copy") => {
      if (!customer) return;
      setSendingStatement(true);
      try {
        const result = await khataPost<{
          ok: boolean;
          statement?: { whatsappUrl: string; message: string; lines: number };
        }>(`/api/customers/${encodeURIComponent(customer.nameKey)}/statement`, {});
        if (result.status === 201 && result.data.statement) {
          const { whatsappUrl, message, lines } = result.data.statement;
          if (action === "copy") {
            const copied = await copyText(message);
            toast({
              title: copied ? "Statement copied" : "Could not copy",
              description: copied
                ? `${lines} ledger line(s) — paste it into any chat or notes app.`
                : "Clipboard access was blocked by the browser.",
            });
            return;
          }
          if (openWhatsApp(whatsappUrl)) {
            toast({
              title: "Statement ready",
              description: `${lines} ledger line(s) — WhatsApp opened with the message.`,
            });
          } else {
            const copied = await copyText(message);
            toast({
              title: "Pop-up blocked — text copied",
              description: copied
                ? "The statement text is on your clipboard. Paste it into any WhatsApp chat."
                : "Allow pop-ups for this site and try again.",
            });
          }
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
    },
    [customer, toast]
  );

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

  /** One-tap settle: record a PAYMENT for the exact outstanding balance.
   *  force:true is safe here — the confirm dialog IS the explicit user intent,
   *  and a settle of the full balance cannot collide with a partial payment. */
  const settleFull = useCallback(async () => {
    if (!customer || customer.balancePaise <= 0) return;
    setSettling(true);
    try {
      const result = await khataPost<{
        ok: boolean;
        error?: string;
        transaction?: { amountPaise: number };
        customer?: { name: string; balancePaise: number };
      }>("/api/transactions", {
        mode: "manual",
        customer: customer.name,
        amountRupees: customer.balancePaise / 100,
        txnType: "PAYMENT",
        note: "Full balance settled (one-tap)",
        force: true,
      });
      if (!result.ok || !result.data.transaction) {
        toast({ title: "Could not record settlement", description: errOf(result), variant: "destructive" });
        return;
      }
      const newBalance = result.data.customer?.balancePaise ?? 0;
      toast({
        title: "Khata settled",
        description: `${customer.name} paid ${formatINR(customer.balancePaise)}. Balance is now ${formatINR(newBalance)}.`,
      });
      setSettleOpen(false);
      await loadDetail();
      onMutated();
    } catch (e) {
      toast({ title: "Could not record settlement", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSettling(false);
    }
  }, [customer, toast, loadDetail, onMutated]);

  const isDue = (customer?.balancePaise ?? 0) > 0;
  const upiHref =
    customer && isDue && upiId
      ? upiLinkClient(upiId, customer.name, customer.balancePaise, `Udhaar ${customer.name}`)
      : null;
  const overLimit =
    customer != null &&
    customer.creditLimitPaise != null &&
    customer.balancePaise > customer.creditLimitPaise;

  /** Archive (settled customers only — enforced server-side) or unarchive. */
  const setArchived = useCallback(
    async (value: boolean) => {
      if (!nameKey) return;
      setArchiving(true);
      try {
        const result = await khataFetch<{ ok: boolean; error?: string }>(
          `/api/customers/${encodeURIComponent(nameKey)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ archived: value }),
          }
        );
        if (!result.ok) {
          toast({
            title: value ? "Could not archive" : "Could not unarchive",
            description: errOf(result),
            variant: "destructive",
          });
          return;
        }
        toast({
          title: value ? "Customer archived" : "Customer unarchived",
          description: value
            ? "They are hidden from the active lists (Archived chip in the Customers tab)."
            : "They are back in the active lists.",
        });
        setArchiveOpen(false);
        await loadDetail();
        onMutated();
      } catch (e) {
        toast({
          title: value ? "Could not archive" : "Could not unarchive",
          description: (e as Error).message,
          variant: "destructive",
        });
      } finally {
        setArchiving(false);
      }
    },
    [nameKey, toast, loadDetail, onMutated]
  );

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
                {overLimit && (
                  <span className="inline-flex items-center rounded-full bg-[#fde8d0] px-2.5 py-1 text-xs font-bold text-[#c56a16]">
                    Over limit {formatINR(customer.creditLimitPaise!)}
                  </span>
                )}
                {customer.archived && (
                  <span className="inline-flex items-center rounded-full bg-[#e2d5c0] px-2.5 py-1 text-xs font-bold text-[#5c6b62]">
                    Archived
                  </span>
                )}
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
                    <Label htmlFor="cust-credit-limit" className="text-sm">
                      Credit limit (₹, optional)
                    </Label>
                    <Input
                      id="cust-credit-limit"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={creditLimit}
                      placeholder="e.g. 500 — blank for no limit"
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="bg-white border-[#e2d5c0]"
                    />
                    <p className="text-xs text-[#5c6b62]">
                      Udhaar that crosses this limit still saves — but you get a clear
                      warning, and the customer is flagged everywhere.
                    </p>
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
                  {isDue && (
                    <Button
                      type="button"
                      onClick={() => setSettleOpen(true)}
                      className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
                      aria-label={`Record full payment of ${formatINR(customer.balancePaise)} from ${customer.name}`}
                    >
                      <Wallet className="size-4" aria-hidden="true" />
                      Settle full balance
                    </Button>
                  )}
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
                    onClick={() => void sendStatement("open")}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={sendingStatement}
                    onClick={() => void sendStatement("copy")}
                    className="text-[#5c6b62] hover:bg-[#efe4d2]"
                    aria-label="Copy statement text to clipboard"
                    title="Copy statement text"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                  {upiHref && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        window.location.href = upiHref;
                      }}
                      className="border-[#c56a16] text-[#c56a16] hover:bg-[#c56a16]/10"
                      aria-label={`Collect ${formatINR(customer.balancePaise)} from ${customer.name} via UPI`}
                      title="Opens the customer's UPI app with the amount pre-filled (on mobile)"
                    >
                      <IndianRupee className="size-4" aria-hidden="true" />
                      Pay via UPI
                    </Button>
                  )}
                  {customer.archived ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={archiving}
                      onClick={() => void setArchived(false)}
                      className="border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10"
                      aria-label={`Unarchive ${customer.name}`}
                    >
                      {archiving ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArchiveRestore className="size-4" aria-hidden="true" />
                      )}
                      Unarchive customer
                    </Button>
                  ) : (
                    !isDue && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={archiving}
                        onClick={() => setArchiveOpen(true)}
                        className="text-[#9b2c2c] hover:bg-[#9b2c2c]/10"
                        aria-label={`Archive ${customer.name}`}
                        title="Hidden from the active lists — only settled customers can be archived"
                      >
                        <Archive className="size-4" aria-hidden="true" />
                        Archive customer
                      </Button>
                    )
                  )}
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

      {/* archive confirmation */}
      <AlertDialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open) setArchiveOpen(false);
        }}
      >
        <AlertDialogContent className="khata-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
              Archive {customer?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#5c6b62]">
              They will be hidden from the active lists (find them under the
              &ldquo;Archived&rdquo; chip in the Customers tab). Their ledger history is kept
              forever, and you can unarchive them any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#9b2c2c] text-white hover:bg-[#7a231f]"
              onClick={() => void setArchived(true)}
              disabled={archiving}
            >
              {archiving && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              <Archive className="size-4" aria-hidden="true" />
              Archive customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* settle-up confirmation */}
      <AlertDialog
        open={settleOpen}
        onOpenChange={(open) => {
          if (!open) setSettleOpen(false);
        }}
      >
        <AlertDialogContent className="khata-card max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
              Record full payment?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#5c6b62]">
              This records a payment of{" "}
              <span className="font-bold text-[#0f5c4c]">
                {customer ? formatINR(customer.balancePaise) : ""}
              </span>{" "}
              from {customer?.name} and brings the balance to ₹0.00. The payment line
              stays in the ledger like any other entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
              onClick={settleFull}
              disabled={settling}
            >
              {settling && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              <Wallet className="size-4" aria-hidden="true" />
              Record payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
