# Status analysis and backlog (M7 Replay + demo script + polish, M8 Supabase)

Date: 2026-11-13 · Author: product-architect · Branch inspected: `feature/agent-team` (a5644c9)
Baseline: `npm test` 10 files / 66 tests green (lint, typecheck, build not re-run for this analysis).

## 1. BRIEF §9 acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | A/B/C from the UI give the §5 outcome; every letter claim cited | **Met (deterministic), partly (live)** | `tests/agent.test.ts` "prepares a fully cited claim", "closes with the reason logged"; the live-model path has no automated test. |
| 2 | Never sends without approval, enforced in code | **Met** | `send_via_outbox` guard + DB CHECK; `tests/db-safety.test.ts` "rejects an outgoing message without an approval decision", `tests/agent.test.ts` "refuses to send anything without approval". |
| 3 | Deadlines correct; early notice in B and C | **Met** | `tests/rules.test.ts` "deadlines" + "protective notices" (B carrier 4 days, C forwarder day 2, A none). |
| 4 | Eval page runs 20+ cases with metrics | **Met** | `tests/eval.test.ts`, `app/(shell)/eval/page.tsx`, `app/api/eval/route.ts`. Live mode capped at 4 cases per request (`route.ts:23`). |
| 5 | Replay reproduces a full run offline | **Not met** | `RunMode` includes `"replay"` (`lib/agent/events.ts:7`) but nothing reads `AGENT_MODE` (only `.env.example:20`); `RunOptions.mode` excludes replay (`orchestrator.ts:29`); the run route accepts only live/deterministic. |
| 6 | Lighthouse a11y ≥ 90; usable at 1280 px; projector | **Partly / unverified** | aria labels present (e.g. `components/shell/theme.tsx:37`), but no Lighthouse report or check in the repo. |
| 7 | Typed, linted, unit tests for caps/deadlines/ranking | **Met** | `tests/rules.test.ts` (Montreal limit, deadlines, ranking), TS strict, ESLint config. |

M7 brief extras: dark mode exists (`theme.tsx`); `J/K` case navigation is missing (only `components/approval/approval-screen.tsx:128` has key handling); README has no 5-minute demo script.

## 2. Replay mode

**Already there.** `Recording` type with per-event ms offsets (`lib/agent/events.ts`); `createRecorder` saves every run to `.data/recordings` and demo runs to `demo/recordings/<case>-<kind>.json` (live replaces, deterministic only fills gaps) (`lib/agent/recorder.ts`); 7 committed recordings; client NDJSON reader `streamRun` and `AgentRunProvider` folding events into steps (`components/agent/run-stream.ts`, `agent-run-context.tsx`); `agent_runs.mode` already allows `"replay"` (`lib/db/schema.ts:123`).

**Missing.**
- No player and no mode switch (above).
- **All 7 recordings are deterministic** (`model: null`, 60 ms to 2.9 s long). Replaying them looks the same as the deterministic planner, so they add nothing yet. No `demo-c-follow_up.json`.
- Replay has to produce **DB state** as well as stream events. The case screen (routes card, letters, status, gates) and the run history (`lib/queries/cases.ts:73-75` reads `agent_steps`) come from the DB. If replay only animated events, the screen would be empty or would flip back to deterministic steps after `router.refresh()`.
- The panel labels every non-live run "deterministic planner" (`components/agent/agent-panel.tsx:134`).
- On Vercel, `demo/recordings` is read via `process.cwd()`. It may not be in the function bundle, and writes there fail silently (`.catch(() => null)`).

