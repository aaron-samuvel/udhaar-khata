/**
 * Browser-only ledger for the static GitHub Pages build (NEXT_PUBLIC_STATIC=1).
 *
 * Mirrors every /api/* contract the full-stack server exposes (see
 * src/app/api/**) on top of a localStorage-backed store, so the exact same
 * frontend runs with no server. All money is integer paise; timestamps are
 * ISO strings on disk and Date objects in memory.
 *
 * RECONSTRUCTION NOTE: the original file was lost before it could be
 * committed (it lived only in the working tree). This version was rebuilt
 * 1:1 from the deployed Pages bundle (chunk 10f039a00e1341b7.js) so the
 * storage key ("udhaar-khata-local-v1") and behavior stay identical for
 * existing visitors. One deliberate addition: POST /api/import — the
 * deployed build answered 404 there, so offline restore now works too.
 */

import { parse } from "@/lib/parser";
import {
  istDayKey,
  istDayStart,
  istTimestamp,
  rupeesToPaise,
} from "@/lib/format";
import {
  DEFAULT_REMINDER_TEMPLATE,
  DUPLICATE_WINDOW_MS,
  RUPEE_MAX,
  daysSince,
  isValidUpiId,
  nameKey,
  normalizePhone,
  publicCustomer,
  publicReminder,
  publicSettings,
  publicTxn,
  reminderExtras,
  renderTemplate,
  upiCollectLink,
  type CustomerLike,
  type ReminderLike,
  type SettingsLike,
  type TxnLike,
} from "@/lib/khata-pure";

/* ---------------- shapes ---------------- */

/** Ledger line as stored in memory (Dates restored from ISO strings). */
interface LocalTxn extends TxnLike {
  reversedById: string | null;
}

/** Append-only audit row. */
interface LocalAudit {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  data: string;
  createdAt: Date;
}

interface LocalLedger {
  settings: SettingsLike;
  customers: CustomerLike[];
  transactions: LocalTxn[];
  reminders: ReminderLike[];
  audit: LocalAudit[];
}

/** File-download payload consumed by downloadExport() in api.ts. */
export interface LocalBlob {
  content: string;
  mime: string;
  filename: string;
}

/** Same { ok, status, data } contract as the server responses. */
export interface LocalResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  blob?: LocalBlob;
}

/* ---------------- persistence ---------------- */

const STORAGE_KEY = "udhaar-khata-local-v1";
const AUDIT_MAX = 500;

let cache: LocalLedger | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSettings(): SettingsLike {
  return {
    shopName: "My Shop",
    overdueDays: 7,
    reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
    upiId: null,
    demoData: true,
  };
}

/** Wipe and seed the clearly-labeled demonstration dataset (same seeds as
 * the server's resetDemoData, plus explicit createdAt values). */
function seedDemo(ledger: LocalLedger): void {
  const now = Date.now();
  const daysAgo = (n: number, h = 10) => {
    const d = new Date(now - n * 86_400_000);
    d.setUTCHours(h, 0, 0, 0); // staggered hours so IST day-grouping looks natural
    return d;
  };

  ledger.customers = [
    {
      nameKey: "AMIT",
      name: "Amit",
      balancePaise: 20000,
      phone: null,
      notes: "Buys groceries on credit every week.",
      creditLimitPaise: null,
      archived: false,
      firstDueAt: daysAgo(3),
      lastTxnAt: new Date(now),
      createdAt: daysAgo(3),
    },
    {
      nameKey: "RAMESH",
      name: "Ramesh",
      balancePaise: 7000,
      phone: null,
      notes: "Regular customer, pays partially.",
      creditLimitPaise: null,
      archived: false,
      firstDueAt: daysAgo(2),
      lastTxnAt: daysAgo(1),
      createdAt: daysAgo(2),
    },
    {
      nameKey: "SITA",
      name: "Sita",
      balancePaise: 0,
      phone: "9876543210",
      notes: "Prefers UPI payments.",
      creditLimitPaise: null,
      archived: false,
      firstDueAt: null,
      lastTxnAt: daysAgo(1),
      createdAt: daysAgo(2),
    },
  ];

  ledger.transactions = [
    { id: newId(), nameKey: "AMIT", name: "Amit", amountPaise: 15000, txnType: "UDHAAR", rawText: "Amit ne 150 ka udhaar liya", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: daysAgo(3) },
    { id: newId(), nameKey: "RAMESH", name: "Ramesh", amountPaise: 12000, txnType: "UDHAAR", rawText: "Ramesh took 2 kg rice for 120 rupees", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: daysAgo(2) },
    { id: newId(), nameKey: "SITA", name: "Sita", amountPaise: 30000, txnType: "UDHAAR", rawText: "Sita ji liya 300 ka saman", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: daysAgo(2, 12) },
    { id: newId(), nameKey: "RAMESH", name: "Ramesh", amountPaise: 5000, txnType: "PAYMENT", rawText: "Ramesh paid 50", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: daysAgo(1) },
    { id: newId(), nameKey: "SITA", name: "Sita", amountPaise: 30000, txnType: "PAYMENT", rawText: "Sita paid 300", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: daysAgo(1, 14) },
    { id: newId(), nameKey: "AMIT", name: "Amit", amountPaise: 5000, txnType: "UDHAAR", rawText: "Amit ne 50 ka udhaar liya", note: null, reversed: false, isReversal: false, reversedById: null, createdAt: new Date(now) },
  ];

  ledger.reminders = [];
  ledger.settings = { ...defaultSettings(), demoData: true };
}

