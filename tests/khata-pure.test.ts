/**
 * Regression suite for the pure ledger helpers (khata-pure.ts) and the
 * money/time formatters (format.ts). These run identically on the server
 * and inside the browser for the GitHub Pages build, so they must stay
 * dependency-free and deterministic. Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REMINDER_TEMPLATE,
  RUPEE_MAX,
  daysSince,
  isValidUpiId,
  nameKey,
  normalizePhone,
  publicCustomer,
  publicReminder,
  publicSettings,
  publicTxn,
  renderTemplate,
  reminderExtras,
  upiCollectLink,
  type CustomerLike,
  type ReminderLike,
  type SettingsLike,
  type TxnLike,
} from "@/lib/khata-pure";
import { amountInWords, formatINR, istDayKey, paiseToRupees, rupeesToPaise } from "@/lib/format";

/** Shared settings fixture (module scope so every describe block sees it). */
const SETTINGS: SettingsLike = {
  shopName: "Sharma Kirana",
  overdueDays: 7,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  upiId: "sharma@okicici",
  demoData: false,
};

describe("nameKey", () => {
  test("uppercase + whitespace-collapsed identity key", () => {
    expect(nameKey("Ramesh Kumar")).toBe("RAMESH KUMAR");
    expect(nameKey("  ramesh    kumar ")).toBe("RAMESH KUMAR");
    expect(nameKey("")).toBe("");
    expect(nameKey(null as unknown as string)).toBe("");
  });
});

describe("normalizePhone", () => {
  test("plain and +91 / 91-prefixed forms", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("919876543210")).toBe("9876543210");
    expect(normalizePhone("+919876543210")).toBe("9876543210");
  });

  test("leading-zero STD form is accepted (regression)", () => {
    // Before the fix: "098765 43210" -> null, leaving the customer without
    // WhatsApp reminders despite a valid Indian mobile number.
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(normalizePhone("098765 43210")).toBe("9876543210");
    expect(normalizePhone("0 98765 43210")).toBe("9876543210");
  });

  test("invalid shapes stay null", () => {
    expect(normalizePhone("987654321")).toBeNull(); // 9 digits
    expect(normalizePhone("98765432109")).toBeNull(); // 11 digits, no STD-0
    expect(normalizePhone("+1-555-1234")).toBeNull(); // foreign
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  test("10-digit number starting with 91 is kept intact", () => {
    expect(normalizePhone("9198765432")).toBe("9198765432");
  });
});

describe("renderTemplate", () => {
  test("all four placeholders", () => {
    expect(
      renderTemplate("Namaste {name} ji, {amount} due for {days} days — {shop}", {
        name: "Ramesh",
        amount: "₹120.00",
        shop: "Sharma Kirana",
        days: 3,
      })
    ).toBe("Namaste Ramesh ji, ₹120.00 due for 3 days — Sharma Kirana");
  });

  test("repeated placeholders are all replaced", () => {
    expect(renderTemplate("{name} — {name} again", { name: "Amit", amount: "", shop: "", days: 0 })).toBe(
      "Amit — Amit again"
    );
  });

  test("default template contains the documented placeholders", () => {
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{name}");
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{amount}");
    expect(DEFAULT_REMINDER_TEMPLATE).toContain("{shop}");
  });
});

describe("UPI helpers", () => {
  test("valid VPA shapes pass", () => {
    expect(isValidUpiId("sharma@okicici")).toBe(true);
    expect(isValidUpiId("shop.name-1_pay@bank")).toBe(true);
    expect(isValidUpiId("  sharma@okicici  ")).toBe(true);
  });

  test("invalid VPA shapes fail", () => {
    expect(isValidUpiId("no-at-sign")).toBe(false);
    expect(isValidUpiId("two@ats@bank")).toBe(false);
    expect(isValidUpiId("@bank")).toBe(false);
    expect(isValidUpiId("sharma@")).toBe(false);
    expect(isValidUpiId("sharma@123")).toBe(false);
  });

  test("upiCollectLink builds a correct intent URI", () => {
    const url = upiCollectLink("sharma@okicici", "Sharma Kirana", 12345, "Udhaar Ramesh");
    expect(url.startsWith("upi://pay?")).toBe(true);
    const q = new URLSearchParams(url.slice("upi://pay?".length));
    expect(q.get("pa")).toBe("sharma@okicici");
    expect(q.get("pn")).toBe("Sharma Kirana");
    expect(q.get("am")).toBe("123.45"); // integer paise -> exact rupees
    expect(q.get("cu")).toBe("INR");
    expect(q.get("tn")).toBe("Udhaar Ramesh");
  });

  test("reminderExtras include amount-in-words always, UPI link only when valid", () => {
    const extrasWithUpi = reminderExtras(SETTINGS, "Ramesh", 150000);
    expect(extrasWithUpi[0]).toContain("Rupees One Thousand Five Hundred Only");
    expect(extrasWithUpi[1]).toContain("upi://pay?");

    const extrasNoUpi = reminderExtras({ ...SETTINGS, upiId: "not-valid" }, "Ramesh", 150000);
    expect(extrasNoUpi).toHaveLength(1);
  });
});