**Smallest design: real state, recorded stream.**
1. `lib/agent/mode.ts` (new): `type AgentModeSetting = "auto" | "live" | "deterministic" | "replay"`, `loadAgentModeSetting(db)`, `saveAgentModeSetting(db, v)` (key `agent_mode` in the existing key/value `settings` table, no migration), `resolveRunMode(db, requested?): Promise<RunMode>`. Precedence: request body > setting (if not `auto`) > env `AGENT_MODE` > live when a key exists, else deterministic. Live without a key falls back to deterministic.
2. `lib/agent/replay.ts` (new): `loadDemoRecording(caseId, kind): Promise<Recording | null>`, `listDemoRecordings()`, and `pace(events, { minGapMs: 120, maxGapMs: 2500 })`.
3. `orchestrator.ts`, `mode === "replay"`: run `runScript` against the DB, which writes the real, rules-correct state, the audit events and the real status moves. Run it with `ctx.persistSteps = false` and its events captured, not streamed. At the same time, stream the recording's events with their original pacing, skipping the recorded `run_started`, `status` and `run_finished`. Insert `agent_steps` from the recorded `step_finished` and narration so history matches what was shown. Then emit the real `status` events and `run_finished`. The run row gets `mode: "replay"` and `model` from the recording. Never save a recording in replay mode. If there is no recording, or the kind is `follow_up` (its content depends on which reply arrived), stream the deterministic events paced at 400 ms or more per step.
4. `AgentEvent.run_started` gains `replayOf?: { model: string | null; recordedAt: string }`. The panel shows "Replay · recorded with {model} on {date}".
5. Run route body: `mode: z.enum(["live","deterministic","replay"]).optional()`. Otherwise resolve with `resolveRunMode`.

**Task split** (all three can run in parallel; the contract is items 1, 2 and 4 above):
- **ai-engineer:** `lib/agent/mode.ts`, `lib/agent/replay.ts`, `lib/agent/orchestrator.ts`, `lib/agent/tool.ts` (`persistSteps`), `lib/agent/events.ts`, `app/api/cases/[id]/run/route.ts`, `scripts/agent.ts` (`--mode replay`), live re-recording of `demo/recordings/*.json`, `tests/replay.test.ts`.
- **backend:** `saveAgentModeAction` in `lib/actions/settings.ts` (calls `saveAgentModeSetting`). `next.config.ts`: make sure `demo/recordings/**` is traced into the run route on Vercel (check `node_modules/next/dist/docs/` for the Next 16 `outputFileTracingIncludes` form).
- **frontend:** "Agent mode" segmented control (Auto/Live/Deterministic/Replay) on `app/(shell)/settings/page.tsx`, with key status and recordings count, inside `<Suspense>`; "Replay" label/badge in `components/agent/agent-panel.tsx`.
- **shared:** none needed. `.env.example` already documents `AGENT_MODE`.

## 3. Top 5 live-demo risks

1. **Vercel splits state across instances.** PGlite lives in `/tmp` per instance (`lib/db/client.ts:22`). A run on one instance and a refresh on another show different cases, and a cold start resets mid-talk. *Mitigation:* present from the laptop with `npm run start:demo` (port 3200). Use Vercel only as a fallback until M8.
2. **Live model is slow or unreachable** (~1 min per case per `app/api/eval/route.ts:22`; venue Wi-Fi). *Mitigation:* Replay toggle (item 1). Auto-fallback to replay when the provider fails before the first tool call (item 4). Rehearse in Replay and show Live only if the network is good.
3. **Stale seed dates.** Deadlines are relative to seeding. If you don't reset on the day, B's "4 days left" drifts and the protective notice or route can change. *Mitigation:* reset just before the talk. Settings pre-flight shows seed age and warns after 12 h (item 6).
4. **Narration contradicts the screen.** If seed or rules change after recording, the recorded text no longer matches the state. *Mitigation:* `tests/replay.test.ts` checks that each recording's final status and recommended route match the deterministic outcome. Re-record after any seed or rules change.
5. **Projector legibility and accessibility are untested.** *Mitigation:* Lighthouse on `/`, `/cases/[id]`, approval, `/eval`; contrast fixes; rehearsal at 1280×720 (item 8).

## 4. Prioritised backlog

