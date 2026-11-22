# Udhaar Khata — Kirana Credit Ledger (Next.js Rebuild)

A digital *khata* (credit ledger) for small shop owners. Record udhaar (credit) and payments
by typing plain English or Hinglish — or just by speaking. Track customer balances, send
WhatsApp payment reminders with UPI collect links, and see daily reports at a glance.

This is a full-stack rebuild of the original project (an AWS SAM serverless version,
preserved in git history) as a modern Next.js application.

## Features

- **Natural language entries** — type `Ramesh took 2 kg rice for 120 rupees` or
  `Amit ne 200 ka udhaar liya` or `Suresh paid 50`; the parser figures out customer,
  amount, and whether it is udhaar or payment. Quantity units (`kg`, `packet`, `2 kg`)
  are never mistaken for amounts.
- **Voice entries** — speak the same sentences. Uses the browser Web Speech API when
  available, with an automatic server-side transcription fallback.
- **Customer ledgers** — running balance per customer, full transaction history,
  phone numbers, credit limits, and archiving.
- **WhatsApp reminders** — one tap opens WhatsApp with a ready-made Hinglish reminder,
  including a UPI collect link pre-filled with the exact amount owed.
- **One-tap settle-up** — mark full or partial payments directly from the customer card.
- **Daily reports** — today's udhaar, collections, net position, and a dues sweep view.
- **Safety rails** — duplicate-entry detection, per-customer credit limits, reversal
  entries (nothing is ever hard-deleted), activity log.
- **Offline drafts & PWA** — installable app shell; entries typed while offline are kept
  as drafts and submitted when back online.
- **Backup & restore** — full JSON export/import of the entire khata.
- **Amounts in words** — rupee amounts shown in words on statements and reminders.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript, Tailwind CSS 4 + shadcn/ui, Lucide icons |
| Demo backend | Next.js API routes + Prisma ORM + SQLite |
| Production backend | **Java 21 + Spring Boot 3.3** — JWT auth, PostgreSQL/H2, Flyway, Docker ([backend README](mini-services/udhaar-backend/README.md)) |
| Voice fallback | z-ai-web-dev-sdk ASR (server-side) |

## Architecture — three ways to run

| Mode | Data lives in | Use it for |
|---|---|---|
| [**GitHub Pages**](https://aaron-samuvel.github.io/udhaar-khata/) | browser `localStorage` | Try it instantly, zero install |
| **Next.js full-stack** (this repo root) | SQLite via Prisma | Local demo with server voice fallback |
| **Spring Boot backend** ([`mini-services/udhaar-backend`](mini-services/udhaar-backend/README.md)) | PostgreSQL (prod) / H2 (dev) | Production, multi-shop, heavy load |

The frontend speaks ONE api contract. The Spring backend implements it
exactly (same paths, status codes, error strings), so pointing Next.js at it
is a single env var:

```bash
# in the Next.js .env
API_BACKEND_URL=http://localhost:8080   # /api/* is proxied to Spring Boot
```

## Production Backend (Java Spring Boot)

```bash
cd mini-services/udhaar-backend
mvn spring-boot:run            # dev (H2, auto-seeded demo shop)
# or production:
UDHAAR_JWT_SECRET=$(openssl rand -base64 48) docker compose up -d --build
```

- JWT signup/login (`/api/auth/*`), every ledger row scoped per shop
- Stateless = scale horizontally (`docker compose up -d --scale app=4`)
- Swagger UI at `/swagger-ui.html`, health at `/actuator/health`
- Login/signup rate limiting, BCrypt, JSON 401/403, CORS allow-list

## Project Assessment — what was missing, what's now added

An honest audit of the project before this update, and what was done:

| Gap found | Status now |
|---|---|
| No production-grade backend (SQLite + Next API routes don't scale to many shops) | **Done** — Spring Boot service with JWT multi-tenancy, PostgreSQL, Flyway, Docker |
| No auth / accounts — anyone using the deployment shares one ledger | **Done** — accounts + per-shop isolation; legacy anonymous mode keeps the demo frontend working unchanged |
| Frontend could not switch backends without code changes | **Done** — one env var (`API_BACKEND_URL`) proxies the whole `/api` surface |
| Offline restore broken on GitHub Pages (`/api/import` 404 in the static build) | **Fixed** — the in-browser ledger now implements restore |
| A `.gitignore` rule (`local-*`) silently excluded the static ledger file from git — fresh clones could not build | **Fixed** — rule negated, file committed |
| Backup format was Next-only | **Done** — backup JSON v2 is byte-compatible across Next.js, Spring Boot and the browser ledger |
| CI pipeline | **Pending** — needs a GitHub token with `workflow` scope (see roadmap) |

## Roadmap

- [ ] CI/CD on GitHub Actions (blocked: deploy token needs the `workflow` scope — run `GH_TOKEN=… bash scripts/deploy-pages.sh` manually meanwhile)
- [ ] Auth UI in the frontend (the backend API is ready; the UI still runs in legacy/demo mode)
- [ ] Refresh-token rotation + per-device sessions
- [ ] Shared rate-limit store (Redis) when running many backend replicas
- [ ] Server-side ASR in the Spring service (browser Web Speech covers most browsers today)
- [ ] Observability stack (OpenTelemetry traces + Grafana)

## Getting Started

```bash
bun install
bun run db:push      # create SQLite schema
bun run dev          # http://localhost:3000
```

No environment secrets required beyond a local `DATABASE_URL` (created automatically).

## How Entries Are Parsed

| You type | Result |
|---|---|
| `Ramesh took 2 kg rice for 120 rupees` | Udhaar ₹120 for Ramesh |
| `Amit ne 200 ka udhaar liya` | Udhaar ₹200 for Amit |
| `Ramesh paid 50` | Payment ₹50 from Ramesh |
| `Suresh gave 300 rs` | Payment ₹300 from Suresh |
| Unclear sentence | Friendly error asking to mention name and amount |

## API Overview

| Route | Purpose |
|---|---|
| `POST /api/transactions` | Parse + record an entry |
| `GET /api/customers` | List customers with balances |
| `GET /api/customers/[name]/transactions` | Customer history |
| `GET/POST /api/reminders` + `/run` | Generate / sweep reminders |
| `GET /api/reports` | Daily / range reports |
| `POST /api/transcribe` | Voice fallback transcription |
| `GET /api/health` | Health check |

## Live Demo on GitHub Pages

A fully static build is deployed to **https://aaron-samuvel.github.io/udhaar-khata/**
(serving from the `gh-pages` branch; redeploy with `GH_TOKEN=… bash scripts/deploy-pages.sh`).
GitHub Pages cannot host a
server, so the demo runs an identical in-browser ledger: entries, balances,
reminders, reports and settings work exactly the same, with data stored in
`localStorage` on your device (backup/restore is the transport between devices).
Recorded-voice transcription needs the full-stack server; browser speech
recognition works where supported.

```bash
bun run build:static   # STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 next build → .next-static/
```

## Legacy Version


The original AWS SAM serverless implementation (Lambda + API Gateway) remains available
in git history — see the `6f0aeea` commit or the `nextjs-rebuild` branch history.
