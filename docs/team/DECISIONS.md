# Decisions

Lasting choices about how Kelvin is built. Newest first. Format: date — decision — reason.

## 2026-11-13 — Automatic merge

- **PRs merge automatically when the `verify` check is green; no approval required.** Vito and Marco agreed; Marco enabled "Allow auto-merge" and a `master` ruleset (no deletion, no force push, required status check `verify`). — Removes the manual approval step while keeping a gate: nothing with failing lint, typecheck, tests or build reaches `master` and the live site.
- **`verify` runs in GitHub Actions** (`.github/workflows/verify.yml`): `npm ci`, lint, `next typegen` + typecheck, tests, build, on every PR and on `master`. — Same gate as the `kelvin-verify` skill, on a machine with network access (real Google Fonts).

## 2026-11-13 — Agent team setup

- **Chief of staff = main session on Opus; five subagents in `.claude/agents/`.** Product & Architect and QA on Opus (judgement-heavy); Frontend, Backend, AI Engineer on Sonnet (implementation). The Chief can run AI Engineer on Opus per task. — Matches the requested roles and keeps cost proportional to difficulty.
- **Code-writing agents use `isolation: worktree`.** — Lets frontend, backend and AI work in parallel without overwriting each other; each produces a branch the Chief merges after QA.
- **Ownership map by folder** (in `product-architect.md`); shared files only through the Chief. — Avoids merge conflicts between parallel agents and between the two human developers.
- **`.claude/worktrees/` excluded from git, tsc, ESLint and Vitest.** — Otherwise the root gate would lint/typecheck/test the parallel copies twice and fail on work in progress.
- **QA is read-only (`disallowedTools: Write, Edit`) and preloads `kelvin-verify`.** — Independent verification: the reviewer never fixes what it reviews.
- **Records live in the repo (`docs/team/`)**, so both developers and both Claude Code setups share the same log, decisions and specs.
- **No project-level model override in `.claude/settings.json`.** — The repo is shared with a second developer; each picks the Chief model with `/model opus` (stored in their own user settings).