function persist(ledger: LocalLedger): void {
  cache = ledger;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: ledger.settings,
        customers: ledger.customers,
        transactions: ledger.transactions,
        reminders: ledger.reminders,
        audit: ledger.audit,
      })
    );
  } catch {
    // storage blocked (private mode / quota) — keep the in-memory copy
  }
}

/** ISO strings on disk → Date objects in memory. */
function loadLedger(): LocalLedger {
  if (cache) return cache;
  const ledger: LocalLedger = {
    settings: defaultSettings(),
    customers: [],
    transactions: [],
    reminders: [],
    audit: [],
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<
        Record<keyof LocalLedger, unknown>
      >;
      ledger.settings = { ...defaultSettings(), ...((saved.settings as SettingsLike) ?? {}) };
      ledger.customers = ((saved.customers as CustomerLike[]) ?? []).map((c) => ({
        ...c,
        firstDueAt: c.firstDueAt ? new Date(c.firstDueAt) : null,
        lastTxnAt: c.lastTxnAt ? new Date(c.lastTxnAt) : null,
        createdAt: new Date(c.createdAt),
      }));
      ledger.transactions = ((saved.transactions as LocalTxn[]) ?? []).map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt),
      }));
      ledger.reminders = ((saved.reminders as ReminderLike[]) ?? []).map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
      }));
      ledger.audit = ((saved.audit as LocalAudit[]) ?? []).map((a) => ({
        ...a,
        createdAt: new Date(a.createdAt),
      }));
    } else {
      seedDemo(ledger);
      persist(ledger);
    }
  } catch {
    // corrupted store — fall back to demo data so the app still boots
    if (ledger.customers.length === 0) seedDemo(ledger);
  }
  cache = ledger;
  return ledger;
}

function pushAudit(
  ledger: LocalLedger,
  action: string,
  entity: string,
  entityId: string | null,
  data: Record<string, unknown>
): void {
  ledger.audit.unshift({
    id: newId(),
    action,
    entity,
    entityId,
    data: JSON.stringify(data),
    createdAt: new Date(),
  });
  if (ledger.audit.length > AUDIT_MAX) ledger.audit.length = AUDIT_MAX;
}

/* ---------------- domain helpers (mirror src/lib/khata.ts) ---------------- */

function findCustomer(ledger: LocalLedger, key: string): CustomerLike | undefined {
  return ledger.customers.find((c) => c.nameKey === key);
}

function whatsappLinkFor(
  ledger: LocalLedger,
  name: string,
  balancePaise: number,
  phone: string | null | undefined,
  days: number
): { url: string; message: string; upiLink: string | null } {
  const s = ledger.settings;
  const parts = [
    renderTemplate(s.reminderTemplate, {
      name,
      amount: (balancePaise / 100).toFixed(2),
      shop: s.shopName,
      days,
    }),
    ...reminderExtras(s, name, balancePaise),
  ];
  const message = parts.join("\n");
  const encoded = encodeURIComponent(message);
  const digits = normalizePhone(phone);
  const url = digits
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  const upiLink =
    s.upiId && isValidUpiId(s.upiId)
      ? upiCollectLink(s.upiId, s.shopName, balancePaise, `Udhaar ${name}`)
      : null;
  return { url, message, upiLink };
}

/** Balance/firstDueAt updates shared by add + reverse (server parity). */
function applyBalance(
  customer: CustomerLike,
  newBalance: number,
  now: Date
): void {
  const wasPositive = customer.balancePaise;
  if (newBalance > 0 && (!customer.firstDueAt || wasPositive <= 0)) {
    customer.firstDueAt = now;
  }
  if (newBalance <= 0) customer.firstDueAt = null;
  customer.balancePaise = newBalance;
  customer.lastTxnAt = now;
}

