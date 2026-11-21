/**
 * Parse plain English / Hinglish shop sentences into a credit-ledger entry.
 *
 * Ported from the original Udhaar Khata Python parser (parser.py) — a small
 * keyword + regex routine that a shopkeeper can learn in one glance:
 *
 *   Ramesh took 2 kg rice for 120 rupees   -> Ramesh, Rs 120, UDHAAR
 *   Ramesh paid 50                         -> Ramesh, Rs 50,  PAYMENT
 *   Amit ne 200 ka udhaar liya             -> Amit,   Rs 200, UDHAAR
 *   Sita diya 50                           -> Sita,   Rs 50,  PAYMENT
 */

export type TxnType = "UDHAAR" | "PAYMENT";

export interface ParseResult {
  ok: boolean;
  customer?: string;
  amount?: number;
  txnType?: TxnType;
  rawText: string;
  error?: string;
}

const PAYMENT_WORDS = new Set([
  "paid",
  "payment",
  "pay",
  "pays",
  "paying",
  "diya",
  "diye",
  "dia",
  "deya",
  "diyaa",
  "jama",
  "jamah",
  "settled",
  "settle",
  "settlement",
  "wapas",
  "waapas",
  "return",
  "returned",
  "repay",
  "repaid",
  "clear",
  "cleared",
  "clearing",
  "deposit",
  "deposited",
  // money the customer GAVE to the shop (fixed after the QA battery found
  // "Ramesh gave 50" / "collected 50 from Ramesh" / "Ramesh se 50 mila"
  // misclassified as new credit).
  "gave",
  "gaye",
  "gae",
  "collect",
  "collects",
  "collected",
  "received",
  "receive",
  "mila",
  "milaa",
  "mile",
  "milgaya",
  "milgayi",
  "vasool",
  "vasoole",
  "vasoolee",
]);

const UDHAAR_WORDS = new Set([
  "took",
  "take",
  "takes",
  "taken",
  "udhaar",
  "udhar",
  "udhari",
  "liya",
  "liye",
  "lia",
  "liyaa",
  "lene",
  "credit",
  "kharid",
  "kharida",
  "kharidi",
  "kharide",
  "bought",
  "buy",
  "buys",
  "purchase",
  "purchased",
  "loan",
  "due",
  "borrowed",
  "borrow",
]);

const HONORIFICS = new Set(["ji", "sir", "madam", "madame", "bhai", "ben", "anna"]);

export const QUANTITY_UNITS = new Set([
  "kg",
  "kilo",
  "kilos",
  "kilogram",
  "kilograms",
  "g",
  "gm",
  "gram",
  "grams",
  "ltr",
  "liter",
  "litre",
  "liters",
  "litres",
  "ml",
  "packet",
  "packets",
  "pkt",
  "pkts",
  "piece",
  "pieces",
  "pc",
  "pcs",
  "item",
  "items",
  "dozen",
  "darjan",
  "bag",
  "bags",
  "box",
  "boxes",
  "bottle",
  "bottles",
  "tin",
  "tins",
]);

const NAME_STOP = new Set([
  "ne",
  "ko",
  "se",
  "ke",
  "ki",
  "ka",
  "a",
  "an",
  "the",
  "for",
  "from",
  "to",
  "of",
  "and",
  "rs",
  "rupee",
  "rupees",
  "inr",
  "on",
  "in",
  "with",
  "by",
  "as",
  "has",
  "have",
  "had",
  "his",
  "her",
  "their",
  "my",
  "our",
  ...PAYMENT_WORDS,
  ...UDHAAR_WORDS,
  ...QUANTITY_UNITS,
]);