describe("serializers", () => {
  const NOW = new Date("2025-11-21T10:00:00.000Z");

  const TXN: TxnLike = {
    id: "t1",
    name: "Ramesh",
    nameKey: "RAMESH",
    amountPaise: 12345,
    txnType: "UDHAAR",
    rawText: "Ramesh took 123.45",
    note: null,
    reversed: false,
    isReversal: false,
    createdAt: NOW,
  };

  test("publicTxn: integer paise in, rupees + paise out, ISO date", () => {
    const p = publicTxn(TXN);
    expect(p.amount).toBe(123.45);
    expect(p.amountPaise).toBe(12345);
    expect(p.createdAt).toBe("2025-11-21T10:00:00.000Z");
    expect(p.txnType).toBe("UDHAAR");
  });

  const CUSTOMER: CustomerLike = {
    name: "Ramesh Kumar",
    nameKey: "RAMESH KUMAR",
    balancePaise: -50000,
    phone: "9876543210",
    notes: "pays on Sundays",
    creditLimitPaise: 200000,
    archived: false,
    firstDueAt: NOW,
    lastTxnAt: NOW,
    createdAt: NOW,
  };

  test("publicCustomer: balance and credit limit split rupees/paise, nulls preserved", () => {
    const c = publicCustomer(CUSTOMER);
    expect(c.balance).toBe(-500);
    expect(c.balancePaise).toBe(-50000);
    expect(c.creditLimit).toBe(2000);
    expect(c.creditLimitPaise).toBe(200000);
    expect(c.firstDueAt).toBe("2025-11-21T10:00:00.000Z");
  });

  test("publicCustomer: missing optional dates become null", () => {
    const c = publicCustomer({ ...CUSTOMER, firstDueAt: null, lastTxnAt: null });
    expect(c.firstDueAt).toBeNull();
    expect(c.lastTxnAt).toBeNull();
  });

  test("publicSettings keeps upiId as nullable string", () => {
    expect(publicSettings(SETTINGS).upiId).toBe("sharma@okicici");
    expect(publicSettings({ ...SETTINGS, upiId: null }).upiId).toBeNull();
  });

  test("publicReminder splits paise and ISO date", () => {
    const r: ReminderLike = {
      id: "r1",
      nameKey: "RAMESH",
      name: "Ramesh",
      balancePaise: 750,
      daysOverdue: 4,
      phone: null,
      whatsappUrl: "https://wa.me/919876543210",
      message: "Namaste",
      runId: "run1",
      createdAt: NOW,
    };
    const p = publicReminder(r);
    expect(p.balance).toBe(7.5);
    expect(p.createdAt).toBe("2025-11-21T10:00:00.000Z");
  });
});

describe("daysSince", () => {
  test("whole days elapsed for past dates", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    expect(daysSince(threeDaysAgo)).toBe(3);
  });

  test("future dates and null clamp to 0", () => {
    expect(daysSince(new Date(Date.now() + 86_400_000))).toBe(0);
    expect(daysSince(null)).toBe(0);
    expect(daysSince(undefined)).toBe(0);
  });
});

describe("money helpers (format.ts)", () => {
  test("rupeesToPaise rounds float dust away", () => {
    expect(rupeesToPaise(0.1)).toBe(10);
    expect(rupeesToPaise(1.005 * 100) % 1).toBe(0); // always integer paise
    expect(paiseToRupees(12345)).toBe(123.45);
    expect(rupeesToPaise(paiseToRupees(999))).toBe(999); // roundtrip
  });

  test("formatINR uses en-IN grouping with two decimals", () => {
    expect(formatINR(123456789)).toBe("₹12,34,567.89"); // lakh grouping
    expect(formatINR(50)).toBe("₹0.50");
    expect(formatINR(0)).toBe("₹0.00");
  });

  test("istDayKey shifts +05:30 before slicing the date", () => {
    // 21 Nov 2025 15:00 UTC == 20:30 IST same day.
    expect(istDayKey(new Date("2025-11-21T15:00:00Z"))).toBe("2025-11-21");
    // 21 Nov 2025 20:30 UTC == 22 Nov 02:00 IST -> key flips to the 22nd.
    expect(istDayKey(new Date("2025-11-21T20:30:00Z"))).toBe("2025-11-22");
    // 21 Nov 18:29:59 UTC == 21 Nov 23:59:59 IST (still the 21st)...
    expect(istDayKey("2025-11-21T18:29:59Z")).toBe("2025-11-21");
    // ...and 18:30:00 UTC is exactly midnight IST, the first instant of the 22nd.
    expect(istDayKey("2025-11-21T18:30:00Z")).toBe("2025-11-22");
  });
});

describe("amountInWords (Indian numbering)", () => {
  test("ones, tens, hundreds, thousands", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(500)).toBe("Rupees Five Only");
    expect(amountInWords(2500)).toBe("Rupees Twenty Five Only");
    expect(amountInWords(50000)).toBe("Rupees Five Hundred Only");
    expect(amountInWords(100000)).toBe("Rupees One Thousand Only");
    expect(amountInWords(105000)).toBe("Rupees One Thousand Fifty Only");
  });

  test("lakh and crore groupings", () => {
    expect(amountInWords(10000000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(123456789)).toBe(
      "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only"
    );
    expect(amountInWords(1000000000)).toBe("Rupees One Crore Only");
  });

  test("paise appear only when non-zero", () => {
    expect(amountInWords(250)).toBe("Rupees Two and Fifty Paise Only");
    expect(amountInWords(25050)).toBe("Rupees Two Hundred Fifty and Fifty Paise Only");
    expect(amountInWords(25000)).toBe("Rupees Two Hundred Fifty Only");
  });

  test("negative / fractional paise clamp and round deterministically", () => {
    expect(amountInWords(-100)).toBe("Rupees Zero Only");
    expect(amountInWords(100.6)).toBe("Rupees One and One Paise Only"); // round(100.6)=101
  });

  test("sane upper bound constant", () => {
    expect(RUPEE_MAX).toBe(1_000_000);
  });
});
