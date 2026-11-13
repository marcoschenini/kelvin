# Agent team playbook

How the Chief of staff (main Claude Code session) runs Kelvin's development team. The subagent definitions are in `.claude/agents/`; this file is the operating procedure.

## Roles

| Role | Agent | Model | Writes | Isolation |
|---|---|---|---|---|
| Chief of staff | main session | Opus (`/model opus`) | integration, `docs/team/` | main checkout |
| Product & Architect | `product-architect` | Opus, effort high | `docs/team/specs/` only | main checkout |
| Frontend | `frontend` | Sonnet | `app/(shell)/**`, `components/**`, `app/globals.css`, `app/layout.tsx` | git worktree |
| Backend | `backend` | Sonnet | `lib/db`, `lib/queries`, `lib/actions`, `lib/rules`, `lib/case`, `lib/pdf`, `seed/`, `app/api` (non-agent) … | git worktree |
| AI Engineer | `ai-engineer` | Sonnet; Opus on request | `lib/agent`, `lib/eval`, `lib/counterparties`, agent/eval routes and scripts, `demo/recordings` | git worktree |
| QA / Reviewer | `qa-reviewer` | Opus, effort high | nothing (read and run only) | reads any checkout |

Full ownership map: `.claude/agents/product-architect.md`. Shared files (`package.json`, `lib/utils.ts`, `lib/format.ts`, `tsconfig.json`) change only through the Chief.

## When to delegate (criteria)

- **Do it yourself (Chief):** questions about the code, one-file fixes under ~20 lines, docs/README edits, merging, running the gate.
- **product-architect:** any feature touching more than one area, any data model or agent behaviour change, any milestone (M7, M8), or a request whose outcome is unclear. Skip it for a small, single-area change with obvious acceptance criteria — then the Chief writes the criteria.
- **frontend / backend / ai-engineer:** implementation in their area, with a precise brief (below). Run them in parallel only when their files do not overlap and the contract between them is fixed in the spec.
- **ai-engineer on Opus** (`model: "opus"` in the Agent call): prompt or orchestration redesign, eval failures that survived one Sonnet attempt, multi-step reasoning bugs, anything where a wrong answer reaches a claim letter.
- **qa-reviewer:** always before integrating code. Also for read-only audits.

## The six steps for a feature

1. **Outcome and checks.** Restate the request as an outcome plus numbered acceptance criteria (via `product-architect` when needed; spec saved in `docs/team/specs/`). Log the start in `LOG.md`.
2. **Assign.** One brief per specialist containing: goal, files they own for this task, contract with the others (types, signatures, routes), acceptance criteria, what *not* to touch, and the spec path.
3. **Parallelise.** Launch independent specialists in the same turn. Code-writing agents run with `isolation: worktree`, so each works on its own branch under `.claude/worktrees/`. Sequential when one needs the other's output (e.g. backend contract → frontend).
4. **QA.** Send `qa-reviewer` the criteria, branches/worktree paths and file list. Its verdict is PASS / PASS WITH NOTES / FAIL.
5. **Fix and integrate.** Send findings back to the owning specialist (SendMessage to continue the same agent). Re-run QA on fixes that touch behaviour. Then merge the verified branches into `feature/<name>` in the main checkout, run `kelvin-verify` once more on the merged result, commit, push the branch, open a PR and **enable auto-merge** on it (never push to `master`). GitHub merges it by itself when the required `verify` check (`.github/workflows/verify.yml`) is green; if it is red, fix and push again.
6. **Report.** Tell the user in plain language: what changed, how to try it (URL path, clicks or command), what was verified, anything left open. Log the outcome in `LOG.md`; record lasting choices in `DECISIONS.md`.

## Brief template (Chief → specialist)

```
Task: <one sentence>
Spec: docs/team/specs/<file>.md (section …)
You own: <files>
Do not touch: <files/areas>
Contract: <types / function signatures / route shapes you consume or expose>
Acceptance criteria: 1. … 2. …
Done = criteria met + lint/typecheck/test green in your worktree; report branch, files, commands and results.
```

## Skills mapping

| Skill | Where it lives | Used by |
|---|---|---|
| `kelvin-verify` | `.claude/skills/` (in repo) | qa-reviewer (preloaded), Chief before integrating, every specialist before reporting |
| `frontend-design`, `dataviz`, `design:accessibility-review`, `design:ux-copy`, `design:design-critique` | Claude account / plugins (if installed) | frontend; qa-reviewer for the accessibility target |
| `pdf` | Claude account (if installed) | backend (evidence pack, extraction) |
| `product-self-knowledge` | Claude account (if installed) | ai-engineer (AI SDK / Anthropic API facts) |

Account skills are not in the repo: agents use them when the session has them and work without them otherwise.

## Records

- `docs/team/LOG.md` — dated activity log (newest first): request, who did what, verdict, outcome.
- `docs/team/DECISIONS.md` — lasting decisions with reason and date.
- `docs/team/specs/` — one spec per feature.
