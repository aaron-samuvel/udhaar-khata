/**
 * Shared client helpers for the Udhaar Khata frontend.
 * All money crosses the wire as integer paise; display goes through formatINR.
 *
 * STATIC BUILD (GitHub Pages): there is no server, so khataFetch routes every
 * /api/* call to local-server.ts — a localStorage-backed ledger that mirrors
 * the server contracts. The full-stack path is untouched when not static.
 */
import type { TxnType } from "@/lib/types";
import { handleLocalRequest } from "./local-server";

/**
 * Baked in at build time. The static-export build sets NEXT_PUBLIC_STATIC=1,
 * which flips every API call to the in-browser ledger.
 */
export const IS_STATIC: boolean = process.env.NEXT_PUBLIC_STATIC === "1";

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
  if (IS_STATIC) {
    // Static Pages build: serve from the in-browser ledger (same contract).
    return handleLocalRequest<T>(url, init);
  }
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

/**
 * Client-side UPI intent link (mirrors the server helper without dragging the
 * db layer into the client bundle). Same param contract: pa/pn/am/cu/tn.
 */
export function upiLinkClient(
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
 * Open a WhatsApp deep link in a new tab WITHOUT the `noopener` feature string.
 * Why not `window.open(url, "_blank", "noopener,noreferrer")`? With noopener the
 * browser always returns null, so a real popup-block is indistinguishable from a
 * success — the shopkeeper would silently lose the reminder. We open normally,
 * sever the opener reference, and return false when the popup was blocked so the
 * caller can fall back to a copyable link.
 */
export function openWhatsApp(url: string): boolean {
  const win = window.open(url, "_blank");
  if (win) {
    try {
      win.opener = null;
    } catch {
      // cross-origin opener access can throw in some browsers — already safe
    }
    return true;
  }
  return false;
}

/** Clipboard write with an execCommand fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ---------------- file exports (backup / CSV) ---------------- */

function triggerBlobDownload(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Download an export file. Full-stack mode: plain navigation (the server sets
 * the content-disposition filename). Static mode: build the file in-browser
 * from the local ledger and download it as a Blob.
 */
export async function downloadExport(url: string): Promise<void> {
  if (!IS_STATIC) {
    window.location.href = url;
    return;
  }
  const result = await handleLocalRequest<Record<string, unknown>>(url);
  if (result.blob) {
    triggerBlobDownload(result.blob.content, result.blob.mime, result.blob.filename);
  }
}

/* ---------------- backup freshness (localStorage) ---------------- */

const BACKUP_STAMP_KEY = "udhaar-khata-last-backup-at";

/** ISO timestamp of the last full-backup download, or null if never. */
export function getLastBackupAt(): string | null {
  try {
    const raw = window.localStorage.getItem(BACKUP_STAMP_KEY);
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  } catch {
    return null;
  }
}

/** Record that a backup was downloaded right now (called from the download click). */
export function stampBackupNow(): void {
  try {
    window.localStorage.setItem(BACKUP_STAMP_KEY, new Date().toISOString());
  } catch {
    // storage blocked — the nudge is a nicety, not a requirement
  }
}

/** Whole days since the last backup (9999 when never backed up). */
export function daysSinceBackup(): number {
  const iso = getLastBackupAt();
  if (!iso) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
