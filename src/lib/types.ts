/** Shared API types used by both backend routes and the frontend. */

export type TxnType = "UDHAAR" | "PAYMENT";

export interface CustomerPublic {
  name: string;
  nameKey: string;
  /** Balance in rupees (display convenience). Source of truth: balancePaise. */
  balance: number;
  /** Balance in integer paise — exact. */
  balancePaise: number;
  phone: string | null;
  notes: string | null;
  firstDueAt: string | null;
  lastTxnAt: string | null;
  createdAt: string;
}

export interface TxnPublic {
  id: string;
  name: string;
  nameKey: string;
  /** Amount in rupees (display convenience). Source of truth: amountPaise. */
  amount: number;
  amountPaise: number;
  txnType: TxnType;
  rawText: string;
  note: string | null;
  /** true when this line was voided by a reversal (excluded from reports). */
  reversed: boolean;
  /** true when this line IS a reversal correction (excluded from reports). */
  isReversal: boolean;
  createdAt: string;
}

export interface ReminderPublic {
  id: string;
  name: string;
  balance: number;
  balancePaise: number;
  daysOverdue: number;
  phone: string | null;
  whatsappUrl: string;
  message: string;
  runId: string;
  createdAt: string;
}

export interface SettingsPublic {
  shopName: string;
  overdueDays: number;
  reminderTemplate: string;
  demoData: boolean;
}

export interface AuditPublic {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  data: string;
  createdAt: string;
}

export interface ReportsResponse {
  range: { from: string; to: string; label: string };
  totals: {
    credit: number;
    payments: number;
    net: number;
    creditPaise: number;
    paymentsPaise: number;
    count: number;
  };
  series: { date: string; credit: number; payments: number }[];
  customerOutstanding: {
    name: string;
    phone: string | null;
    balance: number;
    balancePaise: number;
    daysDue: number;
    notes: string | null;
  }[];
  recent: TxnPublic[];
  meta: { customers: number; withDues: number; settled: number };
}
