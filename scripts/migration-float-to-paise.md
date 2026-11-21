# Migration Plan: Float Rupees → Integer Paise (v1 → v2 schema)

## Why

v1 stored `balance` and `amount` as SQLite `REAL` (IEEE-754 floats). Binary
floating point cannot represent values like 0.1 exactly, so repeated
credit/payment arithmetic can drift by 1 paise — unacceptable for a financial
ledger. v2 stores every money value as an **integer paise** column
(`balancePaise`, `amountPaise`), making all arithmetic exact.

## What changed in the schema

| v1 (Float)         | v2 (Int, paise)          |
| ------------------ | ------------------------ |
| Customer.balance   | Customer.balancePaise    |
| Transaction.amount | Transaction.amountPaise  |
| Reminder.balance   | Reminder.balancePaise    |
| —                  | Customer.notes           |
| —                  | Transaction.note         |
| —                  | Transaction.reversed     |
| —                  | Transaction.isReversal   |
| —                  | Transaction.reversedById |
| —                  | AuditEvent (new model)   |
| —                  | Settings (new model)     |

## Migration plan (production database)

Because SQLite cannot ALTER a column type in place, the production-safe,
zero-data-loss procedure is an **expand → backfill → switch → contract** cycle
run inside maintenance windows:

1. **Expand** — deploy the v2 schema with the old Float columns kept
   temporarily. New integer columns are added alongside
   (`balancePaise`, `amountPaise`).
2. **Backfill** — one idempotent SQL pass converts and copies existing values,
   rounding to the nearest paise:

   ```sql
   UPDATE Customer    SET balancePaise = CAST(ROUND(balance * 100) AS INTEGER);
   UPDATE Transaction SET amountPaise  = CAST(ROUND(amount  * 100) AS INTEGER);
   UPDATE Reminder    SET balancePaise = CAST(ROUND(balance * 100) AS INTEGER);
   ```

   Verify `balancePaise IS NULL` counts are 0 before proceeding.
3. **Switch reads/writes** — deploy application code that reads/writes only the
   paise columns (this codebase, `src/lib/khata.ts`).
4. **Contract** — in a second maintenance window, drop the legacy Float
   columns using the standard SQLite table-rebuild procedure (create new
   table → INSERT SELECT → rename → drop old → recreate indexes).
5. **Verify** — reconciliation query comparing a pre-migration totals snapshot
   (per customer and ledger-wide) with post-migration sums.

## This environment

The database contained only seeded demonstration data created minutes before
the migration, so the cycle was executed as a single
`prisma db push --accept-data-loss` followed by a fresh, clearly-labeled demo
reseed via `POST /api/demo/reset`. No real business data existed to preserve.
For any production deployment with real merchant data, the full 5-step
procedure above MUST be used instead.

## Application-layer guards

- All money crosses the API as either integer paise or validated rupee floats
  that are immediately converted with `Math.round(rupees * 100)`
  (`rupeesToPaise` in `src/lib/format.ts`).
- No float is ever written to a `*Paise` column without conversion.
- Display formatting (`formatINR`) divides integers only — deterministic.
