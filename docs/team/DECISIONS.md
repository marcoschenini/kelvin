# Decisions

Lasting choices about how Kelvin is built. Newest first. Format: date — decision — reason.

## 2026-11-17 — Ask Kelvin page and Ratel

- **A dedicated page, `/ask`, with "All cases" and one-case modes.** Across cases the chat answers what needs attention, what is at stake and upcoming deadlines, and delegates questions about a named case to that case's answers. Per-case source ids are stripped there (they are per case); the case's own chat keeps the chips. — Marco asked for the chatbot on its own page.
- **Ratel, the honey badger from our earlier project, is the chat's mascot**, reused as is (no new artwork): cream engraving on a navy badge (`--mascot`), so it reads in both themes. The only exception to "no bot icons", and only in the chat.
- **One conversation component and one streaming helper** (`components/chat/conversation.tsx`, `lib/chat/stream.ts`) shared by the case panel and the page, so fixes land once.

## 2026-11-17 — Ask Kelvin: a free case chat

- **Built-in answers first, a free model second.** Marco does not want to pay for an API. The chat answers from the case record and the rules engine (no AI) and, when `GROQ_API_KEY` is set, from Groq's free tier (`openai/gpt-oss-120b`) with read-only tools over those same answers. On any model failure before the first word, it falls back to the built-in answer and says why. — Zero cost, never breaks in the demo, and still shows a real LLM using tools when the key is there.
- **Read-only by design.** The chat cannot approve, send or change the case: the two human gates stay in the UI. Its numbers come only from `lib/rules`.
- **Docked, non-modal panel** (not a Sheet), so the source viewer (a modal Sheet) opens on top of it from a citation chip.

## 2026-11-17 — The agent is visible while it works

- **While a run is going, its steps stream live under the case header** (tool, what Kelvin found, cited sources, narration), with a step count, a timer and the mode. When it ends, one line stays ("Investigation and claim finished · 17 steps in 13 s"), with "Show steps". The history stays in "Analysis details & audit trail". — The brief's core flow is "watch the agent work", and the course is about agents: the output-first page hid the agent entirely (Marco's call, 17 Nov).
- **Deterministic runs from the UI are paced: 600 ms before each tool call** (`KELVIN_STEP_PACE_MS`, 0 = off). The real tool durations are still the ones shown. — Unpaced, the planner finishes in about 1 s and nothing can be followed; tests and the eval call `runAgent` directly and stay unpaced.
- **A run cannot be started twice from one page** (synchronous guard in `AgentRunProvider`); a run refused because Kelvin is already working on the case is an info toast, not "Analysis stopped".

## 2026-11-17 — Visual identity

- **Kelvin red `#B3122E` as the single accent, navy `#0E1B33` ink, Source Serif 4 + Inter, light by default.** — The look of a big pharma company without copying a real company's brand on a public site.
- **Output first: analysis steps and the audit trail sit in a closed "Analysis details & audit trail" section.** — Vito wants the output, not the mechanics. The course demo can still open it.
- **The design system lives under Settings → Appearance**, not in the sidebar.

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
- **Excursion duration = readings × interval; shown end = last reading + interval (2026-11-19, Vito).** — Each 5-min reading covers one interval, so the duration was right and the displayed end was 5 min short. Stored `end` stays the last reading so custody attribution and outcomes do not change.
- **Chief says per request whether the agent team is worth it (2026-11-19, Vito).** — Small copy or UI changes run in the main session; multi-area or rules/eval work uses the team and always QA.
- **Top navigation and Lilly-style type (2026-11-19, Vito).** — Reference lilly.com/at: horizontal sticky top bar instead of the left sidebar; persona and theme in a user menu on the right; the "not legal advice" note moves to an always-visible page footer. Fonts: EB Garamond (headings) + Public Sans (UI) as free stand-ins for Lilly's licensed ITC Garamond Narrow + Ringside. Supersedes Source Serif 4 + Inter.
