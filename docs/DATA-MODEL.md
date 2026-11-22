# Data model

## Entities
- **Customer** - name, optional phone, derived balance (paise).
- **Entry** - an udhaar (credit given) or a payment (credit received). Entries are immutable; corrections create new entries.
- **Balance** - derived, never the source of truth: the sum of entries in integer paise.

## Rules
- All money is integer paise. ₹1,234.50 is stored as `123450`.
- A mistake is fixed with a **reversal entry** (an opposite entry linked to the original). Hard deletes are forbidden in ledger logic.
- Amounts render with `en-IN` digit grouping (₹1,23,456).

## Persistence
- Static deploy: browser `localStorage` on the device.
- Self-hosted: SQLite via Prisma with the same shapes.
