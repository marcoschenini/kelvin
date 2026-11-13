# Decisions

Lasting choices about how Kelvin is built. Newest first. Format: date — decision — reason.

## 2026-11-13 — Workflow v2 (Vito's board)

- **The quality agent decides clear cases** through `lib/rules/stability.ts`: within the allowance → usable, closed with no claim; beyond it, or no stability data → damaged; within ±10% of a limit → unsure, human QA, never auto-closed. This replaces "the agent never decides disposition" (AGENTS.md updated). — Vito's board; the decision is rule-based, cited and audited.
- **A manager rejecting the primary claim letter closes the case** (`closed_not_approved`). Rejecting a secondary letter or a notice only rejects that draft.
- **Claim plan: the party at fault comes after the insurer, for the uninsured part.** B: insurer €190,000 + airline €3,771 (towards the deductible). Demo numbers stay as before.
- **Extra costs** (disposal, re-shipment) count in the loss, capped per route. Demo cases have none; eval-26 covers them.
- **Protective notice: the threshold stays at 5 days left** (stricter than "day 10 of 14"), now also when data is missing. — Keeps C's day-2 notice.
- **One appeal, then the manager decides; reminders at 14 and 30 days of silence**, both as drafts that need approval.

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
