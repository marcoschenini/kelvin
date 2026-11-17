# Pharma redesign: institutional look, output-first case screen

Date: 2026-11-17 · Author: Chief of staff · Branch: `feature/pharma-redesign` · Owner: frontend

## Request (Vito)

The tool looks "too Claude" and too simple. It should look like a large pharmaceutical company's product: institutional, precise, rich but clean. The design system should not sit in the workspace; at most it goes in Settings. What the agent does should not be explicit: the screen shows the output, as clean as possible. Agent steps stay available behind a "Details" control (needed for the Agentic AI course demo).

**Brand note:** Vito asked for Eli Lilly's colours and fonts. We do **not** copy any real company's brand (exact colours, fonts, logo): Kelvin is public. We use the same *language* of big-pharma design with our own palette and open fonts. Do not use Lilly's red `#D52B1E` or their typefaces.

## Visual direction

- **Light, white, institutional.** Default theme back to **light** (dark stays available from the toggle).
- **Palette (own):**
  - Background white `#FFFFFF`, subtle surface `#F6F7F9`.
  - Ink navy `#0E1B33` for text and headings; secondary `#5B6577`; hairlines `#E3E6EB`.
  - **One accent: Kelvin red `#B3122E`** for primary actions, the active nav item, key figures and the brand mark only. Hover `#8E0E24`, soft `#FBEAED`.
  - Navy `#1B2F57` for secondary emphasis and the "agent/analysis" tone (replaces the indigo→sky AI gradient).
  - Status: success `#1E7A4C`, warning `#A86A00`. Overdue uses a dark red `#7A0C1E` with an icon and the word "Overdue", so it never relies on colour alone and stays distinct from the accent red.
  - Human decisions: navy outline badge, not violet.
- **Type:**
  - Headings in **Source Serif 4** (600, tight tracking, larger sizes: page title 32–36px).
  - Body and UI in **Inter**, kept.
  - Numbers tabular (`num`).
  - Small caps-style overlines: 11–12px, uppercase, letter-spacing 0.08em.
- **Shape and depth:**
  - Radius 6px on controls, 10px on cards.
  - No gradients, no glow, no sparkle icons.
  - Hairline borders over shadows, at most one subtle shadow.
  - More whitespace; a 12-column grid at 1280px.
- **Remove every "AI-product" cue:** the `Sparkles`/`Bot` icons, "AI agent" labels, the gradient fills, the pulsing dots. Wording: "Analysis", "Assessment", "Recommendation", not "the agent is thinking".

## Changes

1. **Tokens and fonts:** `app/globals.css` (tokens remapped to the palette above; keep the token *names* so components keep working, e.g. `--ai-*` now navy); `app/layout.tsx` (Source Serif 4 via `next/font/google`, theme-color); `components/shell/theme.tsx` defaultTheme `light`. Update `components/brand/logo.tsx` to a refined wordmark: "Kelvin" set in the serif, with a small red mark. Keep it simple and original.
2. **Shell:** sidebar with navy text, red active indicator (left bar), and section labels as overlines. **Remove "Design system" from the sidebar.** In `app/(shell)/settings/page.tsx`, add a "Design system" row or card under a "Workspace" or "Appearance" section that links to `/design`. Keep the `/design` route.
3. **Case screen (`app/(shell)/cases/[id]/page.tsx` and `components/case/*`): output-first.**
   - Top: the case header (shipment, route, value, weight, status, nearest deadline), then a prominent **Recommendation card**:
     - outcome (No claim / Claim the insurer…);
     - amount (plan total, with primary and secondary);
     - nearest deadline with days left;
     - quality assessment in one line;
     - the next human action as the primary button (Approve claim / QA decision).
   - Then the evidence: the temperature × custody chart, then recovery routes / claim plan, documents, correspondence.
   - **The agent panel no longer shows by default.** Replace it with a compact status line while an analysis runs: "Analysis in progress…" with a thin progress bar and skeletons for the cards. Show no tool names or steps.
   - The full step list (the current `AgentPanel` content) and the audit log move into a **"Details"** section: a tab or collapsible at the bottom, closed by default and labelled "Analysis details & audit trail". Citations stay clickable in letters and routes.
   - Autostart behaviour and run streaming keep working: `AgentRunProvider` and `run-stream` stay, only the presentation changes.
4. **Cases inbox, approval screen, eval, settings, live map:** apply the new look consistently:
   - tables with a navy header text and hairline rows;
   - KPI tiles: serif figures, overline labels, no coloured icon bubbles;
   - approval screen: the letter on a "paper" surface (white, serif heading, generous margins) with the evidence on the right.
5. Keep accessibility: contrast AA (check red `#B3122E` on white ≈ 6.9:1 and navy text), visible focus ring in navy or red, keyboard shortcuts (A on approval).

## Constraints

- UI only: `app/**`, `components/**`, `app/globals.css`. No changes to `lib/**`, `seed/**`, `tests/**` business logic. If a query needs a field, read what exists (record fields from workflow v2: `qaAssessment`, `claimPlan`, `outcome`…).
- Conventions in AGENTS.md: Base UI `render` prop, `<Suspense>` for uncached reads, semantic tokens only (no raw hex in components; hex lives in `globals.css`).
- Gate: lint, `next typegen` + typecheck, tests 129/129, build.

## Acceptance

1. No "Design system" item in the sidebar; reachable from Settings.
2. Case page at 1280px: the Recommendation card is the first thing below the header; no tool names or step list visible until "Analysis details & audit trail" is opened.
3. No gradient, sparkle or bot icon left in the UI (`grep -rn "Sparkles\|Bot\b\|gradient" components app` only finds `/design` docs or nothing).
4. Light theme by default; the dark theme still works (tokens defined for `.dark`).
5. Gate green.
