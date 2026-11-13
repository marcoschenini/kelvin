@AGENTS.md

## Kelvin at a glance

Kelvin is an AI agent and web platform for pharma cold-chain claims recovery, built for a university course on Agentic AI (live demo on "Day 3"). Full brief: `docs/BRIEF.md`. Setup, scripts and architecture: `README.md`.

- **Done:** M1 design system and shell, M2 data model and demo cases A/B/C, M3 agent tools, rules engine, status machine and audit, M4 case screen (chart, journey map, agent panel, citation viewer), M5 approval screen, settlement gate and simulated counterparties, M6 evaluation (24 answer-keyed cases), M8 Supabase mode (shared Postgres + Storage, `README.md` → Set up Supabase). There is also a live shipments map as the home page and a mobile layout.
- **Next:** M7 Replay mode (play `demo/recordings/*.json` offline), the 5-minute demo script in the README and final polish.
- **Live site:** https://kelvin-roan.vercel.app. Every push to `master` redeploys it.

## Working together (two developers, each with Claude Code)

- Pull `master` before starting. Do each task on its own branch (`feature/<short-name>`) and merge it through a pull request. Do not push straight to `master`.
- Agree who owns which milestone, and avoid editing the same files at the same time.
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. The tests guard the rules and the demo outcomes (A no claim, B insurer €190,000, C forwarder €350,000, eval 24/24).
- Local data in `.data/` and `.env.local` are per machine and never committed. Reset the demo data from Settings → Reset demo.
- Without an API key the agent runs in deterministic mode. Each developer uses their own key in `.env.local`.

## Agent team (Claude Code)

The main session is the **Chief of staff** (run it on Opus: `/model opus`). It plans, delegates, coordinates, integrates and is the only one that talks to the user, in plain language and in the user's language. Five subagents live in `.claude/agents/`:

| Agent | Model | Use it for |
|---|---|---|
| `product-architect` | Opus | Requirements, architecture, task split, acceptance criteria (writes only `docs/team/`) |
| `frontend` | Sonnet, own worktree | `app/(shell)`, `components/`, styling, interactions |
| `backend` | Sonnet, own worktree | DB, queries, actions, API, rules, status machine, seed, PDF |
| `ai-engineer` | Sonnet (Opus on request), own worktree | Kelvin's internal agent, tools, prompts, recordings, eval |
| `qa-reviewer` | Opus, read-only | Independent verification before anything is integrated |

For every feature request the Chief follows `docs/team/PLAYBOOK.md`: define outcome and checks → assign precise tasks → run independent work in parallel in separate worktrees → QA verifies → fix and integrate on a `feature/<name>` branch → explain to the user what changed and how to try it. Log activity in `docs/team/LOG.md` and decisions in `docs/team/DECISIONS.md`. Ask the user only when an answer is indispensable.
