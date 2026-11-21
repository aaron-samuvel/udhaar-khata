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
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui, Lucide icons |
| Database | Prisma ORM + SQLite |
| Voice fallback | z-ai-web-dev-sdk ASR (server-side) |

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
(via the `deploy-pages.yml` GitHub Actions workflow). GitHub Pages cannot host a
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
