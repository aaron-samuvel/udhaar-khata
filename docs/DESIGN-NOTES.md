# Design notes

## Principles
1. **Counter-friendly** - large touch targets, readable at arm's length, usable with one hand.
2. **Numbers first** - balances are the hero; `en-IN` digit grouping (₹1,23,456) is non-negotiable.
3. **Calm palette** - warm neutral surfaces with restrained accents; no aggressive saturated schemes.
4. **Light and dark** - respect the system theme.

## Components
- shadcn/ui (New York style) is the only component source of truth; no bespoke UI kit.
- Lucide icons only; never mix icon sets.
- Cards: `p-4`/`p-6` padding, `gap-4`/`gap-6` rhythm; long lists scroll inside `max-h-96 overflow-y-auto`.

## Typography
- System font stack; tabular numerals for money columns.
