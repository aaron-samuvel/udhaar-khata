/**
 * Parser stress battery — run with: bun run scripts/parser-battery.ts
 * Mirrors real sentences shopkeepers say/type (from khata app reviews).
 * Temporary QA script — safe to delete.
 */
import { parse } from "../src/lib/parser";

const CASES: { text: string; expectCustomer?: string; expectAmount?: number; expectType?: string }[] = [
  // --- core preserved cases ---
  { text: "Ramesh took 2 kg rice for 120 rupees", expectCustomer: "Ramesh", expectAmount: 120, expectType: "UDHAAR" },
  { text: "Ramesh paid 50", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Amit ne 200 ka udhaar liya", expectCustomer: "Amit", expectAmount: 200, expectType: "UDHAAR" },
  { text: "Sita diya 50", expectCustomer: "Sita", expectAmount: 50, expectType: "PAYMENT" },
  // --- realistic variants that should work ---
  { text: "Ramesh took rice 120", expectCustomer: "Ramesh", expectAmount: 120, expectType: "UDHAAR" },
  { text: "Ramesh 2 kg chawal 120", expectCustomer: "Ramesh", expectAmount: 120 },
  { text: "Ramesh paid 50/-", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Sita ji ne 200 jama kiye", expectCustomer: "Sita", expectAmount: 200, expectType: "PAYMENT" },
  { text: "Ramesh gave 50", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Ramesh returned 2 kg rice worth 100", expectCustomer: "Ramesh", expectAmount: 100, expectType: "PAYMENT" },
  { text: "Amit ka udhaar 250", expectCustomer: "Amit", expectAmount: 250, expectType: "UDHAAR" },
  { text: "Ramesh paid 1,200 rupees", expectCustomer: "Ramesh", expectAmount: 1200, expectType: "PAYMENT" },
  { text: "₹120 udhaar Ramesh", expectCustomer: "Ramesh", expectAmount: 120, expectType: "UDHAAR" },
  { text: "udhaar 200 Ramesh", expectCustomer: "Ramesh", expectAmount: 200, expectType: "UDHAAR" },
  { text: "liya Ramesh ne 100", expectCustomer: "Ramesh", expectAmount: 100, expectType: "UDHAAR" },
  { text: "collected 50 from Ramesh", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Ramesh se 50 mila", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Ramesh ne 50 diye", expectCustomer: "Ramesh", expectAmount: 50, expectType: "PAYMENT" },
  { text: "Ramesh took 120 ki cheez", expectCustomer: "Ramesh", expectAmount: 120, expectType: "UDHAAR" },
  { text: "Ramesh ko 500 ka saman diya", expectCustomer: "Ramesh", expectAmount: 500, expectType: "PAYMENT" },
  { text: "Ramesh settled his udhaar of 300", expectCustomer: "Ramesh", expectAmount: 300, expectType: "PAYMENT" },
  // --- should still FAIL gracefully (no amount) ---
  { text: "Ramesh took 1.5 kg sugar" },
];

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const r = parse(c.text);
  const problems: string[] = [];
  if (c.expectCustomer !== undefined) {
    if (!r.ok) problems.push(`parse failed: ${r.error}`);
    else {
      if (r.customer !== c.expectCustomer) problems.push(`customer "${r.customer}" != "${c.expectCustomer}"`);
      if (c.expectAmount !== undefined && r.amount !== c.expectAmount) problems.push(`amount ${r.amount} != ${c.expectAmount}`);
      if (c.expectType !== undefined && r.txnType !== c.expectType) problems.push(`type ${r.txnType} != ${c.expectType}`);
    }
  } else {
    if (r.ok) problems.push(`expected graceful failure but parsed as ${r.customer}/${r.amount}`);
    else if (!r.customer) problems.push("failure message should still include the name if found");
  }
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  "${c.text}"  ->  ${r.customer ?? "-"} / ${r.amount ?? "-"} / ${r.txnType ?? "-"}`);
  } else {
    fail++;
    console.log(`FAIL  "${c.text}"\n      ${problems.join(" | ")}   (got ${r.customer ?? "-"} / ${r.amount ?? "-"} / ${r.txnType ?? "-"})`);
  }
}
console.log(`\n${pass} passed, ${fail} failed of ${CASES.length}`);
