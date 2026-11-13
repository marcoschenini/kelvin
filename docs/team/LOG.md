# Activity log

Newest first. One entry per request: date — request — who did what — verdict — outcome.

## 2026-11-13 — Workflow v2 from Vito's board

- **Request (Vito):** make Kelvin follow his workflow board (all 7 differences).
- **Chief:** spec `docs/team/specs/2026-11-13-workflow-v2.md`; decided the two open questions with the board's proposed answers.
- **backend** (Sonnet): stability, claim plan, follow-up and outcome rules; closed_not_approved; agent QA gate; stability emails in seed; KPIs (113 tests).
- **ai-engineer** (Sonnet): `assess_quality`, same-run claim path, secondary claim letter, appeal and reminders, 3 new eval cases (27/27), recordings regenerated.
- **frontend** (Sonnet): QA decision card, claim plan, approval summary, follow-up tags, recovery KPIs and track record.
- **Chief integration:** primary-only close on a rejected claim letter, claimed = plan total, quality agent metric on the eval page, AGENTS.md rule. Gate: lint ✓, typecheck ✓, 120/120 tests ✓, eval 27/27 ✓, build ✓ (fonts mocked in the sandbox).

## 2026-11-13 — Automatic merge on green checks

- **Request (Vito):** make the approval/merge step automatic. Marco enabled auto-merge and a `master` ruleset requiring the `verify` check.
- **Chief:** added `.github/workflows/verify.yml` (job `verify`), updated PLAYBOOK step 5 and DECISIONS. Until this PR is on `master` the required check does not exist, so every PR (including M8) is blocked; this PR unblocks them.

## 2026-11-13 — PR for the agent team (Marco's go-ahead)

- **Request (Marco, via Vito):** put the agents in `.claude/agents/` on `feature/claude-agents`, open a PR to `master`; keep CLAUDE.md and its "Working together" section (team section only appended). Next: M7 Replay mode on `feature/replay-mode`. Marco owns M8 (`lib/db/*`, migrations): ask before touching them.
- **Chief:** branch renamed to `feature/claude-agents`; gate green (lint ✓, typecheck ✓, 66/66 tests ✓, build ✓ with Google Fonts mocked because the cloud sandbox blocks them; `kelvin-verify` now ships the font mock for cloud sessions).

## 2026-11-13 — Team setup and first analysis run

- **Request (Vito):** set up the agent team (Chief + 5 subagents) and test it with a small analysis of the project.
- **Chief:** read CLAUDE.md, AGENTS.md, README, BRIEF and the code layout; created `.claude/agents/*` (5 agents), `.claude/skills/kelvin-verify`, `docs/team/` (playbook, decisions, log, specs); excluded `.claude/worktrees/` from git, tsc, ESLint and Vitest; added the "Agent team" section to CLAUDE.md.
- **Trial analysis (all five roles, in parallel, read-only):**
  - `product-architect` (Opus): status vs BRIEF §9 and prioritised backlog → `docs/team/specs/2026-11-13-status-and-backlog.md`. 5 of 7 criteria met (1 only in deterministic mode); Replay not met; Lighthouse never run.
  - `ai-engineer` (Sonnet): the 7 recordings match the event format and the client can replay them unchanged; gaps: all deterministic, no `demo-c-follow_up`, random draft/message ids and absolute `dueAt`/`daysLeft` go stale after a reset.
  - `frontend` (Sonnet): J/K navigation missing; `A` approve works but has no visible hint; colours and Base UI usage clean; a few empty states to check.
  - `backend` (Sonnet): M8 is size M; migrations are plain Postgres; storage is filesystem-only; the in-memory per-case lock in `lib/case/record.ts` must become a DB lock on serverless.
  - `qa-reviewer` (Opus): **PASS WITH NOTES** — lint ✓, typecheck ✓ (after `next typegen`), tests 66/66 ✓, eval 24/24 ✓, build not verifiable here (Google Fonts blocked by the sandbox). Findings: M1 gate order (fixed: `kelvin-verify` now runs `npx next typegen` first); m1 `lib/queries/cases.ts:44` hard-codes the at-risk threshold instead of `rules.atRiskDays`; m2 `components/kit/deadline-pill.tsx:10-11` uses red for deadlines that are near but not overdue (conflicts with AGENTS.md) — both added to the backlog, not changed.
- **Environment notes (cloud session only):** worktree isolation is denied by this session's policy, so agents ran in the main checkout; `qa-reviewer` and `ai-engineer` were created after the session's agent list loaded, so they ran from their definition files via a general agent. First push refused (Claude GitHub App not yet installed on `marcoschenini/kelvin`).
- **Outcome:** team configured and tested; next step is backlog item 1 (Replay engine).
