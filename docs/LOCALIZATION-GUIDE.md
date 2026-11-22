# Localization guide

The app targets Indian shopkeepers; docs translations are welcome.

## Adding a language
1. Pick the ISO code (e.g. `mr` for Marathi).
2. Translate `README.md` -> `README.<code>.md`, `docs/FAQ.md` -> `docs/FAQ.<code>.md`, and optionally `docs/BACKUP-RESTORE.md`.
3. Link the new README from the main README's language list.
4. Keep brand/domain words as-is: **Udhaar**, **Khata**, **jama** - translate the sentence around them, not the domain words themselves.
5. Never translate the money rules - paise integers and reversal semantics must stay exact.

## Style
- Warm, simple, spoken register - write like you talk at the counter.
- Keep amounts in the ₹/paise format shown by the app (en-IN grouping).
