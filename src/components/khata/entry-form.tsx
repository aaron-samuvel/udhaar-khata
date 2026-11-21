"use client";

/**
 * The editable entry form shared by parse-confirm and manual entry modes.
 * Used only AFTER the user has explicitly triggered an entry — the parser
 * never saves anything without this form's confirm step.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, rupeesToPaise } from "@/lib/format";
import type { TxnType } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EntryValues {
  customer: string;
  /** Kept as the raw input string so the field behaves naturally while typing. */
  amountRupees: string;
  txnType: TxnType;
  phone: string;
  note: string;
}

export const emptyEntry: EntryValues = {
  customer: "",
  amountRupees: "",
  txnType: "UDHAAR",
  phone: "",
  note: "",
};

export function EntryForm({
  values,
  onChange,
  showNote,
  disabled,
}: {
  values: EntryValues;
  onChange: (patch: Partial<EntryValues>) => void;
  showNote: boolean;
  disabled?: boolean;
}) {
  const parsedAmount = Number.parseFloat(values.amountRupees);
  const showAmountPreview =
    values.txnType === "UDHAAR"
      ? "recorded as udhaar (credit given)"
      : "recorded as payment (cash received)";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="entry-customer" className="text-sm text-[#1c261f]">
          Customer name
        </Label>
        <Input
          id="entry-customer"
          value={values.customer}
          disabled={disabled}
          placeholder="e.g. Ramesh"
          onChange={(e) => onChange({ customer: e.target.value })}
          className="bg-white border-[#e2d5c0]"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="entry-amount" className="text-sm text-[#1c261f]">
          Amount ₹
        </Label>
        <Input
          id="entry-amount"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={values.amountRupees}
          disabled={disabled}
          placeholder="0.00"
          onChange={(e) => onChange({ amountRupees: e.target.value })}
          className="bg-white border-[#e2d5c0]"
        />
        {Number.isFinite(parsedAmount) && parsedAmount > 0 && (
          <p
            className={cn(
              "text-xs font-semibold",
              values.txnType === "UDHAAR" ? "text-[#9b2c2c]" : "text-[#0f5c4c]"
            )}
            aria-live="polite"
          >
            {values.txnType === "UDHAAR" ? "+" : "−"}
            {formatINR(rupeesToPaise(parsedAmount))} · {showAmountPreview}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label className="text-sm text-[#1c261f]">Type</Label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entry type">
          <button
            type="button"
            aria-pressed={values.txnType === "UDHAAR"}
            disabled={disabled}
            onClick={() => onChange({ txnType: "UDHAAR" })}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
              values.txnType === "UDHAAR"
                ? "bg-[#9b2c2c] text-white border-[#9b2c2c]"
                : "bg-white text-[#5c6b62] border-[#e2d5c0] hover:border-[#9b2c2c]/50"
            )}
          >
            Udhaar (due)
          </button>
          <button
            type="button"
            aria-pressed={values.txnType === "PAYMENT"}
            disabled={disabled}
            onClick={() => onChange({ txnType: "PAYMENT" })}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
              values.txnType === "PAYMENT"
                ? "bg-[#0f5c4c] text-white border-[#0f5c4c]"
                : "bg-white text-[#5c6b62] border-[#e2d5c0] hover:border-[#0f5c4c]/50"
            )}
          >
            Payment (received)
          </button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="entry-phone" className="text-sm text-[#1c261f]">
          Phone <span className="font-normal text-[#5c6b62]">(optional)</span>
        </Label>
        <Input
          id="entry-phone"
          type="tel"
          inputMode="numeric"
          value={values.phone}
          disabled={disabled}
          placeholder="9876543210"
          onChange={(e) => onChange({ phone: e.target.value })}
          className="bg-white border-[#e2d5c0]"
        />
        <p className="text-xs text-[#5c6b62]">10 digits, for WhatsApp reminders</p>
      </div>

      {showNote && (
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="entry-note" className="text-sm text-[#1c261f]">
            Note <span className="font-normal text-[#5c6b62]">(optional)</span>
          </Label>
          <Input
            id="entry-note"
            value={values.note}
            disabled={disabled}
            maxLength={200}
            placeholder="e.g. 2 kg rice, paying Friday"
            onChange={(e) => onChange({ note: e.target.value })}
            className="bg-white border-[#e2d5c0]"
          />
        </div>
      )}
    </div>
  );
}
