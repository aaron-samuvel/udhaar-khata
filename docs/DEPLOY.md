# Deploying your own instance

Three supported targets, from simplest to most production-ready.

## 1. Static, browser-only (GitHub Pages)

The default path - everything runs client-side, data persists per-browser in localStorage.

```bash
STATIC_EXPORT=1 bun install && STATIC_EXPORT=1 bun run build
GH_TOKEN=<PAT with Contents:write> bash scripts/deploy-pages.sh
```

- `STATIC_EXPORT=1` switches `next.config.ts` to `output: 'export'` with
  `basePath: '/udhaar-khata'` and swaps the Prisma data layer for the localStorage
  adapter (`src/lib/local-server.ts`).
- The helper script publishes the export to the `gh-pages` branch (including
  `.nojekyll`, so GitHub Pages serves the `_next/` assets).
- In **Settings -> Pages**, keep Source = `gh-pages` branch, root.

Gotchas:

- Data is per-browser: use **Settings -> Backup** to export a JSON snapshot regularly.
- If you rename the repo, update `basePath` in `next.config.ts` or assets will 404.
- Pushing anything under `.github/workflows/` needs a PAT with the `workflow` scope;
  the script avoids Actions entirely (deploy-from-branch).

## 2. Local full-stack demo (Next.js + SQLite)

```bash
bun install
bun run db:push   # create/update the SQLite schema
bun run dev       # http://localhost:3000
```

## 3. Production backend (Spring Boot)

See [`mini-services/udhaar-backend/README.md`](../mini-services/udhaar-backend/README.md)
for the Java 21 + Spring Boot 3.3 backend: JWT auth, multi-shop ledger,
Flyway migrations, PostgreSQL/H2, and a Dockerfile.
