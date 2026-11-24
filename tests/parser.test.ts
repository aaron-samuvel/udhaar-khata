/**
 * Regression suite for the natural-language parser — the single most
 * fragile surface of the app: it turns free-text shop sentences into
 * money movements, so a misclassification is a wrong ledger entry.
 *
 * Every case here mirrors a documented behavior or a real bug that was
 * found and fixed (marked "regression"). Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import { parse, QUANTITY_UNITS } from "@/lib/parser";

/** Helper: assert a successful parse with expected fields. */
function expectOk(input: string, expected: { customer?: string; amount?: number; txnType?: string }) {
  const r = parse(input);
  expect(r.ok).toBe(true);
  if (expected.customer !== undefined) expect(r.customer).toBe(expected.customer);
  if (expected.amount !== undefined) expect(r.amount).toBe(expected.amount);
  if (expected.txnType !== undefined) expect(r.txnType).toBe(expected.txnType);
}

function expectFail(input: string, errorPart: string) {
  const r = parse(input);
  expect(r.ok).toBe(false);
  expect(r.error).toContain(errorPart);
}

describe("parse — documented README examples", () => {
  test("english udhaar with quantity + amount", () => {
    expectOk("Ramesh took 2 kg rice for 120 rupees", { customer: "Ramesh", amount: 120, txnType: "UDHAAR" });
  });

  test("english payment", () => {
    expectOk("Ramesh paid 50", { customer: "Ramesh", amount: 50, txnType: "PAYMENT" });
  });

  test("hinglish udhaar", () => {
    expectOk("Amit ne 200 ka udhaar liya", { customer: "Amit", amount: 200, txnType: "UDHAAR" });
  });

  test("hinglish payment (diya)", () => {
    expectOk("Sita diya 50", { customer: "Sita", amount: 50, txnType: "PAYMENT" });
  });
});

describe("parse — transaction type detection", () => {
  test("money the customer gave is a payment, not new credit (regression family)", () => {
    expectOk("Ramesh gave 50", { txnType: "PAYMENT" });
    expectOk("collected 50 from Ramesh", { txnType: "PAYMENT" });
    expectOk("Ramesh se 50 mila", { txnType: "PAYMENT" });
    expectOk("Ramesh ne 100 vasool kiya", { txnType: "PAYMENT" });
  });

  test("payment beats udhaar when both appear ('paid his udhaar')", () => {
    expectOk("Ramesh settled his udhaar of 300", { txnType: "PAYMENT" });
    expectOk("Ramesh paid his udhaar 300", { txnType: "PAYMENT" });
  });

  test("bare 'name + amount' defaults to new credit", () => {
    expectOk("Ramesh took rice 120", { txnType: "UDHAAR" });
    expectOk("Ramesh 120", { txnType: "UDHAAR" });
  });

  test("hinglish return words are payments", () => {
    expectOk("Ramesh wapas 100", { txnType: "PAYMENT" });
    expectOk("Ramesh ne 100 wapas kiye", { txnType: "PAYMENT" });
  });
});

describe("parse — amount extraction", () => {
  test("every currency marker style", () => {
    expectOk("Ramesh paid ₹300", { amount: 300 });
    expectOk("Ramesh paid Rs 300", { amount: 300 });
    expectOk("Ramesh paid rs.300", { amount: 300 });
    expectOk("Ramesh paid 300 rupees", { amount: 300 });
    expectOk("Ramesh paid 300/-", { amount: 300 });
    expectOk("Ramesh paid INR 300", { amount: 300 });
  });

  test("decimal and comma-thousands amounts", () => {
    expectOk("Ramesh paid 50.50", { amount: 50.5 });
    expectOk("Ramesh paid ₹1,200", { amount: 1200 });
    expectOk("Ramesh took rice for 1,250 rupees", { amount: 1250 });
  });

  test("quantity units are never mistaken for amounts", () => {
    expectOk("Ramesh took 2 kg rice for 120", { amount: 120 });
    expectOk("Ramesh took 2kg rice for 120", { amount: 120 });
    expectOk("Ramesh took 3 packets for 90", { amount: 90 });
    expectOk("Ramesh took 2 litre milk and paid 60", { amount: 60, txnType: "PAYMENT" });
    expectOk("Ramesh ne 2 litre doodh liya 60 ka", { amount: 60, txnType: "UDHAAR" });
  });

  test("quantity units exported for tests/consumers", () => {
    expect(QUANTITY_UNITS.has("kg")).toBe(true);
    expect(QUANTITY_UNITS.has("litre")).toBe(true);
    expect(QUANTITY_UNITS.has("packet")).toBe(true);
  });

  test("a phone number inside the sentence is not the amount", () => {
    expectOk("Ramesh 9876543210 paid 50", { amount: 50, customer: "Ramesh" });
  });

  test("multi-item sentence takes the last amount (design: last-amount-wins)", () => {
    expectOk("Ramesh took 2 kg for 120 and 3 kg for 90", { amount: 90 });
  });

  test("negative amounts are rejected, never flipped into a charge (regression)", () => {
    // Before the fix: "Ramesh took -50" parsed as OK UDHAAR amt=+50 — a
    // hostile/typo input silently became a positive ₹50 credit entry.
    const r1 = parse("Ramesh took -50");
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain("greater than zero");
    expect(r1.amount).toBe(-50);

    expectFail("Ramesh took - 50", "greater than zero");
    expectFail("Ramesh paid -50 rupees", "greater than zero");
    expectFail("₹-50 Ramesh", "greater than zero");

    // Guard rails: trailing dash and numeric ranges must NOT read as negative.
    expectOk("ravi paid 75/-", { amount: 75 });
    expectOk("Ramesh took 1-2 kg rice for 120", { amount: 120 });
  });
});

