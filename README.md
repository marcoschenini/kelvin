# Kelvin — Pharma claims recovery agent

From temperature excursion to recovered money. Kelvin collects the logger data and shipping documents, rebuilds who held the cargo when it got warm, finds who should pay and by when, drafts the evidence pack and claim letter, and follows up after a manager approves. Quality keeps the product decision; a manager approves every claim.

> Decision support for a university demo. Not legal advice.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your model API key
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Webpack, see AGENTS.md) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

## Status

- [x] M1 — Scaffold, design system, app shell (`/design` shows every token and component)
- [ ] M2 — Data model, seed generator, demo cases A/B/C
- [ ] M3 — Agent tools, orchestrator, status machine, audit log
- [ ] M4 — Case detail: temperature × custody chart, streaming agent panel
- [ ] M5 — Human gates, approval screen, Outbox, simulated counterparties
- [ ] M6 — Evaluation harness and page
- [ ] M7 — Demo + Replay mode, polish, 5-minute demo script
- [ ] M8 — Deploy to Vercel

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui (Base UI) · Lucide · Motion · Recharts · Vercel AI SDK · Drizzle (PGlite locally, Supabase in production) · pdf-lib / pdfjs-dist · Vitest
