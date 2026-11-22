# Codebase tour

Where things live:

- `src/app/` - App Router pages and API routes (self-hosted mode).
- `src/components/` - UI. `src/components/ui/` is the shadcn/ui kit; feature components sit beside it.
- `src/lib/` - domain logic: money helpers (integer paise), entry parsing, storage layer (localStorage in static mode, Prisma otherwise).
- `prisma/` - schema for the self-hosted SQLite database.
- `docs/` - start with [DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md).
- `scripts/` - maintenance scripts.
- `tests/` - test fixtures and checks.

The two hot paths to read first: the entry parser (see [PARSING-RULES.md](PARSING-RULES.md)) and the balance logic (see [DATA-MODEL.md](DATA-MODEL.md)).
