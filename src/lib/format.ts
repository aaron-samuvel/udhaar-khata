/** Deterministic money & time helpers. Money is integer paise everywhere. */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatINR(paise: number): string {
  return (
    "₹" +
    (paise / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** YYYY-MM-DD key for a timestamp in India Standard Time (UTC+5:30). */
export function istDayKey(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  return new Date(t.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Midnight in IST for the IST-day containing `d`. */
export function istDayStart(d: Date = new Date()): Date {
  return new Date(`${istDayKey(d)}T00:00:00+05:30`);
}

/** Readable IST timestamp like "2025-11-21 17:12 IST". */
export function istTimestamp(d: Date | string): string {
  const t = (typeof d === "string" ? new Date(d) : d);
  return new Date(t.getTime() + 5.5 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16)
    .concat(" IST");
}

/* ---------------- amount in words (Indian numbering system) ---------------- */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
] as const;
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
] as const;

/** 1–99 → "Twenty One" style. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/** 1–999 → "One Hundred Twenty Three" style. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  const head = `${ONES[h]} Hundred`;
  return rest === 0 ? head : `${head} ${twoDigits(rest)}`;
}

/**
 * Integer paise → "Rupees Two Hundred Thirty Only" (Indian lakh/crore system).
 * Paise fraction appears only when non-zero: "Rupees Two and Fifty Paise Only".
 * Deterministic and side-effect free — safe for receipts and reminders.
 */
export function amountInWords(paise: number): string {
  const p = Math.max(0, Math.round(paise));
  const rupees = Math.floor(p / 100);
  const paisa = p % 100;

  let words: string;
  if (rupees === 0) {
    words = "Zero";
  } else {
    const parts: string[] = [];
    const crore = Math.floor(rupees / 10_000_000);
    const lakh = Math.floor((rupees % 10_000_000) / 100_000);
    const thousand = Math.floor((rupees % 100_000) / 1000);
    const hundred = rupees % 1000;
    if (crore > 0) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
    if (hundred > 0) parts.push(threeDigits(hundred));
    words = parts.join(" ");
  }

  if (paisa > 0) {
    return `Rupees ${words} and ${twoDigits(paisa)} Paise Only`;
  }
  return `Rupees ${words} Only`;
}
