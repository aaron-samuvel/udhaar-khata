# Troubleshooting

**Balance looks wrong after an edit**
Corrections use reversal entries. Check for a reversal pair in the entry list before assuming corruption.

**App shows stale data on another device**
Data is per-browser. There is no cloud sync - use backup export/import to move data ([BACKUP-RESTORE.md](BACKUP-RESTORE.md)).

**Site loads blank on GitHub Pages**
1. Hard refresh (Ctrl+Shift+R) to bust cached assets.
2. Check you are on https://aaron-samuvel.github.io/udhaar-khata/ (the basePath matters).
3. Check the Actions tab for the latest deploy run.

**PWA won't install**
Install requires HTTPS and a manifest. Private/incognito windows and in-app browsers (chat webviews) often block installs - open in Chrome/Safari directly.

**I cleared my browser data**
Entries are gone unless you have a backup file. Restore it via Backup / Restore.