const AMOUNT_PATTERNS: RegExp[] = [
  /₹\s*(\d+(?:\.\d{1,2})?)/g,
  /(?:rs\.?|rupees?|inr)\s*(\d+(?:\.\d{1,2})?)/gi,
  /(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|rupees?|inr|₹|\/-)/gi,
  /(?:for|ka|ki|ke)\s+(\d+(?:\.\d{1,2})?)\b/gi,
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function detectType(tokensLower: string[]): TxnType | null {
  const hasPayment = tokensLower.some((t) => PAYMENT_WORDS.has(t));
  const hasUdhaar = tokensLower.some((t) => UDHAAR_WORDS.has(t));
  // "paid his udhaar" / "udhaar settled" is a payment.
  if (hasPayment) return "PAYMENT";
  if (hasUdhaar) return "UDHAAR";
  return null;
}

function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const matches = [...text.matchAll(pattern)].map((m) => m[1]);
    if (matches.length > 0) {
      return round2(parseFloat(matches[matches.length - 1]));
    }
  }

  // Fallback: numbers that are not quantities (not followed by kg, litre, ...).
  const tokens = text.match(/[A-Za-z]+|\d+(?:\.\d{1,2})?/g) ?? [];
  const skip = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+(?:\.\d{1,2})?$/.test(tokens[i])) {
      const next = (tokens[i + 1] ?? "").toLowerCase();
      if (QUANTITY_UNITS.has(next)) skip.add(i);
    }
  }
  const amounts: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!skip.has(i) && /^\d+(?:\.\d{1,2})?$/.test(tokens[i])) {
      amounts.push(parseFloat(tokens[i]));
    }
  }
  if (amounts.length === 0) return null;
  return round2(amounts[amounts.length - 1]);
}

/**
 * Capitalize and join a picked name ("ramesh kumar" -> "Ramesh Kumar").
 */
function titleCaseName(parts: string[]): string {
  return parts
    .join(" ")
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function extractCustomer(text: string): string | null {
  const cleaned = text.replace(/[₹,]/g, " ");
  const words = cleaned.match(/[A-Za-z][A-Za-z'.]*/g) ?? [];
  const parts: string[] = [];
  for (const word of words) {
    const lowered = word.toLowerCase().replace(/\.$/, "");
    if (HONORIFICS.has(lowered)) continue;
    if (NAME_STOP.has(lowered)) break;
    parts.push(word);
  }

  // Second chance (added after the QA battery): sentences that don't START
  // with the customer's name — "₹120 udhaar Ramesh", "udhaar 200 Ramesh",
  // "liya Ramesh ne 100". Scan the whole line for the first word that is
  // neither a stop word nor an honorific, and take up to three words from
  // there (stopping at the next stop word).
  if (parts.length === 0) {
    for (let i = 0; i < words.length; i++) {
      const lowered = words[i].toLowerCase().replace(/\.$/, "");
      if (HONORIFICS.has(lowered) || NAME_STOP.has(lowered)) continue;
      const rest: string[] = [words[i]];
      for (let j = i + 1; j < words.length && rest.length < 3; j++) {
        const nextLowered = words[j].toLowerCase().replace(/\.$/, "");
        if (HONORIFICS.has(nextLowered)) continue;
        if (NAME_STOP.has(nextLowered)) break;
        rest.push(words[j]);
      }
      parts.push(...rest);
      break;
    }
  }

  if (parts.length === 0) return null;
  // Most personal names in this context are one to three words.
  return titleCaseName(parts.slice(0, 3));
}

export function parse(input: string | null | undefined): ParseResult {
  if (input === null || input === undefined || !String(input).trim()) {
    return {
      ok: false,
      rawText: input === null || input === undefined ? "" : String(input),
      error:
        "Please enter a sentence, for example: 'Ramesh took 2 kg rice for 120 rupees'.",
    };
  }

  const raw = String(input).trim();
  const normalized = raw.replace(/\s+/g, " ").replace(/,/g, "");

  const tokens = normalized.match(/[A-Za-z]+|\d+(?:\.\d+)?/g) ?? [];
  const tokensLower = tokens.map((t) => t.toLowerCase());

  const txnType = detectType(tokensLower);
  const amount = extractAmount(normalized);
  const customer = extractCustomer(normalized);

  if (!customer) {
    return {
      ok: false,
      rawText: raw,
      error:
        "Could not find the customer name. Try starting with the name, for example: 'Ramesh paid 50'.",
    };
  }
  if (amount === null) {
    return {
      ok: false,
      rawText: raw,
      customer,
      error:
        "Could not find the amount. Try 'Ramesh paid 50' or 'Ramesh took rice for 120 rupees'.",
    };
  }
  if (amount <= 0) {
    return {
      ok: false,
      rawText: raw,
      customer,
      amount,
      error: "Amount must be greater than zero.",
    };
  }
  // A name plus an amount with no verb is treated as new credit, which is how
  // a kirana owner typically uses a one-line khata entry.
  const finalType: TxnType = txnType ?? "UDHAAR";

  return {
    ok: true,
    customer,
    amount,
    txnType: finalType,
    rawText: raw,
  };
}