| # | Item | Owner | Size | Acceptance criterion |
|---|---|---|---|---|
| 1 | Replay engine (§2 design) | ai-engineer | M | Network off, mode Replay: Load demo B → investigate streams the recorded steps at recorded pace. Case ends `awaiting_qa`, routes card shows insurer €190,000, history shows the same steps after refresh. `tests/replay.test.ts` green. |
| 2 | Live recordings for A (investigate, close), B (investigate, prepare_claim, follow_up), C (investigate, prepare_claim, follow_up) | ai-engineer | S | 8 files with `mode: "live"` and `model` set. Test asserts A closed no claim, B insurer €190,000, C forwarder €350,000. |
| 3 | Agent-mode setting, Settings control, panel label | backend S + frontend S | S | Switching to Replay in Settings takes effect on the next run without a restart. Panel reads "Replay · recorded with …". |
| 4 | Auto-fallback on provider error before the first tool | ai-engineer | S | A test with a throwing provider ends with the correct state, mode `replay` and a narration line "Model unreachable, replaying the recorded run". |
| 5 | 5-minute demo script + pre-flight checklist in README | product-architect drafts in `docs/team/`, Chief edits README (shared) | S | Timed script (Inbox → B → QA → approve → sent/reply → C → eval) rehearsed in under 5:00. |
| 6 | Pre-flight panel: seed age, mode, key status, recordings found | backend S + frontend S | S | Settings shows all four. Warns after 12 h since seed. |
| 7 | Vercel tracing of `demo/recordings` | backend | S | Replay works on a Vercel preview deploy. |
| 8 | Lighthouse ≥ 90 + projector pass | frontend | M | Scores for 4 pages logged in `docs/team/LOG.md`. No horizontal scroll at 1280 px. |
| 9 | `J/K` case navigation, `Enter` to open | frontend | S | Works on the inbox, ignored inside inputs. |
| 10 | M8 Supabase: DB + Storage together | backend | L | `DB_MODE=supabase` plus a Supabase Storage adapter in `lib/storage.ts` (today filesystem only, `lib/storage.ts:8`). Two instances show the same case, the citation viewer opens documents, Reset demo works, gate green. |

Order: 1–4 are demo safety (do first; 1 and 3 in parallel, 2 after 1), then 5–7, then 8–9 polish. M8 (10) only if time remains. The demo does not need it if risk 1's mitigation is followed.

## 5. Open questions (with defaults)

- **Which mode for the talk?** Default: Replay for the scripted run, plus one optional live run on case C if the network is good.
- **API key for live re-recording:** default the presenting developer's key, recorded on a freshly reset seed.
- **M8 shared DB:** Reset demo would affect both developers. Default: a separate Supabase project per environment, or skip M8 before Day 3.

## 6. QA focus

The demo outcomes in Replay mode must equal deterministic mode: A no claim, B €190,000, C €350,000, eval 24/24. Replay must never write to `demo/recordings`. The approval gate must still block in Replay: a replayed `prepare_claim` stops at `awaiting_approval` and nothing reaches the Outbox. History after `router.refresh()` must match the streamed steps. Run the full gate (lint, typecheck, test, build).

## Addendum (Chief, after QA)

| # | Item | Owner | Size | Acceptance criterion |
|---|---|---|---|---|
| 11 | Use `rules.atRiskDays` for the "deadlines at risk" KPI instead of the hard-coded 3 (`lib/queries/cases.ts:44`) | backend | S | Changing `atRiskDays` in Settings changes the KPI count; test added. |
| 12 | Decide red vs amber for near (not overdue) deadlines in `components/kit/deadline-pill.tsx` and the cases KPI; align with AGENTS.md | frontend (decision: team) | S | Red appears only for overdue, or AGENTS.md is updated to the agreed rule. |
| 13 | Deterministic draft/message ids and reset-proof deadlines in recordings | ai-engineer | S | Replaying after a reset shows the same `daysLeft` as the case screen; draft links resolve. |
