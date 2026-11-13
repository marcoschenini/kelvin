---
name: kelvin-verify
description: Run Kelvin's quality gate (lint, typecheck, unit tests, production build, demo outcomes, deterministic eval) in a checkout or worktree and report a compact pass/fail table. Use before integrating or pushing any change, and whenever QA verifies a branch.
---

# Kelvin quality gate

Run from the root of the checkout being verified (main checkout or a worktree under `.claude/worktrees/<name>`). In a worktree, `node_modules` resolves from the main checkout; only run `npm ci` if a command fails with a missing-module error.

## Steps (stop the dev server first: PGlite is single-process)

```bash
npm run lint          # ESLint
npx next typegen      # generates .next/types (PageProps, RouteContext, LayoutProps); without it typecheck fails on a fresh checkout or worktree
npm run typecheck     # tsc --noEmit
npm test              # Vitest: rules, status machine, demo outcomes A/B/C, eval 24/24, DB safety
npm run build         # next build --webpack (keep the flag)
```

Behavioural checks (deterministic, no API key needed; they use the local `.data/` DB):

```bash
npm run eval -- --deterministic          # must print 24/24
npm run agent -- B --deterministic --qa rejected --approve   # optional end-to-end case run
```

`npm test` already asserts the expected demo outcomes (A no claim, B insurer €190,000, C forwarder €350,000) and eval 24/24, so the extra commands are needed only when the change touches the agent, rules, seed or DB.

## Interpreting failures
- `Cannot open database … lock`: a dev server or another script holds `.data/`. Stop it and retry; do not delete the lock while a process is alive.
- `TS2304: Cannot find name 'PageProps' / 'RouteContext' / 'LayoutProps'`: `.next/types` is missing; run `npx next typegen` and retry.
- `next/font` cannot fetch Inter / JetBrains Mono: the machine has no access to Google Fonts (sandboxed cloud session or offline). Re-run the build with the bundled mock so everything except the font download is still verified:
  `NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/.claude/skills/kelvin-verify/font-mocks.cjs" npm run build`
  Say in the report that fonts were mocked; the real font download is verified by the Vercel preview build.
- Build errors about native SWC/Turbopack: the `--webpack` flag was removed; restore it.
- Typecheck or lint errors in `.claude/worktrees/**`: the exclusions in `tsconfig.json` / `eslint.config.mjs` were removed; restore them.
- A changed eval or demo number is a regression unless the spec explicitly changes the expected outcome.

## Report

```
Gate @ <branch> (<path>)
lint ✓/✗ · typecheck ✓/✗ · test ✓/✗ (n passed / m failed) · build ✓/✗/skipped · eval x/24
Failures: <first relevant error lines per failing step>
```
