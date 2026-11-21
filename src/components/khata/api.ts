/**
 * Shared client helpers for the Udhaar Khata frontend.
 * All money crosses the wire as integer paise; display goes through formatINR.
 */
import type { TxnType } from "@/lib/types";

export interface KhataResult<T = Record<string, unknown>> {
  ok: boolean;
  /** HTTP status — callers branch on it (e.g. 409 for duplicates). */
  status: number;
  data: T;
}

/**
 * Small fetch wrapper: always resolves with { ok, status, data } so callers can
 * branch (409 duplicates, 400 validation, 201 created) without try/catch.
 * Only throws for network-level failures.
 */
export async function khataFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<KhataResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** POST JSON helper on top of khataFetch. */
export function khataPost<T = Record<string, unknown>>(
  url: string,
  body: unknown
): Promise<KhataResult<T>> {
  return khataFetch<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Extract a human error message from a khataFetch result. */
export function errOf(result: KhataResult<unknown>, fallback = "Something went wrong."): string {
  const e = (result.data as { error?: string } | null)?.error;
  return e || fallback;
}

/** "2 min ago" / "3 hr ago" / "2 days ago" style relative time. */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr ago`;
}

/** Whole days since an ISO timestamp (for "due since N days"). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/** "21 Nov" style label for a YYYY-MM-DD chart key. */
export function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Fixed palette per the khata design system. */
export const KHATA = {
  ink: "#1c261f",
  muted: "#5c6b62",
  teal: "#0f5c4c",
  tealDark: "#0a3f35",
  saffron: "#c56a16",
  due: "#9b2c2c",
  whatsapp: "#128c7e",
  chipBg: "#fde8d0",
  chipNeutral: "#efe4d2",
} as const;

/** Color + sign convention: udhaar is red "+", payment is teal "−". */
export function amountStyle(txnType: TxnType): { className: string; sign: "+" | "−" } {
  return txnType === "UDHAAR"
    ? { className: "text-[#9b2c2c]", sign: "+" }
    : { className: "text-[#0f5c4c]", sign: "−" };
}

/** Example sentences surfaced as one-tap chips on the entry card. */
export const EXAMPLE_SENTENCES = [
  "Ramesh took 2 kg rice for 120 rupees",
  "Ramesh paid 50",
  "Amit ne 200 ka udhaar liya",
] as const;

/** Validate an optional 10-digit Indian mobile number. */
export function isValidPhone(phone: string): boolean {
  return /^\d{10}$/.test(phone.trim());
}
