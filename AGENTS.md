<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kelvin project notes

- **Build tool:** this machine's Application Control policy blocks native `.node` binaries (SWC, Turbopack). `dev` and `build` run with `--webpack` and Next falls back to WASM SWC. Do not remove the flag. Vercel builds are unaffected.
- **Cache Components is on.** Uncached reads (DB, cookies) must sit inside `<Suspense>` with a skeleton fallback.
- **shadcn uses Base UI**, not Radix: compose with the `render` prop, not `asChild`.
- **Design tokens** live in `app/globals.css` (`--ai-*`, `--success*`, `--warning*`, `--danger*`, `--human*`, `--custody-*`). Use the semantic utilities (`bg-ai`, `text-human-fg`, `bg-warning-soft`, `num`) rather than raw colours. Red is for overdue deadlines only.
- **Rules live in `lib/rules/`**, never in prompts. Product disposition is decided only by the quality agent's rule (`lib/rules/stability.ts`, via the `assess_quality` tool) for clear cases; near-limit cases go to a human QA and are never auto-closed. The agent never sends without an approval record.
- Visual reference: `docs/agent-schema.png`. Full brief: `docs/BRIEF.md`.
- **Database:** PGlite is single-process. A lock file in `.data/` stops CLI scripts from opening it while the dev server holds it. Server components and GET handlers call `await connection()` before any query.
- **Demo data is generated, never hand-edited:** change `seed/cases/*.ts` and re-seed. Document IDs are deterministic (`demo-b-contract`, `demo-b-email-01`) so recordings and citations survive a reset.
- **Tests** run with `server-only` aliased to an empty module (`vitest.config.mts`).
- **Agent:** tools live in `lib/agent/tools/*` and are registered in `lib/agent/tools/index.ts`. Every tool runs through `executeTool` (audit, steps, citations). Tools must throw `ToolGuardError` with an actionable message when a prerequisite is missing; never compute caps or deadlines outside `lib/rules`.
- **Server-only code must not import React/Lucide**: domain modules stay UI-free (icons live in `components/kit/party-icons.ts`), otherwise `tsx --conditions=react-server` scripts break.
- **AI SDK packages are server externals** in `next.config.ts` (Webpack cannot bundle `@vercel/oidc`).
