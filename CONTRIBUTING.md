# Contributing to Udhaar Khata

Thanks for your interest in improving this little khata app! Contributions of all
sizes are welcome — parser fixes, UI polish, docs, translations, bug reports.

## Project structure

```
src/                     Next.js 16 app (App Router, TypeScript)
  app/                   Routes, layout, API handlers
  components/            UI components (shadcn/ui + app components)
  lib/                   Core logic — parser, storage, reports, WhatsApp/UPI links
prisma/                  Database schema (SQLite for the demo backend)
mini-services/           Standalone services (Spring Boot production backend)
scripts/                 Build & deployment helpers (static export, Pages deploy)
```

## Getting started

```bash
bun install                # or npm install / pnpm install
bun run db:push            # create/update the SQLite schema
bun run dev                # http://localhost:3000
```

Optional: run the production-grade Spring Boot backend from
`mini-services/udhaar-backend/` (see its README for Docker/H2/PostgreSQL setup).

## Development guidelines

- **Parser changes** (`src/lib/parser.ts`): add test sentences to
  `scripts/parser-battery.ts` and make sure existing ones still pass.
  Quantity units (`kg`, `packet`) must never be parsed as rupee amounts.
- **Money is stored as integer paise** — never use floats for amounts.
- **Reversals, not deletions** — transactions are corrected by adding reversal
  entries; nothing is hard-deleted.
- **UI**: use the existing shadcn/ui components and Tailwind classes; keep the
  app mobile-first (many shop owners will use this on phones).

## Commit & PR conventions

- Keep commits focused; use imperative subjects (`fix:`, `feat:`, `docs:`).
- For PRs: describe the user-visible behaviour change and how to test it.
- If your PR fixes an issue, reference it in the description.

## Reporting bugs

Open an issue with: what you typed (or spoke), what you expected,
what actually happened, and a screenshot if it's a UI problem.
