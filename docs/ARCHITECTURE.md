# Architecture

- **UI**: React + Tailwind CSS 4 + shadcn/ui (New York style), Lucide icons.
- **Framework**: Next.js 16 App Router, TypeScript strict mode.
- **Static mode**: `STATIC_EXPORT=1` swaps persistence to `localStorage` and sets `basePath=/udhaar-khata` for GitHub Pages.
- **Self-hosted mode**: API routes + Prisma/SQLite.
- **Money**: integer paise everywhere; formatting via `Intl` with `en-IN`.
- **State**: ledger state derives from the entries list; no duplicated balance sources.

## Layout conventions
- Root wrapper is `min-h-screen flex flex-col`; footer uses `mt-auto` (sticky footer).
- Cards use consistent `p-4`/`p-6` padding and `gap-4`/`gap-6` spacing.
- Long lists scroll inside `max-h-96 overflow-y-auto`.
