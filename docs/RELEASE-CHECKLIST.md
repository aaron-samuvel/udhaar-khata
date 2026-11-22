# Release checklist

1. **QA** - run [MANUAL-QA-CHECKLIST.md](MANUAL-QA-CHECKLIST.md).
2. **Version** - bump the version in `package.json` (data-handling fixes = patch, features = minor).
3. **Changelog** - update [CHANGELOG.md](CHANGELOG.md).
4. **Static build sanity** - `STATIC_EXPORT=1 npm run build` locally; check the export dir has no absolute asset paths breaking `/udhaar-khata/`.
5. **Push to `main`** - the Pages deployment picks it up.
6. **Verify live** - open https://aaron-samuvel.github.io/udhaar-khata/ , hard refresh, run the core ledger flow once.
7. **Tag** - `git tag vX.Y.Z && git push origin vX.Y.Z` (Release Drafter assembles notes).
