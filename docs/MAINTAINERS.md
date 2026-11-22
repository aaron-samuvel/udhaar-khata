# Maintainer guide

Notes for whoever merges PRs and ships releases (currently @aaron-samuvel).

## Triage
- Label issues by area: `bug`, `enhancement`, `docs`, `data`, `security`.
- Data-loss reports are always `data` + high priority - respond quickly, ask for a backup file first.

## Merging
- Prefer merge commits (not squash) so author history stays intact for contributor recognition.
- Docs/community PRs can merge immediately; app-code PRs should pass lint first.

## Releases
- Follow [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
- Tag releases `vX.Y.Z`; Release Drafter assembles notes automatically.

## Housekeeping
- Review Stale workflow results monthly; close stale issues with a kind note.
- Delete merged feature branches.
