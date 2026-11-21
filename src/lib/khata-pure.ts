/**
 * Pure (storage-free) helpers shared by the server (khata.ts) and the
 * browser-side local ledger (components/khata/local-server.ts).
 *
 * IMPORTANT: this file must never import from @/lib/db (Prisma) — it is
 * bundled into the client for the static GitHub Pages build. Prisma types are
 * referenced with `import type`, which is erased at compile time.
 */
import type { Customer, Reminder, Settings, Transaction } from "@prisma/client";
import { amountInWords } from "@/lib/format";
import type {
  CustomerPublic,
  ReminderPublic,
  SettingsPublic,
  TxnPublic,
  TxnType,
} from "@/lib/types";

/** Maximum single-transaction amount: ₹10,00,000 (sane kirana upper bound). */
export const RUPEE_MAX = 1_000_000;
/** Window in which an identical entry triggers a duplicate warning. */
export const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;
export const DEFAULT_REMINDER_TEMPLATE =
  "Namaste {name} ji, aapka udhaar Rs {amount} pending hai. Kripya jald payment kar dein. Dhanyavaad! — {shop}";

/** Structural stand-ins for the Prisma models so client code can reuse the
 * serializers without a runtime Prisma dependency. Dates stay Date objects. */
export interface TxnLike {
  id: string;
  name: string;
  nameKey: string;
  amountPaise: number;
  txnType: string;
  rawText: string;
  note: string | null;
  reversed: boolean;
  isReversal: boolean;
  createdAt: Date;
}

export interface CustomerLike {
  name: string;
  nameKey: string;
  balancePaise: number;
  phone: string | null;
  notes: string | null;
  creditLimitPaise: number | null;
  archived: boolean;
  firstDueAt: Date | null;
  lastTxnAt: Date | null;
  createdAt: Date;
}

export interface ReminderLike {
  id: string;
  nameKey: string;
  name: string;
  balancePaise: number;
  daysOverdue: number;
  phone: string | null;
  whatsappUrl: string;
  message: string;
  runId: string;
  createdAt: Date;
}

/** Structural stand-in for the Prisma Settings model. */
export interface SettingsLike {
  shopName: string;
  overdueDays: number;
  reminderTemplate: string;
  upiId: string | null;
  demoData: boolean;
}

export function nameKey(name: string): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Keep only 10-digit Indian mobile numbers (strips +91 / 91 prefixes). */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

/** Render the reminder template. Supported placeholders: {name} {amount} {shop} {days}. */
export function renderTemplate(
  tpl: string,
  vars: { name: string; amount: string; shop: string; days: number }
): string {
  return tpl
    .replace(/\{name\}/g, vars.name)
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{shop\}/g, vars.shop)
    .replace(/\{days\}/g, String(vars.days));
}

/* ---------------- UPI collect links ---------------- */

/** Basic UPI VPA shape: local@bank (letters/digits/dots/hyphens/underscores). */
export function isValidUpiId(v: string): boolean {
  return /^[A-Za-z0-9.\-_]{2,256}@[A-Za-z]{2,64}$/.test(v.trim());
}

/**
 * UPI deep link (intent URI) that opens any UPI app (GPay/PhonePe/Paytm/BHIM)
 * with the amount pre-filled. This is the honest alternative to sending money
 * requests — the customer sees the amount and approves it in THEIR app.
 */
export function upiCollectLink(
  upiId: string,
  payeeName: string,
  amountPaise: number,
  note: string
): string {
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: payeeName.slice(0, 50),
    am: (amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}

/**
 * Extras appended after the shopkeeper's reminder template: the amount in
 * words (standard on Indian receipts) and, when a UPI ID is configured, a
 * one-tap payment link.
 */
export function reminderExtras(
  settings: SettingsLike,
  name: string,
  balancePaise: number
): string[] {
  const extras: string[] = [];
  extras.push(`Amount in words: ${amountInWords(balancePaise)}`);
  if (settings.upiId && isValidUpiId(settings.upiId)) {
    extras.push(
      `Pay in one tap: ${upiCollectLink(settings.upiId, settings.shopName, balancePaise, `Udhaar ${name}`)}`
    );
  }
  return extras;
}

/* ---------------- serializers ---------------- */

export function publicTxn(t: TxnLike): TxnPublic {
  return {
    id: t.id,
    name: t.name,
    nameKey: t.nameKey,
    amount: t.amountPaise / 100,
    amountPaise: t.amountPaise,
    txnType: t.txnType as TxnType,
    rawText: t.rawText,
    note: t.note,
    reversed: t.reversed,
    isReversal: t.isReversal,
    createdAt: t.createdAt.toISOString(),
  };
}

export function publicCustomer(c: CustomerLike): CustomerPublic {
  return {
    name: c.name,
    nameKey: c.nameKey,
    balance: c.balancePaise / 100,
    balancePaise: c.balancePaise,
    phone: c.phone,
    notes: c.notes,
    creditLimitPaise: c.creditLimitPaise ?? null,
    creditLimit: c.creditLimitPaise != null ? c.creditLimitPaise / 100 : null,
    archived: c.archived,
    firstDueAt: c.firstDueAt?.toISOString() ?? null,
    lastTxnAt: c.lastTxnAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function publicSettings(s: SettingsLike): SettingsPublic {
  return {
    shopName: s.shopName,
    overdueDays: s.overdueDays,
    reminderTemplate: s.reminderTemplate,
    upiId: s.upiId ?? null,
    demoData: s.demoData,
  };
}

export function publicReminder(r: ReminderLike): ReminderPublic {
  return {
    id: r.id,
    name: r.name,
    balance: r.balancePaise / 100,
    balancePaise: r.balancePaise,
    daysOverdue: r.daysOverdue,
    phone: r.phone,
    whatsappUrl: r.whatsappUrl,
    message: r.message,
    runId: r.runId,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Whole days elapsed since a Date (0 for null/undefined or future dates). */
export function daysSince(date: Date | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

/* Prisma-model compatibility checks (type-level only, erased at build). */
export type _TxnCompatible = Transaction extends TxnLike ? true : never;
export type _CustomerCompatible = Customer extends CustomerLike ? true : never;
export type _ReminderCompatible = Reminder extends ReminderLike ? true : never;
export type _SettingsCompatible = Settings extends SettingsLike ? true : never;
