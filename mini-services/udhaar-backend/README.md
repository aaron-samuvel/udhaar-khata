# Udhaar Khata Backend — Java Spring Boot (production)

The production backend for the kirana credit ledger. Java 21, Spring Boot
3.3, JWT auth, multi-shop isolation, H2 for dev / PostgreSQL for production,
Flyway migrations, Docker — built to handle heavy user load.

- **API base:** `http://localhost:8080`
- **Swagger UI:** http://localhost:8080/swagger-ui.html
- **Health:** `GET /api/health` → `{"ok":true,"service":"udhaar-khata","shop_id":"default"}`

## Why this backend

| Requirement | How it is met |
|---|---|
| Heavy user load | Stateless JWT (scale horizontally behind any LB), HikariCP pool, DB indexes on every hot query, optional pagination, gzip, connection-timeout guards |
| Multi-shop | Every row carries `user_id`; every repository query is user-scoped; `(user_id, name_key)` unique constraint |
| Money correctness | Integer paise end-to-end (`BIGINT`), Indian amount-in-words for receipts |
| Exact frontend compatibility | Same paths, bodies, status codes and error strings as the Next.js API routes — the existing UI runs unchanged (set `API_BACKEND_URL=http://localhost:8080` in the Next.js `.env`) |
| Auditability | Append-only audit trail for every financially significant action |
| Backup portability | Backup JSON (`udhaar-khata-backup` v2) restores into either backend unchanged; CSVs carry the same columns and BOM |

## Run (dev, zero config)

```bash
# needs Java 21 + Maven (or: docker compose up)
mvn spring-boot:run          # or: mvn -DskipTests package && java -jar target/udhaar-khata-backend.jar
```

First boot seeds the labeled demo shop (Amit/Ramesh/Sita) used for anonymous
requests (legacy mode).

## Run (production)

```bash
cp .env.example .env   # set UDHAAR_JWT_SECRET (32+ bytes) and a DB password
docker compose up -d --build
# scale out (stateless app):
docker compose up -d --scale app=4
```

Production profile: PostgreSQL 16 + Flyway (`application-postgres.yml`).
`UDHAAR_LEGACY_ANONYMOUS=false` (compose default) makes every `/api` call
require a Bearer token.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `UDHAAR_PORT` | `8080` | HTTP port |
| `UDHAAR_JWT_SECRET` | dev-only value | HS256 secret, **32+ bytes, required in prod** |
| `UDHAAR_JWT_TTL_DAYS` | `7` | Token lifetime |
| `UDHAAR_LEGACY_ANONYMOUS` | `true` | Anonymous requests → demo shop (frontend compatibility). `false` = strict multi-user |
| `UDHAAR_CORS_ORIGINS` | localhost:3000 + github.io | Allowed browser origins |
| `UDHAAR_DB_*` | — | Postgres host/port/name/user/password (profile `postgres`) |
| `SPRING_PROFILES_ACTIVE` | — | Set to `postgres` in production |

## API

Same contract as the Next.js backend. Auth extras:

```
POST /api/auth/signup  {email, password, shopName?} → {ok, token, user}
POST /api/auth/login   {email, password}            → {ok, token, user}
GET  /api/auth/me      (Bearer)                     → {ok, user}
```

Business endpoints (all accept `Authorization: Bearer <jwt>`; anonymous
requests map to the demo shop in legacy mode):

```
GET   /api/customers?q=&archived=1[&page=&size=]
GET   /api/customers/{nameKey}/transactions
PATCH /api/customers/{nameKey}          {phone?, notes?, creditLimitRupees?, archived?}
POST  /api/customers/{nameKey}/statement → 201 WhatsApp-ready statement
POST  /api/transactions                 (mode manual|parse, preview?, force?) → 201 | 409 duplicate
POST  /api/transactions/{id}/reverse    → 201 offsetting correction
GET   /api/reports?range=today|7d|30d|all|custom
GET   /api/reminders · POST /api/reminders (dues sweep) · POST /api/reminders/customer
GET   /api/audit?limit=
GET   /api/export/backup.json | transactions.csv | outstanding.csv
POST  /api/import {mode: merge|replace, backup}
POST  /api/demo/reset
GET   /api/health
```

Responses keep the frontend contract: `{ok:true,...}` or
`{ok:false,error:"..."}` with the same human messages (duplicates → **409**
with a `duplicate` payload, archived-customer guard, credit-limit advisory,
settle-only archiving, etc.).

## Hardening included

- BCrypt password hashing; login/signup rate-limited (10/min/IP)
- JSON 401/403 bodies (`Sign in required…`), never redirects
- CSRF off (stateless tokens), CORS allow-list, security headers via defaults
- Flyway-only schema (`ddl-auto: none`) — migrations are reviewable SQL
- Non-root Docker user, healthcheck, graceful pool sizing
- Brute-force guard note: the in-memory rate limiter is per-node; for many
  replicas swap in a shared store (Redis) — see roadmap in root README
