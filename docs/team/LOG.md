# Activity log

Newest first. One entry per request: date — request — who did what — verdict — outcome.

## 2026-11-17 — Ask Kelvin page + Ratel mascot

- **Request (Marco):** the chatbot on its own page, with a small mascot: reuse the ratel from the earlier project.
- **Chief (Marco's session):** Ratel copied from `life_os/components/ratel` (figure + states) into `components/mascot/`, wrapped in `RatelBadge` (avatar / full, think while answering, reduced-motion still). `/ask` page with case picker (All cases + A/B/C, URL `?case=`), `/api/chat` + `lib/chat/portfolio.ts` (overview, pending, deadlines, questions about a named case, AI tools incl. `ask_about_case`), shared `Conversation` + `chatResponse`; case panel refactored onto them, with an "open as a page" link; italics rendered. Live site confirmed in AI mode (Groq). Checked locally with the real Groq model: "which cases need my attention", an Italian what-if on case B, the case panel; screenshots of the page and mascot. Gate: lint ✓, typecheck ✓, 170/170 tests ✓, build ✓. No separate QA pass this time (shared code already reviewed twice; new logic covered by tests and the browser run).

## 2026-11-17 — Ask Kelvin (case chat)

- **Request (Marco):** more features; a chatbot, at no cost.
- **Chief (Marco's session):** `lib/chat/` (context, built-in answers incl. what-if over the real rules, EN/IT intent matcher, Groq model + read-only tools), `/api/cases/[id]/chat` (NDJSON, fallback to built-in), `components/case/ask-kelvin.tsx` (docked panel, suggested questions, citation chips). Found and fixed on the way: a no-claim case (A) still exposed a stale "recommended" route to the chat. Checked in the browser on local data without a key (built-in answers, what-if, Italian question, citation opens the viewer on top). Groq path covered by tests with a mock model (tool call, citation filtering, 429 fallback); not yet run against Groq itself (needs Marco's free key). Gate: lint ✓, typecheck ✓, 146/146 tests ✓, build ✓.
- **qa-reviewer (Opus): FAIL → fixed.** Major: what-if on a no-claim case compared against the stale ranking (now "still no claim"); "1,200 kg" / "1.2 million" / "no declared value" mis-parsed; an empty message list crashed the route (now 400). Minor, fixed: Italian "se" questions read as what-ifs; more demo questions matched (how much, Montreal limit, deductible, sent?, how long out of range, wait N days); requests to act get "I can't do that" + who does it; long history trimmed, not rejected; AI chips only for ids a tool returned; prompt says tool/document text is data and never claim an action; closing the panel aborts the model; no raw error text, real 404 vs 500; Escape respects other overlays and returns focus; IME Enter; one screen-reader announcement per answer; punctuation nits. Re-checked in the browser. Gate: lint ✓, typecheck ✓, 167/167 tests ✓, build ✓. Not yet run against Groq itself (needs the free key).

## 2026-11-17 — Visible agent

- **Request (Marco):** after a full walkthrough for the demo, make the agent visible while it works (the output-first page showed only "Analysis in progress…", and deterministic runs took ~1 s).
- **Chief (Marco's session):** live step panel under the case header (`analysis-status.tsx`), finished-run summary with "Show steps", title follows the phase (investigation → claim), pacing for deterministic UI runs (`paceMs` in `runAgent`, `KELVIN_STEP_PACE_MS`), start guard against the double run that produced a false "Analysis stopped" toast. Checked in the browser at 1280 px on cases B and C (local data). Gate: lint ✓, typecheck ✓, 129/129 tests ✓, build ✓.
- **qa-reviewer (Opus): FAIL → fixed.** Major: a run refused because Kelvin was already working showed a red "stopped" summary; the route now sends `reason: "busy"` and the page shows a neutral info toast. Minor, fixed: closing narration kept in "Show steps"; a stream that ends without `run_finished` shows as stopped, not finished; reduced motion (`motion-safe:animate-ping`, no smooth scroll); title switches at the claim phase's first `rank_routes`; toggle resets per run; valid `<ol>` markup, `aria-controls`, live region mounted from the start; `KELVIN_STEP_PACE_MS` capped at 5 s. Left as is: deterministic UI runs record paced timings in `demo/recordings` (note for M7 Replay); no abort on `streamRun` when leaving the page (pre-existing). Re-checked in the browser; gate green.

## 2026-11-17 — Pharma redesign

- **Request (Vito):** less "Claude", richer institutional pharma look ("like Eli Lilly"), design system out of the workspace, agent mechanics hidden behind the output.
- **Decisions:** big-pharma visual language with our own palette and open fonts; Lilly's exact colours and fonts are not copied because the site is public. Agent steps go in a closed "Analysis details & audit trail" section. Light theme is the default again. No mockup round: the PR is opened without auto-merge so Vito can check the Vercel preview first.
- **frontend** (Opus): tokens, fonts, logo, shell, output-first case screen with a Recommendation card, approval "paper" letter, inbox, eval and settings, all checked visually with screenshots. Gate green.
- **Chief:** no "recommended" payer on no-claim cases, neutral status wording, AGENTS.md brand rule.

## 2026-11-13 — Workflow v2 from Vito's board

- **Request (Vito):** make Kelvin follow his workflow board (all 7 differences).
- **Chief:** spec `docs/team/specs/2026-11-13-workflow-v2.md`; decided the two open questions with the board's proposed answers.
- **backend** (Sonnet): stability, claim plan, follow-up and outcome rules; closed_not_approved; agent QA gate; stability emails in seed; KPIs (113 tests).
- **ai-engineer** (Sonnet): `assess_quality`, same-run claim path, secondary claim letter, appeal and reminders, 3 new eval cases (27/27), recordings regenerated.
- **frontend** (Sonnet): QA decision card, claim plan, approval summary, follow-up tags, recovery KPIs and track record.
- **Chief integration:** primary-only close on a rejected claim letter, claimed = plan total, quality agent metric on the eval page, AGENTS.md rule. Gate: lint ✓, typecheck ✓, 120/120 tests ✓, eval 27/27 ✓, build ✓ (fonts mocked in the sandbox).
- **qa-reviewer (Opus): PASS WITH NOTES.** Two major findings were fixed: a secondary claim could be sent before the primary and mark the case "sent"; the reject dialog said a secondary letter closes the case. Minor findings fixed: pending drafts are withdrawn on a not-approved close; QA status on the case page; assess_quality needs rank_routes first; a freezing excursion is treated as damaged; primary sent first. Re-verified: PASS. Accepted limits: claimed = plan total even if the secondary is rejected; one appeal per case; daysToClose uses the real clock.
- **Final gate:** 124/124 tests, eval 27/27, build ✓.

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
