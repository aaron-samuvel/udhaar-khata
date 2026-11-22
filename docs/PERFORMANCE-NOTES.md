# Performance notes

Targets that keep the app snappy on cheap Android phones at a shop counter:

- **First load**: static export from GitHub Pages + CDN - usable on fast 3G.
- **Interactions**: entry add/list updates stay under ~100ms on mid-range phones; derive balances from the in-memory entries list, not re-read from storage per keystroke.
- **Storage writes**: batch localStorage writes; never write on every render.
- **Assets**: Lucide icons only; no large raster images.

When touching render-heavy screens (ledger list), test with CPU throttling (6x slowdown) in DevTools.
