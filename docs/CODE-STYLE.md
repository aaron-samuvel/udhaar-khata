# Code style

- **TypeScript everywhere**, strict mode on. No `any` without a comment justifying it.
- **ESLint** (`eslint.config.mjs`) is the law - run lint before pushing.
- Components live under `src/components`; app routes under `src/app` (App Router).
- shadcn/ui components are the only UI kit; never hand-roll a button/card that exists there.
- Money: integer paise helpers only - no floats, no arithmetic on formatted strings.
- No emojis in code, logs, or commit messages.
- Prefer early returns; keep functions single-purpose; name things in domain terms (udhaar, jama, reversal).
