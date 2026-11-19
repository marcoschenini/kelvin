# Activity log

Newest first. One entry per request: date — request — who did what — verdict — outcome.

## 2026-11-19 — Background with depth on every page

- **Request (Marco):** the flat cold-chain scene on the home was too busy and badly placed; brainstormed a replacement: "a background that gives depth, more minimal, gradient style but with more dimension", fixed behind the page, the same on every page.
- **Chief (Marco's session):** removed `components/brand/cold-chain-backdrop.tsx` (PR #20) from the home; added `.kelvin-backdrop` (globals.css) mounted once in the shell layout: three static radial glows (cold blue top-right and left, darker floor), two blurred lights drifting over 48 s (still under reduced motion), fine SVG grain; colours from new `--backdrop-*` tokens per theme. AGENTS.md rule updated (the page background is the one gradient). Checked in the browser at 1280 px: home, Cases, Ask Kelvin in light and dark. Note: a stale `.data/kelvin.lock` (PID reused by a Windows process) blocked the local DB; removed by hand.

## 2026-11-17 — Ratel moves

- **Request (Marco):** make the ratel move with the animations from the earlier project.
- **Chief (Marco's session):** `components/mascot/ratel-stage.tsx`, a scaled-down port of life_os' RatelProvider: a navy stage under the case list on /ask (desktop) where Ratel walks, points at the conversation when the case changes ("Ask me about Case B"), thinks while Kelvin answers, celebrates when an answer arrives (or says the AI was busy / failed), strolls every 25–45 s, falls asleep (zzz) after 90 s idle, and gives a tip when clicked. Event-driven via a ref handle; still under reduced motion. Header avatars (page and case panel) celebrate briefly after an answer. Bubble uses the CSS enter animation (AnimatePresence "wait" stalls in background tabs). Checked in the browser (greeting, case change, think, answer, click tip, screenshot). Gate: lint ✓, typecheck ✓, 170/170 tests ✓, build ✓.

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

## 2026-11-19 — Classmate bug reports, unslop, UX critique

- **Request (Vito):** fix four bugs reported by classmates (excursion duration, upload owner, empty subject, eval double-submit); earlier the same day: unslop the UI copy (PR #13) and three UX fixes from a design critique (PR #14).
- **Chief:** verified each bug in the code first (all four real), then ran `backend` (duration display, upload owner, server subject guard), `frontend` (approval validation, eval click guard, honest banner) and `ai-engineer` (eval single-run lock, 409, stale cleanup) in parallel worktrees; merged into `feature/classmate-bugs`.
- **QA (`qa-reviewer`):** PASS WITH NOTES on all three branches and on their combined merge — lint, typecheck, 175 tests, build (fonts mocked), eval 27/27, demo A/B/C unchanged. Minor notes fixed by the Chief: chart band no longer disappears when an excursion reaches the end of the log; PDF chart band uses the shown end; double full stop in the narration; badges use the rules from Settings.
- **Open:** eval lock is per process (Supabase with several instances could still race; next step a partial unique index); Ask Kelvin still uses stored `daysLeft`; `demo/recordings/*.json` hold the old narration (regenerate before M7 Replay); CLAUDE.md and the brief still say 24 eval cases, the set has 27.
## 2026-11-19 — Top navigation and new type

- **Request (Vito):** fonts like lilly.com/at and a horizontal menu on top instead of the left sidebar; free font stand-ins and a user menu chosen by Vito.
- **Chief:** done in the main session (one area, frontend only); `qa-reviewer` PASS WITH NOTES. Fixed from QA: legal note always visible again (page footer, BRIEF requirement), approval evidence panel and `#demo` anchor no longer hidden under the 64 px header, stale font names in the verify skill.
- **Open:** real font rendering checked only on the Vercel preview (fonts mocked in the sandbox).

## 2026-11-19 — Accessibility fixes (WCAG 2.1 AA audit)

- **Request (Vito):** accessibility review, then fix everything. Audit: axe-core on a local production build (9 pages × light/dark + approval), keyboard tab order, 390 px mobile, 200% zoom.
- **Fixed:** upload file input no longer unlabelled or nested in the drop zone; custody chain scrollable by keyboard; visible focus ring on case-list rows; live-map filter counts readable (were 3.08:1); Settings `dl` lists valid; mobile menu button 44 px. Re-scan: no axe violations on any scanned page.
- **Not verified:** real screen readers (VoiceOver/NVDA); text alternatives of the temperature chart and the maps.

## 2026-11-19 — Welcome page with the cabin-window transition

- **Request (Vito):** a transition like the "AERIVE" airplane-window zoom from a reference video; Vito chose a new welcome page and AI-generated images.
- **Chief:** images generated with Higgsfield Z Image (free plan: GPT Image / Soul models need a paid plan), downloaded by Vito, converted to WebP (23–44 KB). Welcome page on `/`: scroll zooms through the left cabin window into the sunset sky, the clouds rise and dissolve into the page, then "Enter Kelvin" → `/live` (the map moved from `/`). Reduced motion: one still frame with the message and buttons. Checked with screenshots of a local production build at 1280×720 and 390×844. QA fixes: no hydration error under reduced motion (reduced variant only after hydration), final buttons inert until visible, visible "Skip intro" link, one h1, top-bar logo now goes to `/live`.

## 2026-11-19 — Glass panels over clouds

- **Request (Vito):** remove the boxy "Claude look" inside the tool and show clouds faintly behind the screens; chose glass panels and barely visible clouds.
- **Chief (main session, centralised change):** new `.surface` / `.surface-inset` classes and `--surface-*` / `--backdrop-clouds` tokens in `app/globals.css`; 19 files moved from bordered card boxes to glass panels; KPI grids lose the 1 px divider lines; clouds layer added to the shell backdrop (soft-light in dark mode). Check: axe on 9 pages × light/dark, no violations; 175 tests.

## 2026-11-19 — Live map redesign

- **Request (Vito):** a nicer world map; chose real continents with arcing routes.
- **Chief (main session, one component):** dotted land replaced by Natural Earth 1:110m land as one SVG path (`scripts/gen-map-land.ts` → `lib/geo/world-land.json`, same projection as the fleet), faint 30° graticule, every shipment's lane drawn as a faint great-circle arc (selected lane on top, others dimmed), hubs with IATA labels when zoomed. New `--map-coast` token. Checked with screenshots (world light/dark, Europe zoom); 175 tests. `lib/geo/world-dots.json` is no longer used by the live map. Then an interactive globe (`components/live/live-globe.tsx`, d3-geo orthographic): default view with a Globe / Map switch, drag or arrow keys to turn it, slow drift when idle, region buttons and selection turn it to face them; no page errors, checked with drag in headless Chrome.
