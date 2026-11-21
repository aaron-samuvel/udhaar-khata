import { db } from "@/lib/db";
import { amountInWords, formatINR, istDayKey, istDayStart, istTimestamp } from "@/lib/format";
import type {
  AuditPublic,
  CustomerPublic,
  ReminderPublic,
  SettingsPublic,
  TxnPublic,
  TxnType,
} from "@/lib/types";
import type { Customer, Reminder, Settings, Transaction } from "@prisma/client";

/** Maximum single-transaction amount: ₹10,00,000 (sane kirana upper bound). */
export const RUPEE_MAX = 1_000_000;
/** Window in which an identical entry triggers a duplicate warning. */
export const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;
export const DEFAULT_REMINDER_TEMPLATE =
  "Namaste {name} ji, aapka udhaar Rs {amount} pending hai. Kripya jald payment kar dein. Dhanyavaad! — {shop}";

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
function reminderExtras(
  settings: Settings,
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

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<Settings> {
  return db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

export function publicSettings(s: Settings): SettingsPublic {
  return {
    shopName: s.shopName,
    overdueDays: s.overdueDays,
    reminderTemplate: s.reminderTemplate,
    upiId: s.upiId ?? null,
    demoData: s.demoData,
  };
}

export async function updateSettings(
  patch: Partial<Pick<Settings, "shopName" | "overdueDays" | "reminderTemplate" | "upiId" | "demoData">>
): Promise<SettingsPublic> {
  if (patch.upiId !== undefined) {
    patch.upiId = patch.upiId === null || patch.upiId.trim() === "" ? null : patch.upiId.trim();
  }
  await getSettings();
  const updated = await db.settings.update({ where: { id: "singleton" }, data: patch });
  await db.auditEvent.create({
    data: {
      action: "settings_update",
      entity: "settings",
      entityId: "singleton",
      data: JSON.stringify(patch),
    },
  });
  return publicSettings(updated);
}

/* ---------------- serializers ---------------- */

export function publicTxn(t: Transaction): TxnPublic {
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

export function publicCustomer(c: Customer): CustomerPublic {
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

function publicReminder(r: Reminder): ReminderPublic {
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

export function daysSince(date: Date | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

/* ---------------- WhatsApp ---------------- */

export async function whatsappLink(
  name: string,
  balancePaise: number,
  phone: string | null | undefined,
  days: number
): Promise<{ url: string; message: string; upiLink: string | null }> {
  const settings = await getSettings();
  const parts = [
    renderTemplate(settings.reminderTemplate, {
      name,
      amount: (balancePaise / 100).toFixed(2),
      shop: settings.shopName,
      days,
    }),
    ...reminderExtras(settings, name, balancePaise),
  ];
  const message = parts.join("\n");
  const encoded = encodeURIComponent(message);
  const digits = normalizePhone(phone);
  const url = digits
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  const upiLink =
    settings.upiId && isValidUpiId(settings.upiId)
      ? upiCollectLink(settings.upiId, settings.shopName, balancePaise, `Udhaar ${name}`)
      : null;
  return { url, message, upiLink };
}

/* ---------------- ledger core ---------------- */

export interface AddTxnInput {
  customer: string;
  amountPaise: number;
  txnType: TxnType;
  rawText: string;
  note?: string | null;
  phone?: string | null;
  /** skip the duplicate warning (explicit user confirmation) */
  force?: boolean;
  isReversal?: boolean;
  reversedById?: string | null;
}

export async function addTransaction(
  input: AddTxnInput
): Promise<{
  transaction: TxnPublic;
  customer: CustomerPublic;
  duplicate?: TxnPublic;
  /** set when a UDHAAR pushed the balance past the customer's credit cap */
  overLimit?: { creditLimitPaise: number; balanceAfterPaise: number };
}> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  const key = nameKey(input.customer);
  if (!key) throw new Error("Customer name is required.");
  const phone = normalizePhone(input.phone);
  if (input.phone && !phone) {
    throw new Error("Phone must be a 10-digit Indian mobile number (with optional +91).");
  }

  const existing = await db.customer.findUnique({ where: { nameKey: key } });

  // Archived customers are out of active business — the shopkeeper must
  // explicitly unarchive them (one tap in the Customers tab) before new
  // entries land, otherwise money could hide inside an archived khata.
  if (existing?.archived) {
    throw new Error(
      `${existing.name} is archived. Unarchive them from the Customers tab before adding entries.`
    );
  }

  if (!input.force && !input.isReversal) {
    const dupe = await db.transaction.findFirst({
      where: {
        nameKey: key,
        txnType: input.txnType,
        amountPaise: input.amountPaise,
        reversed: false,
        isReversal: false,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (dupe) {
      return {
        transaction: publicTxn(dupe),
        customer: existing ? publicCustomer(existing) : publicTxnAsCustomer(dupe),
        duplicate: publicTxn(dupe),
      };
    }
  }

  const now = new Date();
  const delta = input.txnType === "UDHAAR" ? input.amountPaise : -input.amountPaise;
  const oldBalance = existing?.balancePaise ?? 0;
  const newBalance = oldBalance + delta;

  let firstDueAt = existing?.firstDueAt ?? null;
  if (newBalance > 0 && (!firstDueAt || oldBalance <= 0)) firstDueAt = now;
  if (newBalance <= 0) firstDueAt = null;

  const displayName = existing?.name ?? input.customer.trim();
  const savedPhone = phone ?? existing?.phone ?? null;

  // Credit-limit advisory: fires when a udhaar pushes the balance past the
  // customer's optional cap. The entry is still saved — the shopkeeper makes
  // the final call, the app just makes sure the limit is visible.
  const overLimit =
    input.txnType === "UDHAAR" &&
    existing?.creditLimitPaise != null &&
    newBalance > existing.creditLimitPaise
      ? { creditLimitPaise: existing.creditLimitPaise, balanceAfterPaise: newBalance }
      : undefined;

  const txn = await db.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { nameKey: key },
      create: {
        nameKey: key,
        name: displayName,
        balancePaise: newBalance,
        phone: savedPhone,
        firstDueAt,
        lastTxnAt: now,
      },
      update: {
        name: displayName,
        balancePaise: newBalance,
        phone: savedPhone,
        firstDueAt,
        lastTxnAt: now,
      },
    });
    const created = await tx.transaction.create({
      data: {
        nameKey: key,
        name: displayName,
        amountPaise: input.amountPaise,
        txnType: input.txnType,
        rawText: input.rawText,
        note: input.note ?? null,
        isReversal: input.isReversal ?? false,
        reversedById: input.reversedById ?? null,
        createdAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        action: "transaction_create",
        entity: "transaction",
        entityId: created.id,
        data: JSON.stringify({
          customer: displayName,
          txnType: input.txnType,
          amountPaise: input.amountPaise,
          forced: input.force ?? false,
          isReversal: input.isReversal ?? false,
        }),
      },
    });
    return created;
  });

  const cust = (await db.customer.findUnique({ where: { nameKey: key } }))!;
  return {
    transaction: publicTxn(txn),
    customer: publicCustomer(cust),
    ...(overLimit ? { overLimit } : {}),
  };
}

function publicTxnAsCustomer(t: Transaction): CustomerPublic {
  return {
    name: t.name,
    nameKey: t.nameKey,
    balance: 0,
    balancePaise: 0,
    phone: null,
    notes: null,
    creditLimitPaise: null,
    creditLimit: null,
    archived: false,
    firstDueAt: null,
    lastTxnAt: t.createdAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Reverse a ledger line by creating an offsetting entry. The original is
 * flagged (never deleted or mutated in place) so the audit history survives.
 * Reversal lines are excluded from report totals — no money actually moved.
 */
export async function reverseTransaction(id: string) {
  const result = await db.$transaction(async (tx) => {
    const orig = await tx.transaction.findUnique({ where: { id } });
    if (!orig) throw new Error("Transaction not found.");
    if (orig.reversed) throw new Error("This transaction has already been reversed.");
    if (orig.isReversal) {
      throw new Error("A reversal entry cannot be reversed. Reverse the original transaction instead.");
    }
    const customer = await tx.customer.findUnique({ where: { nameKey: orig.nameKey } });
    if (!customer) throw new Error("Customer record missing for this transaction.");

    const now = new Date();
    const flip: TxnType = orig.txnType === "UDHAAR" ? "PAYMENT" : "UDHAAR";
    const delta = flip === "UDHAAR" ? orig.amountPaise : -orig.amountPaise;
    const newBalance = customer.balancePaise + delta;

    let firstDueAt = customer.firstDueAt;
    if (newBalance > 0 && (!firstDueAt || customer.balancePaise <= 0)) firstDueAt = now;
    if (newBalance <= 0) firstDueAt = null;

    const reversal = await tx.transaction.create({
      data: {
        nameKey: orig.nameKey,
        name: orig.name,
        amountPaise: orig.amountPaise,
        txnType: flip,
        rawText: `Reversal of: ${orig.rawText}`,
        note: `Reversal of transaction ${orig.id}`,
        isReversal: true,
        reversedById: orig.id,
        createdAt: now,
      },
    });
    await tx.transaction.update({
      where: { id: orig.id },
      data: { reversed: true, reversedById: reversal.id },
    });
    const updated = await tx.customer.update({
      where: { nameKey: orig.nameKey },
      data: { balancePaise: newBalance, firstDueAt, lastTxnAt: now },
    });
    await tx.auditEvent.create({
      data: {
        action: "transaction_reverse",
        entity: "transaction",
        entityId: orig.id,
        data: JSON.stringify({
          reversalId: reversal.id,
          customer: orig.name,
          amountPaise: orig.amountPaise,
          originalType: orig.txnType,
        }),
      },
    });
    return { reversal, customer: updated };
  });
  return {
    transaction: publicTxn(result.reversal),
    customer: publicCustomer(result.customer),
  };
}

/* ---------------- customers ---------------- */

export async function listCustomers(
  q?: string,
  onlyArchived = false
): Promise<CustomerPublic[]> {
  const rows = await db.customer.findMany({
    where: {
      archived: onlyArchived,
      ...(q ? { name: { contains: q } } : {}),
    },
  });
  return rows
    .map(publicCustomer)
    .sort((a, b) => b.balancePaise - a.balancePaise || a.name.localeCompare(b.name));
}

export async function getCustomerWithTxns(name: string) {
  const key = nameKey(name);
  const customer = await db.customer.findUnique({ where: { nameKey: key } });
  if (!customer) return null;
  const txns = await db.transaction.findMany({
    where: { nameKey: key },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { customer: publicCustomer(customer), transactions: txns.map(publicTxn) };
}

export async function updateCustomer(
  name: string,
  patch: {
    phone?: string | null;
    notes?: string | null;
    creditLimitRupees?: number | null;
    archived?: boolean;
  }
): Promise<CustomerPublic | null> {
  const key = nameKey(name);
  const existing = await db.customer.findUnique({ where: { nameKey: key } });
  if (!existing) return null;

  const data: {
    phone?: string | null;
    notes?: string | null;
    creditLimitPaise?: number | null;
    archived?: boolean;
  } = {};
  if (patch.phone !== undefined) {
    if (patch.phone === null || patch.phone === "") {
      data.phone = null;
    } else {
      const p = normalizePhone(patch.phone);
      if (!p) throw new Error("Phone must be a 10-digit Indian mobile number (with optional +91).");
      data.phone = p;
    }
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes === null ? null : patch.notes.trim();
    data.notes = notes === "" ? null : notes;
  }
  if (patch.creditLimitRupees !== undefined) {
    if (patch.creditLimitRupees === null) {
      data.creditLimitPaise = null;
    } else if (
      !Number.isFinite(patch.creditLimitRupees) ||
      patch.creditLimitRupees < 0 ||
      patch.creditLimitRupees > RUPEE_MAX
    ) {
      throw new Error(`Credit limit must be between 0 and ${RUPEE_MAX}.`);
    } else {
      data.creditLimitPaise = Math.round(patch.creditLimitRupees * 100);
    }
  }
  if (patch.archived !== undefined) {
    // Archiving hides a customer from the active lists; only allowed when the
    // khata is settled so outstanding money can never be archived away.
    if (patch.archived && existing.balancePaise > 0) {
      throw new Error("Only customers with a settled (zero) balance can be archived.");
    }
    data.archived = patch.archived;
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.customer.update({ where: { nameKey: key }, data });
    await tx.auditEvent.create({
      data: {
        action: "update_customer",
        entity: "customer",
        entityId: key,
        data: JSON.stringify({
          phoneChanged: patch.phone !== undefined,
          notesChanged: patch.notes !== undefined,
          creditLimitChanged: patch.creditLimitRupees !== undefined,
          archivedChanged: patch.archived !== undefined,
        }),
      },
    });
    return row;
  });
  return publicCustomer(updated);
}

/* ---------------- reminders ---------------- */

export async function listReminders(limit = 50): Promise<ReminderPublic[]> {
  const rows = await db.reminder.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(publicReminder);
}

/* ---------------- audit trail ---------------- */

/**
 * Read-only view of the append-only audit trail. Every financially
 * significant action (entry created, entry reversed, customer updated,
 * settings changed, demo reset) is recorded here — surfaced in Settings.
 */
export async function listAuditEvents(limit = 50): Promise<AuditPublic[]> {
  const events = await db.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return events.map((e) => ({
    id: e.id,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    data: e.data,
    createdAt: e.createdAt.toISOString(),
  }));
}

/**
 * Reminder run (the daily-job equivalent): find customers whose dues are
 * older than `overdueDays` (default from Settings) and write reminder records
 * with ready WhatsApp links.
 */
export async function writeReminders(overdueDays?: number): Promise<ReminderPublic[]> {
  const settings = await getSettings();
  const days = Math.max(0, Math.floor(overdueDays ?? settings.overdueDays));
  const rid = Math.random().toString(36).slice(2, 12);
  const written: ReminderPublic[] = [];

  for (const c of await db.customer.findMany()) {
    if (c.archived) continue; // archived customers are out of active collection
    if (c.balancePaise <= 0) continue;
    const dueFrom = c.firstDueAt ?? c.lastTxnAt;
    const age = daysSince(dueFrom);
    if (age < days) continue;

    const { url, message } = await whatsappLink(c.name, c.balancePaise, c.phone, age);
    // (whatsappLink also embeds amount-in-words + UPI link extras in the message)
    const row = await db.reminder.create({
      data: {
        nameKey: c.nameKey,
        name: c.name,
        balancePaise: c.balancePaise,
        daysOverdue: age,
        phone: c.phone,
        whatsappUrl: url,
        message,
        runId: rid,
      },
    });
    written.push(publicReminder(row));
  }
  return written;
}

/** Build (and record) a reminder for one customer right now. */
export async function customerReminder(name: string): Promise<ReminderPublic | null> {
  const key = nameKey(name);
  const c = await db.customer.findUnique({ where: { nameKey: key } });
  if (!c) return null;
  if (c.balancePaise <= 0) throw new Error(`${c.name} has no outstanding balance.`);
  const age = daysSince(c.firstDueAt ?? c.lastTxnAt);
  const { url, message } = await whatsappLink(c.name, c.balancePaise, c.phone, age);
  const row = await db.reminder.create({
    data: {
      nameKey: c.nameKey,
      name: c.name,
      balancePaise: c.balancePaise,
      daysOverdue: age,
      phone: c.phone,
      whatsappUrl: url,
      message,
      runId: "single",
    },
  });
  return publicReminder(row);
}

/**
 * WhatsApp-ready STATEMENT for one customer: their last ledger lines (real
 * data only), the outstanding balance and the shop name. Unlike a reminder,
 * a statement works for settled customers too — useful as a receipt.
 */
export async function customerStatement(
  name: string
): Promise<{
  whatsappUrl: string;
  message: string;
  upiLink: string | null;
  customer: CustomerPublic;
  lines: number;
} | null> {
  const key = nameKey(name);
  const c = await db.customer.findUnique({ where: { nameKey: key } });
  if (!c) return null;

  const txns = await db.transaction.findMany({
    where: { nameKey: key, reversed: false, isReversal: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const settings = await getSettings();

  const lines = txns.map((t) => {
    const sign = t.txnType === "UDHAAR" ? "+" : "−";
    return `${istTimestamp(t.createdAt)}  ${sign}₹${(t.amountPaise / 100).toFixed(2)} — ${t.rawText}`;
  });

  const balanceLine =
    c.balancePaise > 0
      ? `Udhaar pending: ₹${(c.balancePaise / 100).toFixed(2)}`
      : `Khata settled: ₹${(c.balancePaise / 100).toFixed(2)}`;

  // For due balances reminderExtras already provides the amount-in-words line
  // (plus the UPI pay link when configured) — no separate words line here, or
  // the statement would repeat itself. Settled receipts don't need words for ₹0.
  const tail: string[] = [balanceLine];
  if (c.balancePaise > 0) {
    tail.push(...reminderExtras(settings, c.name, c.balancePaise));
    tail.push("Kripya jald payment kar dein. Dhanyavaad!");
  } else {
    tail.push("Payment ke liye dhanyavaad!");
  }

  const message = [
    `*${settings.shopName}* — khata statement`,
    `Customer: ${c.name}`,
    "",
    ...(lines.length > 0 ? lines : ["(no entries yet)"]),
    "",
    ...tail,
  ].join("\n");

  const encoded = encodeURIComponent(message);
  const digits = normalizePhone(c.phone);
  const whatsappUrl = digits
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  const upiLink =
    c.balancePaise > 0 && settings.upiId && isValidUpiId(settings.upiId)
      ? upiCollectLink(settings.upiId, settings.shopName, c.balancePaise, `Udhaar ${c.name}`)
      : null;

  return { whatsappUrl, message, upiLink, customer: publicCustomer(c), lines: lines.length };
}

/* ---------------- reports ---------------- */

export type ReportRange = "today" | "7d" | "30d" | "all" | "custom";

/**
 * Reports computed from actual stored transactions.
 *
 * Counting rules (documented, deterministic, no double-counting):
 * - Lines with `reversed=true` are voided → excluded from totals.
 * - Lines with `isReversal=true` are corrections, not real money movement →
 *   excluded from totals (but visible in recent activity).
 * - Current outstanding comes from Customer.balancePaise (source of truth).
 * - Day boundaries are in IST (Asia/Kolkata).
 */
export async function getReports(
  range: ReportRange,
  fromStr?: string,
  toStr?: string
) {
  const now = new Date();
  let fromD: Date;
  let toD = now;
  let label: string;

  switch (range) {
    case "today":
      fromD = istDayStart(now);
      label = "Today";
      break;
    case "7d":
      fromD = istDayStart(new Date(now.getTime() - 6 * 86_400_000));
      label = "Last 7 days";
      break;
    case "30d":
      fromD = istDayStart(new Date(now.getTime() - 29 * 86_400_000));
      label = "Last 30 days";
      break;
    case "custom": {
      if (!fromStr || Number.isNaN(new Date(fromStr).getTime())) {
        throw new Error("A valid 'from' date is required for a custom range.");
      }
      fromD = new Date(fromStr);
      if (toStr && !Number.isNaN(new Date(toStr).getTime())) toD = new Date(toStr);
      label = "Custom range";
      break;
    }
    case "all":
    default:
      fromD = new Date(0);
      label = "All time";
      break;
  }

  const txns = await db.transaction.findMany({
    where: { createdAt: { gte: fromD, lte: toD } },
    orderBy: { createdAt: "desc" },
  });
  const countable = txns.filter((t) => !t.reversed && !t.isReversal);

  let creditPaise = 0;
  let paymentsPaise = 0;
  const seriesMap = new Map<string, { credit: number; payments: number }>();
  for (const t of countable) {
    const key = istDayKey(t.createdAt);
    const bucket = seriesMap.get(key) ?? { credit: 0, payments: 0 };
    if (t.txnType === "UDHAAR") {
      creditPaise += t.amountPaise;
      bucket.credit += t.amountPaise;
    } else {
      paymentsPaise += t.amountPaise;
      bucket.payments += t.amountPaise;
    }
    seriesMap.set(key, bucket);
  }

  // Fill day buckets for short ranges so charts show continuous days.
  const series: { date: string; credit: number; payments: number }[] = [];
  const fillFrom = new Date(Math.max(fromD.getTime(), now.getTime() - 30 * 86_400_000));
  if (range !== "all") {
    for (let d = istDayStart(fillFrom); d.getTime() <= toD.getTime(); d = new Date(d.getTime() + 86_400_000)) {
      const key = istDayKey(d);
      const b = seriesMap.get(key) ?? { credit: 0, payments: 0 };
      series.push({ date: key, credit: b.credit / 100, payments: b.payments / 100 });
    }
  } else {
    for (const key of [...seriesMap.keys()].sort()) {
      const b = seriesMap.get(key)!;
      series.push({ date: key, credit: b.credit / 100, payments: b.payments / 100 });
    }
  }

  const customers = await db.customer.findMany();
  const active = customers.filter((c) => !c.archived);
  const customerOutstanding = active
    .filter((c) => c.balancePaise > 0)
    .map((c) => ({
      name: c.name,
      phone: c.phone,
      balance: c.balancePaise / 100,
      balancePaise: c.balancePaise,
      creditLimitPaise: c.creditLimitPaise,
      daysDue: daysSince(c.firstDueAt ?? c.lastTxnAt),
      notes: c.notes,
    }))
    .sort((a, b) => b.balancePaise - a.balancePaise);

  return {
    range: { from: fromD.toISOString(), to: toD.toISOString(), label },
    totals: {
      credit: creditPaise / 100,
      payments: paymentsPaise / 100,
      net: (creditPaise - paymentsPaise) / 100,
      creditPaise,
      paymentsPaise,
      count: countable.length,
    },
    series,
    customerOutstanding,
    recent: txns.slice(0, 10).map(publicTxn),
    meta: {
      customers: active.length,
      withDues: active.filter((c) => c.balancePaise > 0).length,
      settled: active.filter((c) => c.balancePaise <= 0).length,
    },
  };
}

/* ---------------- exports & backup ---------------- */

function csvEscape(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportTransactionsCsv(): Promise<string> {
  const txns = await db.transaction.findMany({ orderBy: { createdAt: "asc" }, take: 5000 });
  const lines = ["Date (IST),Customer,Type,Amount (INR),Entry Text,Note,Status"];
  for (const t of txns) {
    const status = t.reversed ? "REVERSED" : t.isReversal ? "REVERSAL ENTRY" : "OK";
    lines.push(
      [
        istDayKey(t.createdAt).concat(" ", new Date(t.createdAt.getTime() + 5.5 * 3600_000).toISOString().slice(11, 16)),
        t.name,
        t.txnType,
        (t.amountPaise / 100).toFixed(2),
        t.rawText,
        t.note ?? "",
        status,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function exportOutstandingCsv(): Promise<string> {
  const customers = await db.customer.findMany();
  const lines = ["Customer,Phone,Balance (INR),Days Due,Credit Limit (INR),Over Limit,Archived,Notes"];
  for (const c of [...customers].sort((a, b) => b.balancePaise - a.balancePaise)) {
    const overLimit =
      c.creditLimitPaise != null && c.balancePaise > c.creditLimitPaise ? "YES" : "NO";
    lines.push(
      [
        c.name,
        c.phone ?? "",
        (c.balancePaise / 100).toFixed(2),
        c.balancePaise > 0 ? String(daysSince(c.firstDueAt ?? c.lastTxnAt)) : "0",
        c.creditLimitPaise != null ? (c.creditLimitPaise / 100).toFixed(2) : "",
        overLimit,
        c.archived ? "YES" : "NO",
        c.notes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function exportBackupJson() {
  const [settings, customers, transactions, reminders, auditEvents] = await Promise.all([
    getSettings(),
    db.customer.findMany(),
    db.transaction.findMany({ orderBy: { createdAt: "asc" }, take: 5000 }),
    db.reminder.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  return {
    format: "udhaar-khata-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    counts: {
      customers: customers.length,
      transactions: transactions.length,
      reminders: reminders.length,
      auditEvents: auditEvents.length,
    },
    settings: publicSettings(settings),
    customers: customers.map(publicCustomer),
    transactions: transactions.map(publicTxn),
    reminders: reminders.map(publicReminder),
    auditEvents,
  };
}

/* ---------------- restore from backup ---------------- */

interface BackupCustomerInput {
  nameKey: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  creditLimitPaise?: number | null;
  archived?: boolean;
}

interface BackupTxnInput {
  id?: string;
  nameKey: string;
  name: string;
  amountPaise: number;
  txnType: string;
  rawText: string;
  note?: string | null;
  reversed?: boolean;
  isReversal?: boolean;
  createdAt: string;
}

export interface RestoreResult {
  mode: "replace" | "merge";
  importedCustomers: number;
  importedTransactions: number;
  skippedTransactions: number;
  exportedAt: string | null;
}

const MAX_BACKUP_CUSTOMERS = 1000;
const MAX_BACKUP_TRANSACTIONS = 5000;

/**
 * Restore a ledger from a backup produced by exportBackupJson().
 *
 * - "replace": wipe the current ledger (customers/transactions/reminders) and
 *   rebuild it from the backup. Audit history is KEPT and the import itself is
 *   recorded as a new audit event.
 * - "merge": add only what is missing (customers that don't exist yet,
 *   transactions whose id is new). Existing profile edits are never clobbered.
 *
 * Balances are ALWAYS recomputed from the imported ledger lines (never trusted
 * from the file), so the ledger stays internally consistent even if the backup
 * was truncated or hand-edited.
 */
export async function restoreBackup(
  backup: unknown,
  mode: "replace" | "merge"
): Promise<RestoreResult> {
  if (typeof backup !== "object" || backup === null) {
    throw new Error("The backup file does not look like a Udhaar Khata backup.");
  }
  const b = backup as Record<string, unknown>;
  if (b.format !== "udhaar-khata-backup") {
    throw new Error(
      "This file is not a Udhaar Khata backup (missing the format marker). Use the 'Full backup (JSON)' export."
    );
  }
  if (!Array.isArray(b.customers) || !Array.isArray(b.transactions)) {
    throw new Error("The backup is missing its customers or transactions list.");
  }
  if (b.customers.length > MAX_BACKUP_CUSTOMERS) {
    throw new Error(`Too many customers in the backup (max ${MAX_BACKUP_CUSTOMERS}).`);
  }
  if (b.transactions.length > MAX_BACKUP_TRANSACTIONS) {
    throw new Error(`Too many transactions in the backup (max ${MAX_BACKUP_TRANSACTIONS}).`);
  }

  // ---- validate every row before touching the database ----
  const customers: BackupCustomerInput[] = [];
  for (let i = 0; i < b.customers.length; i++) {
    const c = b.customers[i] as Record<string, unknown>;
    const key = typeof c.nameKey === "string" ? c.nameKey.trim().toUpperCase() : "";
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!key || !name) {
      throw new Error(`Customer row ${i + 1} is missing a name.`);
    }
    customers.push({
      nameKey: key,
      name,
      phone: typeof c.phone === "string" ? normalizePhone(c.phone) : null,
      notes: typeof c.notes === "string" ? c.notes : null,
      creditLimitPaise:
        typeof c.creditLimitPaise === "number" &&
        Number.isInteger(c.creditLimitPaise) &&
        c.creditLimitPaise > 0 &&
        c.creditLimitPaise <= RUPEE_MAX * 100
          ? c.creditLimitPaise
          : null,
      archived: c.archived === true,
    });
  }

  const transactions: BackupTxnInput[] = [];
  for (let i = 0; i < b.transactions.length; i++) {
    const t = b.transactions[i] as Record<string, unknown>;
    const key = typeof t.nameKey === "string" ? t.nameKey.trim().toUpperCase() : "";
    const paise = typeof t.amountPaise === "number" ? t.amountPaise : NaN;
    const type = typeof t.txnType === "string" ? t.txnType : "";
    const at = typeof t.createdAt === "string" ? new Date(t.createdAt) : null;
    if (!key) throw new Error(`Transaction row ${i + 1} is missing the customer.`);
    if (!Number.isInteger(paise) || paise <= 0 || paise > RUPEE_MAX * 100) {
      throw new Error(`Transaction row ${i + 1} has an invalid amount.`);
    }
    if (type !== "UDHAAR" && type !== "PAYMENT") {
      throw new Error(`Transaction row ${i + 1} has an unknown entry type.`);
    }
    if (!at || Number.isNaN(at.getTime())) {
      throw new Error(`Transaction row ${i + 1} has an invalid date.`);
    }
    transactions.push({
      id: typeof t.id === "string" && t.id ? t.id : undefined,
      nameKey: key,
      name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : key,
      amountPaise: paise,
      txnType: type,
      rawText:
        typeof t.rawText === "string" && t.rawText.trim()
          ? t.rawText
          : "Restored from backup",
      note: typeof t.note === "string" ? t.note : null,
      reversed: t.reversed === true,
      isReversal: t.isReversal === true,
      createdAt: at.toISOString(),
    });
  }

  // Customer stubs for transactions whose customer row is missing from the
  // backup (keeps referential integrity without dropping ledger lines).
  const known = new Set(customers.map((c) => c.nameKey));
  for (const t of transactions) {
    if (!known.has(t.nameKey)) {
      customers.push({
        nameKey: t.nameKey,
        name: t.name,
        phone: null,
        notes: null,
        creditLimitPaise: null,
        archived: false,
      });
      known.add(t.nameKey);
    }
  }

  const exportedAt = typeof b.exportedAt === "string" ? b.exportedAt : null;

  const result = await db.$transaction(
    async (tx) => {
      let skipped = 0;

      if (mode === "replace") {
        await tx.reminder.deleteMany();
        await tx.transaction.deleteMany();
        await tx.customer.deleteMany();
      }

      // ---- customers ----
      if (mode === "merge") {
        // Merge never overwrites an existing customer's profile edits.
        const existing = new Set(
          (
            await tx.customer.findMany({
              where: { nameKey: { in: customers.map((c) => c.nameKey) } },
              select: { nameKey: true },
            })
          ).map((r) => r.nameKey)
        );
        const fresh = customers.filter((c) => !existing.has(c.nameKey));
        if (fresh.length > 0) {
          await tx.customer.createMany({
            data: fresh.map((c) => ({
              nameKey: c.nameKey,
              name: c.name,
              phone: c.phone,
              notes: c.notes,
              creditLimitPaise: c.creditLimitPaise ?? null,
              archived: c.archived ?? false,
            })),
          });
        }
      } else {
        await tx.customer.createMany({
          data: customers.map((c) => ({
            nameKey: c.nameKey,
            name: c.name,
            phone: c.phone,
            notes: c.notes,
            creditLimitPaise: c.creditLimitPaise ?? null,
            archived: c.archived ?? false,
          })),
        });
      }

      // ---- transactions (dedupe by id in merge mode) ----
      let rows = transactions;
      if (mode === "merge" && transactions.some((t) => t.id)) {
        const ids = transactions
          .map((t) => t.id)
          .filter((x): x is string => Boolean(x));
        const existing = new Set(
          (
            await tx.transaction.findMany({
              where: { id: { in: ids } },
              select: { id: true },
            })
          ).map((r) => r.id)
        );
        rows = transactions.filter((t) => !t.id || !existing.has(t.id));
        skipped = transactions.length - rows.length;
      }
      if (rows.length > 0) {
        await tx.transaction.createMany({
          data: rows.map((t) => ({
            ...(t.id ? { id: t.id } : {}),
            nameKey: t.nameKey,
            name: t.name,
            amountPaise: t.amountPaise,
            txnType: t.txnType,
            rawText: t.rawText,
            note: t.note,
            reversed: t.reversed,
            isReversal: t.isReversal,
            createdAt: new Date(t.createdAt),
          })),
        });
      }

      // ---- recompute every imported customer's balance FROM the ledger ----
      // (single aggregation pass — numbers in the backup are never trusted)
      const keys = [...new Set(mode === "replace" ? customers.map((c) => c.nameKey) : [...known])];
      const sums = await tx.transaction.groupBy({
        by: ["nameKey", "txnType"],
        where: { nameKey: { in: keys }, reversed: false, isReversal: false },
        _sum: { amountPaise: true },
      });
      const ranges = await tx.transaction.groupBy({
        by: ["nameKey"],
        where: { nameKey: { in: keys }, reversed: false, isReversal: false },
        _min: { createdAt: true },
        _max: { createdAt: true },
      });
      const firstDues = await tx.transaction.groupBy({
        by: ["nameKey"],
        where: { nameKey: { in: keys }, txnType: "UDHAAR", reversed: false, isReversal: false },
        _min: { createdAt: true },
      });

      const balanceOf = new Map<string, number>();
      for (const s of sums) {
        const delta = s.txnType === "UDHAAR" ? s._sum.amountPaise : -s._sum.amountPaise;
        balanceOf.set(s.nameKey, (balanceOf.get(s.nameKey) ?? 0) + delta);
      }
      const lastOf = new Map(ranges.map((r) => [r.nameKey, r._max.createdAt]));
      const dueOf = new Map(firstDues.map((r) => [r.nameKey, r._min.createdAt]));

      for (const key of keys) {
        const balance = balanceOf.get(key) ?? 0;
        await tx.customer.update({
          where: { nameKey: key },
          data: {
            balancePaise: balance,
            lastTxnAt: lastOf.get(key) ?? null,
            firstDueAt: balance > 0 ? (dueOf.get(key) ?? null) : null,
          },
        });
      }

      // A restore of real data means the ledger is no longer "demo".
      // (tx-scoped — the global db client must not be touched while the
      // SQLite transaction is open, it deadlocks the database file.)
      await tx.settings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton" },
        update: {},
      });
      if (mode === "replace") {
        await tx.settings.update({
          where: { id: "singleton" },
          data: { demoData: false },
        });
      }

      await tx.auditEvent.create({
        data: {
          action: "import_backup",
          entity: "settings",
          entityId: "singleton",
          data: JSON.stringify({
            mode,
            importedCustomers: customers.length,
            importedTransactions: transactions.length - skipped,
            skippedTransactions: skipped,
            exportedAt,
          }),
        },
      });

      return { skipped };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  return {
    mode,
    importedCustomers: customers.length,
    importedTransactions: transactions.length - result.skipped,
    skippedTransactions: result.skipped,
    exportedAt,
  };
}

/* ---------------- demo data ---------------- */

/**
 * Reset the ledger to a clearly-labeled demonstration dataset with realistic
 * history spread over the last few days (so reports have real trends to show).
 * Never use on a production ledger with real business data.
 */
export async function resetDemoData() {
  await db.$transaction(async (tx) => {
    await tx.reminder.deleteMany();
    await tx.transaction.deleteMany();
    await tx.customer.deleteMany();
    await tx.auditEvent.deleteMany();
  });

  const now = Date.now();
  const daysAgo = (n: number, h = 10) => {
    const d = new Date(now - n * 86_400_000);
    d.setUTCHours(h, 0, 0, 0); // staggered hours so IST day-grouping looks natural
    return d;
  };

  const seeds: {
    key: string;
    name: string;
    balancePaise: number;
    phone: string | null;
    notes: string | null;
    firstDueAt: Date | null;
    lastTxnAt: Date;
  }[] = [
    { key: "AMIT", name: "Amit", balancePaise: 20000, phone: null, notes: "Buys groceries on credit every week.", firstDueAt: daysAgo(3), lastTxnAt: new Date(now) },
    { key: "RAMESH", name: "Ramesh", balancePaise: 7000, phone: null, notes: "Regular customer, pays partially.", firstDueAt: daysAgo(2), lastTxnAt: daysAgo(1) },
    { key: "SITA", name: "Sita", balancePaise: 0, phone: "9876543210", notes: "Prefers UPI payments.", firstDueAt: null, lastTxnAt: daysAgo(1) },
  ];
  for (const s of seeds) {
    await db.customer.create({
      data: {
        nameKey: s.key,
        name: s.name,
        balancePaise: s.balancePaise,
        phone: s.phone,
        notes: s.notes,
        firstDueAt: s.firstDueAt,
        lastTxnAt: s.lastTxnAt,
      },
    });
  }

  const txnSeeds: { key: string; name: string; paise: number; type: TxnType; raw: string; at: Date }[] = [
    { key: "AMIT", name: "Amit", paise: 15000, type: "UDHAAR", raw: "Amit ne 150 ka udhaar liya", at: daysAgo(3) },
    { key: "RAMESH", name: "Ramesh", paise: 12000, type: "UDHAAR", raw: "Ramesh took 2 kg rice for 120 rupees", at: daysAgo(2) },
    { key: "SITA", name: "Sita", paise: 30000, type: "UDHAAR", raw: "Sita ji liya 300 ka saman", at: daysAgo(2, 12) },
    { key: "RAMESH", name: "Ramesh", paise: 5000, type: "PAYMENT", raw: "Ramesh paid 50", at: daysAgo(1) },
    { key: "SITA", name: "Sita", paise: 30000, type: "PAYMENT", raw: "Sita paid 300", at: daysAgo(1, 14) },
    { key: "AMIT", name: "Amit", paise: 5000, type: "UDHAAR", raw: "Amit ne 50 ka udhaar liya", at: new Date(now) },
  ];
  for (const t of txnSeeds) {
    await db.transaction.create({
      data: {
        nameKey: t.key,
        name: t.name,
        amountPaise: t.paise,
        txnType: t.type,
        rawText: t.raw,
        createdAt: t.at,
      },
    });
  }

  await getSettings();
  await db.settings.update({ where: { id: "singleton" }, data: { demoData: true } });
  await db.auditEvent.create({
    data: {
      action: "demo_reset",
      entity: "settings",
      entityId: "singleton",
      data: JSON.stringify({ seeded: "demo dataset", customers: seeds.length, transactions: txnSeeds.length }),
    },
  });

  return { customers: seeds.length, transactions: txnSeeds.length };
}

/** Money formatting used by API messages (uses formatINR for determinism). */
export { formatINR };
