"use client";

/**
 * Shared ledger line + loading/empty primitives.
 * Money convention (never break): UDHAAR = red "+" · PAYMENT = teal "−".
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Undo2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { TxnPublic } from "@/lib/types";
import { amountStyle, relTime } from "./api";

export function TxnLine({
  txn,
  onReverse,
  showName = true,
}: {
  txn: TxnPublic;
  /** When provided, a ghost "Reverse" button is shown for original, active lines. */
  onReverse?: (txn: TxnPublic) => void;
  showName?: boolean;
}) {
  const { className, sign } = amountStyle(txn.txnType);
  const canReverse = Boolean(onReverse) && !txn.reversed && !txn.isReversal;

  return (
    <li className="py-2.5 border-b border-[#e2d5c0]/70 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                txn.txnType === "UDHAAR"
                  ? "bg-[#f6d9d9] text-[#9b2c2c]"
                  : "bg-[#d8e8e1] text-[#0f5c4c]"
              }`}
            >
              {txn.txnType === "UDHAAR" ? "Udhaar" : "Payment"}
            </span>
            {showName && (
              <span className="font-semibold text-[#1c261f] truncate">{txn.name}</span>
            )}
            <span className="text-xs text-[#5c6b62]">{relTime(txn.createdAt)}</span>
            {txn.reversed && (
              <Badge variant="secondary" className="bg-[#efe4d2] text-[#5c6b62] border-none">
                REVERSED
              </Badge>
            )}
            {txn.isReversal && (
              <Badge variant="secondary" className="bg-[#efe4d2] text-[#5c6b62] border-none">
                REVERSAL
              </Badge>
            )}
          </div>
          {txn.rawText && (
            <p className="text-sm text-[#5c6b62] italic mt-0.5 truncate">
              &ldquo;{txn.rawText}&rdquo;
            </p>
          )}
          {txn.note && (
            <p className="text-sm text-[#1c261f]/80 mt-0.5 truncate">Note: {txn.note}</p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className={`font-bold tabular-nums ${className}`}>
            {sign}
            {formatINR(txn.amountPaise)}
          </span>
          {canReverse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-[#5c6b62] hover:text-[#9b2c2c]"
              aria-label={`Reverse entry for ${txn.name} of ${formatINR(txn.amountPaise)}`}
              onClick={() => onReverse?.(txn)}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              Reverse
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Animated placeholder rows while data loads. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-1/3 bg-[#e9dcc6]" />
            <Skeleton className="h-3 w-2/3 bg-[#efe4d2]" />
          </div>
          <Skeleton className="h-4 w-16 bg-[#e9dcc6]" />
        </div>
      ))}
    </div>
  );
}

/** Short friendly empty state. */
export function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm text-[#5c6b62] py-6 text-center" aria-live="polite">
      {text}
    </p>
  );
}
