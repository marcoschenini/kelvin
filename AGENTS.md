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
- **Rules live in `lib/rules/`**, never in prompts. The agent never decides product disposition and never sends without an approval record.
- Visual reference: `docs/agent-schema.png`. Full brief: `docs/BRIEF.md`.
