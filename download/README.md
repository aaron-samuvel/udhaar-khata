# Udhaar Khata — get the latest code into your GitHub repo

The sandbox where this app was built has **no GitHub credentials**, so the
`git push` to `https://github.com/aaron-samuvel/udhaar-khata` cannot run from
inside it. Everything is packaged here instead, in two formats:

| File | What it is |
|---|---|
| `udhaar-khata-full.bundle` | A single-file git bundle containing the complete local history (5 commits, ends at `930d229` "feat: UPI collect links, one-tap settle-up, amount-in-words, daily dues sweep, popup/copy fallbacks"). Verified by test-clone. |
| `patches/0001…0005.patch` | The same 5 commits as plain `git format-patch` files, if you prefer applying them onto an existing checkout. |

---

## Option A (recommended): push the bundle — 4 commands

On any machine with your GitHub login (or a personal access token with `repo`
scope):

```bash
# 1. download the bundle file, then clone it (full history included)
git clone udhaar-khata-full.bundle udhaar-khata
cd udhaar-khata

# 2. point it at your real repo
git remote set-url origin https://github.com/aaron-samuvel/udhaar-khata.git

# 3. replace main with the rebuilt Next.js app
#    (your original AWS SAM version stays recoverable — tag it first)
git branch aws-sam-original origin/main 2>/dev/null || true
git push origin main:refs/heads/aws-sam-backup   # optional safety copy
git push --force-with-lease origin main
```

Result: `main` = the Next.js 16 rebuild; the original serverless code remains
on the `aws-sam-backup` branch (skip that line if you do not want it).

## Option B: keep both histories (merge, no force-push)

```bash
git clone https://github.com/aaron-samuvel/udhaar-khata.git
cd udhaar-khata
git fetch /path/to/udhaar-khata-full.bundle main:nextjs-build
git merge nextjs-build --allow-unrelated-histories
# resolve any README.md / .gitignore overlap, then:
git push
```

## Option C: apply patches onto your existing checkout

```bash
git clone https://github.com/aaron-samuvel/udhaar-khata.git
cd udhaar-khata
git am /path/to/patches/*.patch
git push
```

## After pushing — run the app

```bash
bun install        # or: npm install
bun run db:push    # creates/updates db/custom.db from prisma/schema.prisma
bun run dev
```

Commit list contained in the bundle:

1. `380a043` Initial commit (project scaffold)
2. `be8d801` / `fecc2d1` — Next.js rebuild of Udhaar Khata (parser, ledger, reminders)
3. `baa56d1` — parser QA fixes, backup/restore, audit log, WhatsApp statements, offline drafts, PWA
4. `930d229` — UPI collect links, one-tap settle-up, amount-in-words, daily dues sweep, popup/copy fallbacks