function addTxnLocal(
  ledger: LocalLedger,
  input: {
    customer: string;
    amountPaise: number;
    txnType: "UDHAAR" | "PAYMENT";
    rawText: string;
    note?: string | null;
    phone?: string | null;
    force?: boolean;
    isReversal?: boolean;
    reversedById?: string | null;
  }
): {
  transaction: ReturnType<typeof publicTxn>;
  customer: ReturnType<typeof publicCustomer>;
  duplicate?: ReturnType<typeof publicTxn>;
  overLimit?: { creditLimitPaise: number; balanceAfterPaise: number };
} {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  const key = nameKey(input.customer);
  if (!key) throw new Error("Customer name is required.");
  const phone = normalizePhone(input.phone);
  if (input.phone && !phone) {
    throw new Error("Phone must be a 10-digit Indian mobile number (with optional +91).");
  }

  const existing = findCustomer(ledger, key);

  // Archived customers must be unarchived first — money can't hide in an
  // archived khata (same rule as the server).
  if (existing?.archived) {
    throw new Error(
      `${existing.name} is archived. Unarchive them from the Customers tab before adding entries.`
    );
  }

  if (!input.force && !input.isReversal) {
    const since = Date.now() - DUPLICATE_WINDOW_MS;
    const dupe = [...ledger.transactions]
      .filter(
        (t) =>
          t.nameKey === key &&
          t.txnType === input.txnType &&
          t.amountPaise === input.amountPaise &&
          !t.reversed &&
          !t.isReversal &&
          t.createdAt.getTime() >= since
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (dupe) {
      return {
        transaction: publicTxn(dupe),
        customer: existing
          ? publicCustomer(existing)
          : {
              name: dupe.name,
              nameKey: dupe.nameKey,
              balance: 0,
              balancePaise: 0,
              phone: null,
              notes: null,
              creditLimitPaise: null,
              creditLimit: null,
              archived: false,
              firstDueAt: null,
              lastTxnAt: dupe.createdAt.toISOString(),
              createdAt: dupe.createdAt.toISOString(),
            },
        duplicate: publicTxn(dupe),
      };
    }
  }

  const now = new Date();
  const delta = input.txnType === "UDHAAR" ? input.amountPaise : -input.amountPaise;
  const newBalance = (existing?.balancePaise ?? 0) + delta;

  const displayName = existing?.name ?? input.customer.trim();
  const savedPhone = phone ?? existing?.phone ?? null;

  const overLimit =
    input.txnType === "UDHAAR" &&
    existing?.creditLimitPaise != null &&
    newBalance > existing.creditLimitPaise
      ? { creditLimitPaise: existing.creditLimitPaise, balanceAfterPaise: newBalance }
      : undefined;

  if (existing) {
    existing.name = displayName;
    existing.phone = savedPhone;
    applyBalance(existing, newBalance, now);
  } else {
    ledger.customers.push({
      nameKey: key,
      name: displayName,
      balancePaise: newBalance,
      phone: savedPhone,
      notes: null,
      creditLimitPaise: null,
      archived: false,
      firstDueAt: newBalance > 0 ? now : null,
      lastTxnAt: now,
      createdAt: now,
    });
  }

  const txn: LocalTxn = {
    id: newId(),
    nameKey: key,
    name: displayName,
    amountPaise: input.amountPaise,
    txnType: input.txnType,
    rawText: input.rawText,
    note: input.note ?? null,
    isReversal: input.isReversal ?? false,
    reversedById: input.reversedById ?? null,
    reversed: false,
    createdAt: now,
  };
  ledger.transactions.unshift(txn);
  pushAudit(ledger, "transaction_create", "transaction", txn.id, {
    customer: displayName,
    txnType: input.txnType,
    amountPaise: input.amountPaise,
    forced: input.force ?? false,
    isReversal: input.isReversal ?? false,
  });

  const customer = findCustomer(ledger, key)!;
  return {
    transaction: publicTxn(txn),
    customer: publicCustomer(customer),
    ...(overLimit ? { overLimit } : {}),
  };
}

function reverseTxnLocal(ledger: LocalLedger, id: string) {
  const orig = ledger.transactions.find((t) => t.id === id);
  if (!orig) throw new Error("Transaction not found.");
  if (orig.reversed) throw new Error("This transaction has already been reversed.");
  if (orig.isReversal) {
    throw new Error("A reversal entry cannot be reversed. Reverse the original transaction instead.");
  }
  const customer = findCustomer(ledger, orig.nameKey);
  if (!customer) throw new Error("Customer record missing for this transaction.");

  const now = new Date();
  const flip: "UDHAAR" | "PAYMENT" = orig.txnType === "UDHAAR" ? "PAYMENT" : "UDHAAR";
  const delta = flip === "UDHAAR" ? orig.amountPaise : -orig.amountPaise;
  const newBalance = customer.balancePaise + delta;

  const reversal: LocalTxn = {
    id: newId(),
    nameKey: orig.nameKey,
    name: orig.name,
    amountPaise: orig.amountPaise,
    txnType: flip,
    rawText: `Reversal of: ${orig.rawText}`,
    note: `Reversal of transaction ${orig.id}`,
    isReversal: true,
    reversedById: orig.id,
    reversed: false,
    createdAt: now,
  };
  ledger.transactions.unshift(reversal);
  orig.reversed = true;
  orig.reversedById = reversal.id;
  applyBalance(customer, newBalance, now);
  pushAudit(ledger, "transaction_reverse", "transaction", orig.id, {
    reversalId: reversal.id,
    customer: orig.name,
    amountPaise: orig.amountPaise,
    originalType: orig.txnType,
  });
  return { transaction: publicTxn(reversal), customer: publicCustomer(customer) };
}

function updateCustomerLocal(
  ledger: LocalLedger,
  name: string,
  patch: {
    phone?: string | null;
    notes?: string | null;
    creditLimitRupees?: number | null;
    archived?: boolean;
  }
): ReturnType<typeof publicCustomer> | null {
  const key = nameKey(name);
  const customer = findCustomer(ledger, key);
  if (!customer) return null;

  if (patch.phone !== undefined) {
    if (patch.phone === null || patch.phone === "") {
      customer.phone = null;
    } else {
      const p = normalizePhone(patch.phone);
      if (!p) throw new Error("Phone must be a 10-digit Indian mobile number (with optional +91).");
      customer.phone = p;
    }
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes === null ? null : patch.notes.trim();
    customer.notes = notes === "" ? null : notes;
  }
  if (patch.creditLimitRupees !== undefined) {
    if (patch.creditLimitRupees === null) {
      customer.creditLimitPaise = null;
    } else if (
      !Number.isFinite(patch.creditLimitRupees) ||
      patch.creditLimitRupees < 0 ||
      patch.creditLimitRupees > RUPEE_MAX
    ) {
      throw new Error(`Credit limit must be between 0 and ${RUPEE_MAX}.`);
    } else {
      customer.creditLimitPaise = Math.round(patch.creditLimitRupees * 100);
    }
  }
  if (patch.archived !== undefined) {
    if (patch.archived && customer.balancePaise > 0) {
      throw new Error("Only customers with a settled (zero) balance can be archived.");
    }
    customer.archived = patch.archived;
  }

  pushAudit(ledger, "update_customer", "customer", key, {
    phoneChanged: patch.phone !== undefined,
    notesChanged: patch.notes !== undefined,
    creditLimitChanged: patch.creditLimitRupees !== undefined,
    archivedChanged: patch.archived !== undefined,
  });
  return publicCustomer(customer);
}

function listCustomersLocal(
  ledger: LocalLedger,
  q?: string,
  onlyArchived = false
): ReturnType<typeof publicCustomer>[] {
  const needle = q?.trim().toLowerCase();
  return ledger.customers
    .filter((c) => c.archived === onlyArchived)
    .filter((c) => !needle || c.name.toLowerCase().includes(needle))
    .map(publicCustomer)
    .sort(
      (a, b) => b.balancePaise - a.balancePaise || a.name.localeCompare(b.name)
    );
}

function customerDetailLocal(ledger: LocalLedger, name: string) {
  const key = nameKey(name);
  const customer = findCustomer(ledger, key);
  if (!customer) return null;
  const transactions = ledger.transactions
    .filter((t) => t.nameKey === key)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200);
  return { customer: publicCustomer(customer), transactions: transactions.map(publicTxn) };
}