describe("parse — customer extraction", () => {
  test("one, two and three word names", () => {
    expectOk("Ramesh paid 50", { customer: "Ramesh" });
    expectOk("Suresh Kumar took 3 packets for 90", { customer: "Suresh Kumar" });
    expectOk("Ramesh Kumar Gupta paid 50", { customer: "Ramesh Kumar Gupta" });
  });

  test("honorifics are stripped, not part of the name", () => {
    expectOk("Ramesh ji took 100", { customer: "Ramesh" });
    expectOk("Sharma sir paid 100", { customer: "Sharma" });
  });

  test("honorific-prefixed names keep the surname part", () => {
    expectOk("Mrs. Sharma paid 100", { customer: "Mrs. Sharma" });
  });

  test("caps names are preserved verbatim", () => {
    expectOk("ANIL ne 50 liye", { customer: "ANIL" });
  });

  test("amount-first / udhaar-first / verb-first sentences find the name", () => {
    expectOk("₹120 udhaar Ramesh", { customer: "Ramesh" });
    expectOk("udhaar 200 Ramesh", { customer: "Ramesh" });
    expectOk("liya Ramesh ne 100", { customer: "Ramesh" });
    expectOk("paid 50 Ramesh", { customer: "Ramesh" });
    expectOk("deposit 500 by Ramesh", { customer: "Ramesh" });
  });

  test("generic Hinglish goods nouns never become the customer (regression)", () => {
    // Before the fix: "500 ka maal Ramesh ko diya" created customer "Maal Ramesh".
    expectOk("500 ka maal Ramesh ko diya", { customer: "Ramesh", txnType: "PAYMENT" });
    expectOk("saman Ramesh ke liye 200 ka liya", { customer: "Ramesh", txnType: "UDHAAR" });
    expectOk("sauda 300 Ramesh se settle hua", { customer: "Ramesh", txnType: "PAYMENT" });
  });
});

describe("parse — error paths", () => {
  test("empty / blank input asks for a sentence", () => {
    expectFail("", "Please enter a sentence");
    expectFail("   ", "Please enter a sentence");
    expectFail(null, "Please enter a sentence");
    expectFail(undefined, "Please enter a sentence");
  });

  test("name without amount asks for the amount", () => {
    const r = parse("Ramesh");
    expect(r.ok).toBe(false);
    expect(r.customer).toBe("Ramesh");
    expect(r.error).toContain("Could not find the amount");
  });

  test("sentence without a name asks for the customer", () => {
    expectFail("took 50", "Could not find the customer name");
    expectFail("₹50", "Could not find the customer name");
  });

  test("zero amount is rejected", () => {
    expectFail("Ramesh took 0", "greater than zero");
  });

  test("quantity-only payment has no amount to record", () => {
    expectFail("Ramesh returned 2 boxes", "Could not find the amount");
  });
});

describe("parse — rawText fidelity", () => {
  test("rawText echoes the original input, not the normalized copy", () => {
    const r = parse("  Ramesh   paid 50  ");
    expect(r.ok).toBe(true);
    expect(r.rawText).toBe("Ramesh   paid 50");
  });
});
