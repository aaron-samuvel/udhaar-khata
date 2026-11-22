# Manual QA checklist

Run this before tagging a release. It takes about 15 minutes.

## Core ledger flow
- [ ] Add customer -> add udhaar entry -> balance increases
- [ ] Add payment -> balance decreases correctly
- [ ] Mixed notes (`2 kg atta`) never leak into the money field
- [ ] Reversal of a wrong entry restores the prior balance exactly
- [ ] Balance survives a page reload (persistence check)

## Edge cases
- [ ] Large amounts (₹9,99,999) render and total correctly
- [ ] Paise-level amounts (₹0.50) round-trip exactly
- [ ] Empty state on fresh install shows guidance, not a crash
- [ ] Offline reload works (PWA shell)

## Deployment
- [ ] `/udhaar-khata/` basePath assets all resolve (no 404 in console)
- [ ] Backup export -> fresh device restore round-trips
