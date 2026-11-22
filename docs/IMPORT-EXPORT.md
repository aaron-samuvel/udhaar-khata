# Import & Export

## Export
Use **Backup / Restore -> Export** for a full JSON snapshot (customers + entries + settings).

## Import
- JSON restores are the supported path for moving data between devices.
- When importing third-party CSVs: sanitize first - no units in amount columns ("2 kg" must never land in the money column), amounts in rupees with two decimals max.

## Validation checklist
- [ ] Amounts parse as integers (paise) after conversion
- [ ] No negative udhaar rows (use reversals instead)
- [ ] Customer names de-duplicated before import
