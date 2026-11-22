# Parsing rules (for contributors)

Input parsing is the most sensitive part of the ledger. These rules are non-negotiable:

1. **Quantity units are never money.** Text like `2 kg`, `5 L`, `12 pcs` must never be read as rupees. Only explicit money markers (₹, "rs", "rupees") or bare numbers in a money field count as amounts.
2. **Money is integer paise.** All amounts are stored as integers in paise. No floats, ever. ₹12.50 = `1250`.
3. **Reversals, not deletions.** Wrong entries are corrected by posting an opposite (reversal) entry. Ledger rows are never destroyed, so the audit trail survives.
4. **Ambiguity loses.** When a shorthand could parse two ways ("50" as ₹50 or 50 g?), the parser must ask, never guess.

When touching `src/` parsing code, add a fixture/example for each rule above.
