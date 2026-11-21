import { db } from "@/lib/db";
import { parse, type ParseResult } from "@/lib/parser";

/** Normalize a customer name into a stable key: trimmed, single-spaced, uppercase. */
export function nameKey(name: string): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Keep only 10-digit Indian phone numbers (strips +91 / 91 prefixes). */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

/** Build a wa.me deep link with a pre-filled Hinglish reminder message. */
export function whatsappLink(
  name: string,
  balance: number,
  phone?: string | null
): { url: string; message: string } {
  const amount = round2(balance).toFixed(2);
  const message = `Namaste ${name} ji, aapka udhaar Rs ${amount} pending hai. Kripya jald payment kar dein. Dhanyavaad! — Udhaar Khata`;
  const encoded = encodeURIComponent(message);
  const digits = normalizePhone(phone);
  const url = digits
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  return { url, message };
}

export function daysSince(iso: Date | null | undefined): number {
  if (!iso) return 0;
  const delta = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(delta / 86_400_000));
}

export function money(n: number): string {
  return "₹" + Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface PublicCustomer {
  name: string;
  nameKey: string;
  balance: number;
  phone: string | null;
  firstDueAt: string | null;
  lastTxnAt: string | null;
  createdAt: string;
}

export interface PublicTransaction {
  id: string;
  name: string;
  amount: number;
  txnType: "UDHAAR" | "PAYMENT";
  rawText: string;
  createdAt: string;
}

export interface PublicReminder {
  id: string;
  name: string;
  balance: number;
  daysOverdue: number;
  phone: string | null;
  whatsappUrl: string;
  message: string;
  runId: string;
  createdAt: string;
}

export async function addTransaction(
  customer: string,
  amount: number,
  txnType: "UDHAAR" | "PAYMENT",
  rawText: string,
  phone?: string | null
) {
  const amountR = round2(amount);
  if (amountR <= 0) throw new Error("Amount must be greater than zero.");

  const key = nameKey(customer);
  const now = new Date();
  const existing = await db.customer.findUnique({ where: { nameKey: key } });
  const oldBalance = existing?.balance ?? 0;
  const newBalance =
    txnType === "UDHAAR" ? round2(oldBalance + amountR) : round2(oldBalance - amountR);

  let firstDueAt = existing?.firstDueAt ?? null;
  if (newBalance > 0 && (!firstDueAt || oldBalance <= 0)) {
    firstDueAt = now;
  }
  if (newBalance <= 0) {
    firstDueAt = null;
  }

  const savedPhone = normalizePhone(phone) ?? existing?.phone ?? null;
  const displayName = existing?.name ?? customer;

  // Customer row must exist before the ledger line (FK), so upsert first.
  const [, txn] = await db.$transaction([
    db.customer.upsert({
      where: { nameKey: key },
      create: {
        nameKey: key,
        name: displayName,
        balance: newBalance,
        phone: savedPhone,
        firstDueAt,
        lastTxnAt: now,
      },
      update: {
        name: displayName,
        balance: newBalance,
        phone: savedPhone,
        firstDueAt,
        lastTxnAt: now,
      },
    }),
    db.transaction.create({
      data: {
        nameKey: key,
        name: displayName,
        amount: amountR,
        txnType,
        rawText,
        createdAt: now,
      },
    }),
  ]);

  return {
    transaction: txn,
    customer: {
      name: displayName,
      nameKey: key,
      balance: newBalance,
      phone: savedPhone,
      firstDueAt: firstDueAt ? firstDueAt.toISOString() : null,
      lastTxnAt: now.toISOString(),
    },
  };
}

export async function saveParsedTransaction(
  parsed: ParseResult,
  phone?: string | null
) {
  return addTransaction(
    parsed.customer!,
    parsed.amount!,
    parsed.txnType!,
    parsed.rawText,
    phone
  );
}

export async function listCustomers(): Promise<PublicCustomer[]> {
  const rows = await db.customer.findMany();
  return rows
    .map((c) => ({
      name: c.name,
      nameKey: c.nameKey,
      balance: c.balance,
      phone: c.phone,
      firstDueAt: c.firstDueAt ? c.firstDueAt.toISOString() : null,
      lastTxnAt: c.lastTxnAt ? c.lastTxnAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

export async function listTransactions(name: string): Promise<PublicTransaction[]> {
  const key = nameKey(name);
  const rows = await db.transaction.findMany({
    where: { nameKey: key },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    amount: t.amount,
    txnType: t.txnType as "UDHAAR" | "PAYMENT",
    rawText: t.rawText,
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function listReminders(limit = 50): Promise<PublicReminder[]> {
  const rows = await db.reminder.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    balance: r.balance,
    daysOverdue: r.daysOverdue,
    phone: r.phone,
    whatsappUrl: r.whatsappUrl,
    message: r.message,
    runId: r.runId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Reminder run (port of the Step Functions task): find customers whose dues
 * are older than `overdueDays` and write reminder records with WhatsApp links.
 */
export async function writeReminders(
  overdueDays: number,
  runId?: string
): Promise<PublicReminder[]> {
  const days = Math.max(0, Math.floor(overdueDays));
  const rid = runId ?? Math.random().toString(36).slice(2, 12);
  const written: PublicReminder[] = [];

  for (const customer of await listCustomers()) {
    const balance = round2(customer.balance);
    if (balance <= 0) continue;
    const dueFrom = customer.firstDueAt
      ? new Date(customer.firstDueAt)
      : customer.lastTxnAt
        ? new Date(customer.lastTxnAt)
        : null;
    const age = daysSince(dueFrom);
    if (age < days) continue;

    const { url, message } = whatsappLink(customer.name, balance, customer.phone);
    const row = await db.reminder.create({
      data: {
        nameKey: customer.nameKey,
        name: customer.name,
        balance,
        daysOverdue: age,
        phone: customer.phone,
        whatsappUrl: url,
        message,
        runId: rid,
      },
    });
    written.push({
      id: row.id,
      name: row.name,
      balance: row.balance,
      daysOverdue: row.daysOverdue,
      phone: row.phone,
      whatsappUrl: row.whatsappUrl,
      message: row.message,
      runId: row.runId,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return written;
}
