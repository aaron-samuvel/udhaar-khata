# Self-hosting

Run Udhaar Khata on your own machine/server instead of GitHub Pages.

## Local development
1. Clone the repo, install deps: `npm install` (or `bun install`).
2. Prepare the SQLite database from `prisma/schema.prisma` using the project's DB push script.
3. Start the dev server: `npm run dev`.
4. Open the printed local URL.

## Production (non-static)
- Build without `STATIC_EXPORT` so API routes and Prisma/SQLite stay enabled: `npm run build && npm start`.
- Serve behind HTTPS; point your backup routine at the SQLite file.

## Static variant
- `STATIC_EXPORT=1 npm run build` produces a fully static export (localStorage persistence, no API routes) - this is how the GitHub Pages deployment works, with `basePath=/udhaar-khata`.

## Choosing a mode
| Mode | Persistence | Multi-device sync |
|------|-------------|-------------------|
| Static (Pages) | localStorage | No - manual backup/restore |
| Self-hosted | SQLite file | One server, many browsers |