function customerStatementLocal(ledger: LocalLedger, name: string) {
  const key = nameKey(name);
  const customer = findCustomer(ledger, key);
  if (!customer) return null;

  const txns = ledger.transactions
    .filter((t) => t.nameKey === key && !t.reversed && !t.isReversal)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);
  const settings = ledger.settings;

  const lines = txns.map((t) => {
    const sign = t.txnType === "UDHAAR" ? "+" : "−";
    return `${istTimestamp(t.createdAt)}  ${sign}₹${(t.amountPaise / 100).toFixed(2)} — ${t.rawText}`;
  });

  const tail: string[] = [
    customer.balancePaise > 0
      ? `Udhaar pending: ₹${(customer.balancePaise / 100).toFixed(2)}`
      : `Khata settled: ₹${(customer.balancePaise / 100).toFixed(2)}`,
  ];
  if (customer.balancePaise > 0) {
    tail.push(...reminderExtras(settings, customer.name, customer.balancePaise));
    tail.push("Kripya jald payment kar dein. Dhanyavaad!");
  } else {
    tail.push("Payment ke liye dhanyavaad!");
  }

  const message = [
    `*${settings.shopName}* — khata statement`,
    `Customer: ${customer.name}`,
    "",
    ...(lines.length > 0 ? lines : ["(no entries yet)"]),
    "",
    ...tail,
  ].join("\n");

  const encoded = encodeURIComponent(message);
  const digits = normalizePhone(customer.phone);
  const whatsappUrl = digits
    ? `https://wa.me/91${digits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  const upiLink =
    customer.balancePaise > 0 &&
    settings.upiId &&
    isValidUpiId(settings.upiId)
      ? upiCollectLink(settings.upiId, settings.shopName, customer.balancePaise, `Udhaar ${customer.name}`)
      : null;

  return {
    whatsappUrl,
    message,
    upiLink,
    customer: publicCustomer(customer),
    lines: lines.length,
  };
}

function writeRemindersLocal(
  ledger: LocalLedger,
  overdueDays?: number
): ReturnType<typeof publicReminder>[] {
  const settings = ledger.settings;
  const days = Math.max(0, Math.floor(overdueDays ?? settings.overdueDays));
  const runId = Math.random().toString(36).slice(2, 12);
  const written: ReturnType<typeof publicReminder>[] = [];

  for (const c of ledger.customers) {
    if (c.archived) continue;
    if (c.balancePaise <= 0) continue;
    const age = daysSince(c.firstDueAt ?? c.lastTxnAt);
    if (age < days) continue;

    const { url, message } = whatsappLinkFor(ledger, c.name, c.balancePaise, c.phone, age);
    const row: ReminderLike = {
      id: newId(),
      nameKey: c.nameKey,
      name: c.name,
      balancePaise: c.balancePaise,
      daysOverdue: age,
      phone: c.phone,
      whatsappUrl: url,
      message,
      runId,
      createdAt: new Date(),
    };
    ledger.reminders.unshift(row);
    written.push(publicReminder(row));
  }
  return written;
}

function customerReminderLocal(ledger: LocalLedger, name: string) {
  const customer = findCustomer(ledger, nameKey(name));
  if (!customer) return null;
  if (customer.balancePaise <= 0) {
    throw new Error(`${customer.name} has no outstanding balance.`);
  }
  const age = daysSince(customer.firstDueAt ?? customer.lastTxnAt);
  const { url, message } = whatsappLinkFor(
    ledger,
    customer.name,
    customer.balancePaise,
    customer.phone,
    age
  );
  const row: ReminderLike = {
    id: newId(),
    nameKey: customer.nameKey,
    name: customer.name,
    balancePaise: customer.balancePaise,
    daysOverdue: age,
    phone: customer.phone,
    whatsappUrl: url,
    message,
    runId: "single",
    createdAt: new Date(),
  };
  ledger.reminders.unshift(row);
  return publicReminder(row);
}

function reportsLocal(
  ledger: LocalLedger,
  range: "today" | "7d" | "30d" | "all" | "custom",
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

  const txns = ledger.transactions
    .filter((t) => t.createdAt >= fromD && t.createdAt <= toD)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  const series: { date: string; credit: number; payments: number }[] = [];
  const fillFrom = new Date(Math.max(fromD.getTime(), now.getTime() - 30 * 86_400_000));
  if (range !== "all") {
    for (
      let d = istDayStart(fillFrom);
      d.getTime() <= toD.getTime();
      d = new Date(d.getTime() + 86_400_000)
    ) {
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

  const active = ledger.customers.filter((c) => !c.archived);
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

/* ---------------- exports & backup (server parity) ---------------- */

function csvEscape(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const todayStamp = () => new Date().toISOString().slice(0, 10);

function transactionsCsvLocal(ledger: LocalLedger): string {
  const txns = [...ledger.transactions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const lines = ["Date (IST),Customer,Type,Amount (INR),Entry Text,Note,Status"];
  for (const t of txns) {
    const status = t.reversed ? "REVERSED" : t.isReversal ? "REVERSAL ENTRY" : "OK";
    lines.push(
      [
        istDayKey(t.createdAt).concat(
          " ",
          new Date(t.createdAt.getTime() + 5.5 * 3600_000).toISOString().slice(11, 16)
        ),
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

function outstandingCsvLocal(ledger: LocalLedger): string {
  const lines = ["Customer,Phone,Balance (INR),Days Due,Credit Limit (INR),Over Limit,Archived,Notes"];
  for (const c of [...ledger.customers].sort((a, b) => b.balancePaise - a.balancePaise)) {
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

function backupJsonLocal(ledger: LocalLedger) {
  return {
    format: "udhaar-khata-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    counts: {
      customers: ledger.customers.length,
      transactions: ledger.transactions.length,
      reminders: ledger.reminders.length,
      auditEvents: ledger.audit.length,
    },
    settings: publicSettings(ledger.settings),
    customers: ledger.customers.map(publicCustomer),
    transactions: ledger.transactions.map(publicTxn),
    reminders: ledger.reminders.map(publicReminder),
    auditEvents: ledger.audit.map((e) => ({
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      data: e.data,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/**
 * Restore from a backup (POST /api/import) — mirror of the server's
 * restoreBackup(): validate every row, recompute balances from the ledger
 * lines (never trust the numbers in the file), keep audit history, and turn
 * the demo flag off on a full replace.
 *
 * NOTE: not present in the deployed build (it answered 404) — added here so
 * Settings → Restore works offline too.
 */
function restoreBackupLocal(
  ledger: LocalLedger,
  backup: unknown,
  mode: "replace" | "merge"
): {
  mode: "replace" | "merge";
  importedCustomers: number;
  importedTransactions: number;
  skippedTransactions: number;
  exportedAt: string | null;
} {
  const MAX_BACKUP_CUSTOMERS = 1000;
  const MAX_BACKUP_TRANSACTIONS = 5000;

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

  // ---- validate every row before touching the store ----
  const customers: {
    nameKey: string;
    name: string;
    phone: string | null;
    notes: string | null;
    creditLimitPaise: number | null;
    archived: boolean;
  }[] = [];
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

  const transactions: {
    id?: string;
    nameKey: string;
    name: string;
    amountPaise: number;
    txnType: string;
    rawText: string;
    note: string | null;
    reversed: boolean;
    isReversal: boolean;
    createdAt: string;
  }[] = [];
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

  // Customer stubs keep ledger lines whose customer row is missing.
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

  if (mode === "replace") {
    ledger.reminders = [];
    ledger.transactions = [];
    ledger.customers = [];
  }

  // ---- customers (merge never overwrites existing profile edits) ----
  for (const c of customers) {
    const existing = findCustomer(ledger, c.nameKey);
    if (mode === "merge" && existing) continue;
    if (existing) {
      existing.name = c.name;
      existing.phone = c.phone;
      existing.notes = c.notes;
      existing.creditLimitPaise = c.creditLimitPaise;
      existing.archived = c.archived;
    } else {
      ledger.customers.push({
        nameKey: c.nameKey,
        name: c.name,
        balancePaise: 0,
        phone: c.phone,
        notes: c.notes,
        creditLimitPaise: c.creditLimitPaise,
        archived: c.archived,
        firstDueAt: null,
        lastTxnAt: null,
        createdAt: new Date(),
      });
    }
  }

  // ---- transactions (dedupe by id in merge mode) ----
  let rows = transactions;
  let skipped = 0;
  if (mode === "merge" && transactions.some((t) => t.id)) {
    const ids = new Set(
      ledger.transactions.map((t) => t.id)
    );
    rows = transactions.filter((t) => !t.id || !ids.has(t.id));
    skipped = transactions.length - rows.length;
  }
  for (const t of rows) {
    ledger.transactions.push({
      id: t.id ?? newId(),
      nameKey: t.nameKey,
      name: t.name,
      amountPaise: t.amountPaise,
      txnType: t.txnType,
      rawText: t.rawText,
      note: t.note,
      reversed: t.reversed,
      isReversal: t.isReversal,
      reversedById: null,
      createdAt: new Date(t.createdAt),
    });
  }

  // ---- recompute every imported customer's balance FROM the ledger ----
  const keys = [...known];
  for (const key of keys) {
    const own = ledger.transactions.filter(
      (t) => t.nameKey === key && !t.reversed && !t.isReversal
    );
    let balance = 0;
    let last: Date | null = null;
    let firstDue: Date | null = null;
    for (const t of own) {
      balance += t.txnType === "UDHAAR" ? t.amountPaise : -t.amountPaise;
      if (!last || t.createdAt > last) last = t.createdAt;
      if (t.txnType === "UDHAAR" && (!firstDue || t.createdAt < firstDue)) {
        firstDue = t.createdAt;
      }
    }
    const c = findCustomer(ledger, key)!;
    c.balancePaise = balance;
    c.lastTxnAt = last;
    c.firstDueAt = balance > 0 ? firstDue : null;
  }

  // A restore of real data means the ledger is no longer "demo".
  if (mode === "replace") ledger.settings.demoData = false;

  pushAudit(ledger, "import_backup", "settings", "singleton", {
    mode,
    importedCustomers: customers.length,
    importedTransactions: transactions.length - skipped,
    skippedTransactions: skipped,
    exportedAt,
  });

  return {
    mode,
    importedCustomers: customers.length,
    importedTransactions: transactions.length - skipped,
    skippedTransactions: skipped,
    exportedAt,
  };
}

/* ---------------- router ---------------- */

function route(
  ledger: LocalLedger,
  url: string,
  method: string,
  body: Record<string, unknown>,
  pathname: string,
  search: URLSearchParams,
  seg: string[]
): LocalResult {
  /* ---- POST /api/transactions ---- */
  if (seg[0] === "transactions" && seg.length === 1 && method === "POST") {
    let customer: string;
    let amountPaise: number;
    let txnType: "UDHAAR" | "PAYMENT";
    let rawText: string;

    const mode = body.mode === "parse" ? "parse" : "manual";
    if (mode === "parse") {
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) {
        return { ok: false, status: 400, data: { ok: false, error: "Please enter a sentence to parse." } };
      }
      const parsed = parse(text);
      if (!parsed.ok) {
        return { ok: false, status: 400, data: { ok: false, error: parsed.error, parsed } };
      }
      // Preview: parse only, never save — the user must confirm explicitly.
      if (body.preview === true) {
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            preview: {
              customer: parsed.customer,
              amount: parsed.amount,
              txnType: body.txnType ?? parsed.txnType,
              rawText: parsed.rawText,
            },
          },
        };
      }
      customer = parsed.customer!;
      amountPaise = rupeesToPaise(parsed.amount!);
      txnType = (body.txnType as "UDHAAR" | "PAYMENT") ?? parsed.txnType!;
      rawText = parsed.rawText;
    } else {
      const name = typeof body.customer === "string" ? body.customer.trim() : "";
      const rupees = typeof body.amountRupees === "number" ? body.amountRupees : NaN;
      const type = body.txnType as "UDHAAR" | "PAYMENT" | undefined;
      if (!name) {
        return { ok: false, status: 400, data: { ok: false, error: "Customer name is required." } };
      }
      if (!Number.isFinite(rupees) || rupees <= 0 || rupees > RUPEE_MAX) {
        return { ok: false, status: 400, data: { ok: false, error: "Enter a valid amount." } };
      }
      if (type !== "UDHAAR" && type !== "PAYMENT") {
        return { ok: false, status: 400, data: { ok: false, error: "Choose udhaar or payment." } };
      }
      const note = typeof body.note === "string" ? body.note : undefined;
      customer = name;
      amountPaise = rupeesToPaise(rupees);
      txnType = type;
      rawText = note?.trim() || `Manual ${txnType === "UDHAAR" ? "udhaar" : "payment"} entry`;
    }

    if (amountPaise <= 0) {
      return { ok: false, status: 400, data: { ok: false, error: "Amount must be greater than zero." } };
    }

    const result = addTxnLocal(ledger, {
      customer,
      amountPaise,
      txnType,
      rawText,
      note: (body.note as string | null) ?? null,
      phone: (body.phone as string | null) ?? null,
      force: body.force === true,
    });
    persist(ledger);

    if (result.duplicate) {
      const d = result.duplicate;
      return {
        ok: false,
        status: 409,
        data: {
          ok: false,
          error: `Possible duplicate: ${d.txnType === "UDHAAR" ? "udhaar" : "payment"} of ₹${(d.amountPaise / 100).toFixed(2)} for ${d.name} was recorded a moment ago. Save anyway?`,
          duplicate: d,
        },
      };
    }
    return {
      ok: true,
      status: 201,
      data: {
        ok: true,
        transaction: result.transaction,
        customer: result.customer,
        overLimit: result.overLimit ?? null,
      },
    };
  }

  /* ---- POST /api/transactions/[id]/reverse ---- */
  if (seg[0] === "transactions" && seg.length === 3 && seg[2] === "reverse" && method === "POST") {
    const result = reverseTxnLocal(ledger, seg[1]);
    persist(ledger);
    return { ok: true, status: 201, data: { ok: true, transaction: result.transaction, customer: result.customer } };
  }

  /* ---- GET /api/customers ---- */
  if (seg[0] === "customers" && seg.length === 1 && method === "GET") {
    const q = search.get("q") ?? undefined;
    const onlyArchived = search.get("archived") === "1";
    return {
      ok: true,
      status: 200,
      data: { ok: true, customers: listCustomersLocal(ledger, q, onlyArchived) },
    };
  }

  /* ---- GET /api/customers/[name]/transactions ---- */
  if (seg[0] === "customers" && seg.length === 3 && seg[2] === "transactions" && method === "GET") {
    const detail = customerDetailLocal(ledger, seg[1]);
    if (!detail) {
      return { ok: false, status: 404, data: { ok: false, error: `No customer named ${seg[1]}.` } };
    }
    return { ok: true, status: 200, data: { ok: true, ...detail } };
  }

  /* ---- POST /api/customers/[name]/statement ---- */
  if (seg[0] === "customers" && seg.length === 3 && seg[2] === "statement" && method === "POST") {
    const statement = customerStatementLocal(ledger, seg[1]);
    if (!statement) {
      return { ok: false, status: 404, data: { ok: false, error: `No customer named ${seg[1]}.` } };
    }
    persist(ledger);
    return { ok: true, status: 201, data: { ok: true, statement } };
  }

  /* ---- PATCH /api/customers/[name] ---- */
  if (seg[0] === "customers" && seg.length === 2 && method === "PATCH") {
    const patch: {
      phone?: string | null;
      notes?: string | null;
      creditLimitRupees?: number | null;
      archived?: boolean;
    } = {};
    if ("phone" in body) patch.phone = (body.phone as string | null) ?? null;
    if ("notes" in body) patch.notes = (body.notes as string | null) ?? null;
    if ("creditLimitRupees" in body) {
      patch.creditLimitRupees = (body.creditLimitRupees as number | null) ?? null;
    }
    if ("archived" in body) patch.archived = body.archived === true;
    if (Object.keys(patch).length === 0) {
      return { ok: false, status: 400, data: { ok: false, error: "Nothing to update." } };
    }
    const customer = updateCustomerLocal(ledger, seg[1], patch);
    persist(ledger);
    if (!customer) {
      return { ok: false, status: 404, data: { ok: false, error: `No customer named ${seg[1]}.` } };
    }
    return { ok: true, status: 200, data: { ok: true, customer } };
  }

  /* ---- GET/POST /api/reminders ---- */
  if (seg[0] === "reminders" && seg.length === 1 && method === "GET") {
    const reminders = [...ledger.reminders]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50)
      .map(publicReminder);
    return { ok: true, status: 200, data: { ok: true, reminders } };
  }
  if (seg[0] === "reminders" && seg.length === 1 && method === "POST") {
    const raw = body.overdue_days ?? body.overdueDays;
    let overdueDays: number | undefined;
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return { ok: false, status: 400, data: { ok: false, error: "overdue_days must be between 0 and 365." } };
      }
      overdueDays = Math.floor(n);
    }
    const written = writeRemindersLocal(ledger, overdueDays);
    persist(ledger);
    return {
      ok: true,
      status: 200,
      data: { ok: true, reminders_written: written.length, reminders: written, status: "SUCCEEDED" },
    };
  }

  /* ---- POST /api/reminders/customer ---- */
  if (seg[0] === "reminders" && seg.length === 2 && seg[1] === "customer" && method === "POST") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return { ok: false, status: 400, data: { ok: false, error: "Invalid request." } };
    }
    const reminder = customerReminderLocal(ledger, name);
    persist(ledger);
    if (!reminder) {
      return { ok: false, status: 404, data: { ok: false, error: `No customer named ${name}.` } };
    }
    return { ok: true, status: 201, data: { ok: true, reminder } };
  }

  /* ---- GET /api/reports ---- */
  if (seg[0] === "reports" && seg.length === 1 && method === "GET") {
    const range = (search.get("range") ?? "30d") as
      | "today"
      | "7d"
      | "30d"
      | "all"
      | "custom";
    if (!["today", "7d", "30d", "all", "custom"].includes(range)) {
      return {
        ok: false,
        status: 400,
        data: { ok: false, error: "range must be one of: today, 7d, 30d, all, custom." },
      };
    }
    const report = reportsLocal(
      ledger,
      range,
      search.get("from") ?? undefined,
      search.get("to") ?? undefined
    );
    return { ok: true, status: 200, data: { ok: true, ...report } };
  }

  /* ---- GET/PUT /api/settings ---- */
  if (seg[0] === "settings" && seg.length === 1 && method === "GET") {
    return { ok: true, status: 200, data: { ok: true, settings: publicSettings(ledger.settings) } };
  }
  if (seg[0] === "settings" && seg.length === 1 && method === "PUT") {
    const patch = body;
    if (
      patch.upiId !== undefined &&
      patch.upiId !== null &&
      String(patch.upiId).trim() !== "" &&
      !isValidUpiId(String(patch.upiId))
    ) {
      return {
        ok: false,
        status: 400,
        data: { ok: false, error: "UPI ID must look like yourname@bank (e.g. shop@okicici)." },
      };
    }
    const settings = ledger.settings;
    if (patch.shopName !== undefined && String(patch.shopName).trim()) {
      settings.shopName = String(patch.shopName).trim().slice(0, 60);
    }
    if (patch.overdueDays !== undefined) {
      const days = Math.floor(Number(patch.overdueDays));
      if (!Number.isFinite(days) || days < 0 || days > 365) {
        return { ok: false, status: 400, data: { ok: false, error: "Invalid settings." } };
      }
      settings.overdueDays = days;
    }
    if (
      patch.reminderTemplate !== undefined &&
      String(patch.reminderTemplate).length >= 10
    ) {
      settings.reminderTemplate = String(patch.reminderTemplate).slice(0, 500);
    }
    if (patch.upiId !== undefined) {
      settings.upiId =
        patch.upiId === null || String(patch.upiId).trim() === ""
          ? null
          : String(patch.upiId).trim();
    }
    if (patch.demoData !== undefined) settings.demoData = patch.demoData === true;
    pushAudit(ledger, "settings_update", "settings", "singleton", {
      patch: Object.keys(patch),
    });
    persist(ledger);
    return { ok: true, status: 200, data: { ok: true, settings: publicSettings(settings) } };
  }

  /* ---- POST /api/demo/reset ---- */
  if (seg[0] === "demo" && seg[1] === "reset" && method === "POST") {
    ledger.reminders = [];
    ledger.transactions = [];
    ledger.customers = [];
    ledger.audit = [];
    seedDemo(ledger);
    pushAudit(ledger, "demo_reset", "settings", "singleton", {
      seeded: "demo dataset",
      customers: ledger.customers.length,
      transactions: ledger.transactions.length,
    });
    persist(ledger);
    return {
      ok: true,
      status: 200,
      data: { ok: true, customers: ledger.customers.length, transactions: ledger.transactions.length },
    };
  }

  /* ---- GET /api/audit ---- */
  if (seg[0] === "audit" && seg.length === 1 && method === "GET") {
    const raw = search.get("limit");
    const parsed = raw ? Number.parseInt(raw, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const events = [...ledger.audit]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.min(Math.max(limit, 1), 200))
      .map((e) => ({
        id: e.id,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        data: e.data,
        createdAt: e.createdAt.toISOString(),
      }));
    return { ok: true, status: 200, data: { ok: true, events } };
  }

  /* ---- GET /api/export/* (downloaded as Blobs in the static build) ---- */
  if (seg[0] === "export" && method === "GET") {
    if (seg[1] === "backup.json") {
      const backup = backupJsonLocal(ledger);
      return {
        ok: true,
        status: 200,
        data: backup as unknown as Record<string, unknown>,
        blob: {
          content: JSON.stringify(backup, null, 2),
          mime: "application/json",
          filename: `udhaar-khata-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
        },
      };
    }
    if (seg[1] === "transactions.csv") {
      const csv = transactionsCsvLocal(ledger);
      return {
        ok: true,
        status: 200,
        data: { ok: true, csv },
        blob: {
          content: "\ufeff" + csv,
          mime: "text/csv; charset=utf-8",
          filename: `udhaar-transactions-${todayStamp()}.csv`,
        },
      };
    }
    if (seg[1] === "outstanding.csv") {
      const csv = outstandingCsvLocal(ledger);
      return {
        ok: true,
        status: 200,
        data: { ok: true, csv },
        blob: {
          content: "\ufeff" + csv,
          mime: "text/csv; charset=utf-8",
          filename: `udhaar-outstanding-${todayStamp()}.csv`,
        },
      };
    }
  }

  /* ---- POST /api/import ---- */
  if (seg[0] === "import" && seg.length === 1 && method === "POST") {
    const mode = body.mode;
    if (mode !== "replace" && mode !== "merge") {
      return {
        ok: false,
        status: 400,
        data: { ok: false, error: 'Choose a restore mode: "merge" or "replace".' },
      };
    }
    if (!body.backup) {
      return { ok: false, status: 400, data: { ok: false, error: "No backup content was provided." } };
    }
    const result = restoreBackupLocal(ledger, body.backup, mode);
    persist(ledger);
    return { ok: true, status: 201, data: { ok: true, result } };
  }

  /* ---- POST /api/transcribe (not available offline) ---- */
  if (seg[0] === "transcribe" && method === "POST") {
    return {
      ok: false,
      status: 503,
      data: {
        ok: false,
        error:
          "Recorded-voice transcription needs the full-stack server. This offline demo supports browser speech recognition — or just type the entry.",
      },
    };
  }

  /* ---- GET /api/health ---- */
  if (seg[0] === "health" && method === "GET") {
    return { ok: true, status: 200, data: { ok: true, service: "udhaar-khata", shop_id: "static" } };
  }

  return { ok: false, status: 404, data: { ok: false, error: `No local handler for ${method} ${pathname}.` } };
}

/**
 * Entry point used by khataFetch() when NEXT_PUBLIC_STATIC=1. Resolves with
 * the same { ok, status, data } shape as a fetch of the real server (plus an
 * optional { blob } for file exports).
 */
export async function handleLocalRequest<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<LocalResult<T>> {
  const ledger = loadLedger();
  const parsed = new URL(url, "http://khata.local");
  const pathname = parsed.pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const seg = pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent)
    .slice(1); // drop the leading "api"

  try {
    return route(ledger, url, method, body, pathname, parsed.searchParams, seg) as LocalResult<T>;
  } catch (err) {
    return {
      ok: false,
      status: 400,
      data: { ok: false, error: err instanceof Error ? err.message : "Something went wrong." } as T,
    };
  }
}
