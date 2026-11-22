# Git workflow

## Branches
- `main` is always deployable.
- Feature branches: `feat/<short-name>`, docs: `docs/<topic>`, fixes: `fix/<topic>`.

## Commits
Conventional commits keep history scannable:
- `feat: add customer search`
- `fix: parse '2 kg' note without touching money field`
- `docs: expand backup guide`

## Pull requests
- Small PRs merge faster - one topic per PR.
- Use the PR template checklist; the three ledger guardrails (integer paise, unit-safe parsing, reversals-not-deletions) must hold.
- Merges use merge commits so every contribution stays visible in history.
