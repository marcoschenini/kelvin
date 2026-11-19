<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kelvin project notes

- **Build tool:** this machine's Application Control policy blocks native `.node` binaries (SWC, Turbopack). `dev` and `build` run with `--webpack` and Next falls back to WASM SWC. Do not remove the flag. Vercel builds are unaffected.
- **Cache Components is on.** Uncached reads (DB, cookies) must sit inside `<Suspense>` with a skeleton fallback.
- **shadcn uses Base UI**, not Radix: compose with the `render` prop, not `asChild`.
- **Design tokens** live in `app/globals.css` (`--ai-*`, `--success*`, `--warning*`, `--danger*`, `--human*`, `--custody-*`). Use the semantic utilities (`bg-ai`, `text-human-fg`, `bg-warning-soft`, `num`) rather than raw colours. Brand: Kelvin red `#B3122E` is the single accent; the logo is the script "Kelvin" wordmark and script "K" mark (`components/brand/logo.tsx`, traced SVG; `app/icon.svg` for the favicon) (primary actions, active nav, key figures), navy `#0E1B33` for text and headings, EB Garamond for headings and Public Sans for UI (free stand-ins for the ITC Garamond Narrow / Ringside pairing of lilly.com/at), navigation as a horizontal top bar with a user menu (persona, theme, legal note) on the right, light theme by default. Overdue deadlines use dark red with an icon and the word "Overdue" (never colour alone). No gradients, sparkle or bot icons: the UI shows outputs. The one exception is **Ratel**, the honey-badger mascot of Ask Kelvin (`components/mascot/`, reused from our earlier project): cream engraving lines on the `bg-mascot` navy badge, only in the chat (panel, Ask Kelvin page), still under reduced motion. While Kelvin runs, its steps stream live in a panel under the case header (`components/case/analysis-status.tsx`); afterwards a one-line summary stays ("Show steps"), and the full history lives in "Analysis details & audit trail". Deterministic runs started from the UI are paced (`KELVIN_STEP_PACE_MS`, default 600 ms before each tool call) so the steps can be followed; tests and the eval run unpaced.
- **Rules live in `lib/rules/`**, never in prompts. Product disposition is decided only by the quality agent's rule (`lib/rules/stability.ts`, via the `assess_quality` tool) for clear cases; near-limit cases go to a human QA and are never auto-closed. The agent never sends without an approval record.
- Visual reference: `docs/agent-schema.png`. Full brief: `docs/BRIEF.md`.
- **Database:** PGlite is single-process. A lock file in `.data/` stops CLI scripts from opening it while the dev server holds it. Server components and GET handlers call `await connection()` before any query.
- **Demo data is generated, never hand-edited:** change `seed/cases/*.ts` and re-seed. Document IDs are deterministic (`demo-b-contract`, `demo-b-email-01`) so recordings and citations survive a reset.
- **Tests** run with `server-only` aliased to an empty module (`vitest.config.mts`).
- **Agent:** tools live in `lib/agent/tools/*` and are registered in `lib/agent/tools/index.ts`. Every tool runs through `executeTool` (audit, steps, citations). Tools must throw `ToolGuardError` with an actionable message when a prerequisite is missing; never compute caps or deadlines outside `lib/rules`.
- **Server-only code must not import React/Lucide**: domain modules stay UI-free (icons live in `components/kit/party-icons.ts`), otherwise `tsx --conditions=react-server` scripts break.
- **Ask Kelvin (chat) is read-only**: `app/api/cases/[id]/chat` answers from `lib/chat/answers.ts` (built-in, rules-based) or, with `GROQ_API_KEY`, from a model whose only tools return those same answers. Never give the chat tools that write to the case, the outbox or the audit trail; numbers come from `lib/rules`, never from the model.
- **AI SDK packages are server externals** in `next.config.ts` (Webpack cannot bundle `@vercel/oidc`).
