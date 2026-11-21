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

/** Readable IST timestamp like "21 Nov, 5:12 PM". */
export function istTimestamp(d: Date | string): string {
  const t = (typeof d === "string" ? new Date(d) : d);
  return new Date(t.getTime() + 5.5 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16)
    .concat(" IST");
}
