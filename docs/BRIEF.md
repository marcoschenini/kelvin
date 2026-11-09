# Build Kelvin: Pharma Claims Recovery Agent (agent + full platform)

You are building **Kelvin**, a working AI agent and a polished web platform for a university course on Agentic AI. It will be shown live in a demo ("Day 3"). Two things matter equally: **the agent must really work** (LLM with tools, real reasoning over real files), and **the product must look and feel premium**, with a clear and simple user flow.

Before writing code, read this whole brief, then reply with: (1) your implementation plan by milestone, (2) the folder structure, (3) any question that blocks you. Then build milestone by milestone, committing after each one.

Reference files are in `/docs` (copy them there if missing):
- `Kelvin_-_Pharma_Claims_Recovery_Agent.docx`: the one-page project brief
- `agent-schema.png`: the flow diagram of what the agent does. **The app's visual language should feel like this diagram**: soft cards, Lucide icons, an indigo→sky gradient for anything "AI", green for "no claim", amber for "possible claim", and violet badges for human decisions.

---

## 1. The product in one paragraph

Many medicines must travel at 2–8 °C. When a sensor records a temperature excursion, four teams (quality, logistics, insurance, legal) have to work out what happened, who is responsible and whether money can be claimed. Today this is slow and manual, so claims are sent late or not at all. Kelvin takes the case from the alert to the money: it collects the data, rebuilds the incident, finds who should pay and by when, prepares the evidence file and the claim letter, sends it after a manager approves, and follows up until the case is closed. **People keep two decisions**: quality decides whether the medicine is still usable, and a manager approves every claim before anything is sent.

## 2. Domain rules the agent must apply

Put these in a configurable rules file (`/lib/rules/*.ts`), not hard-coded in prompts. Show a "not legal advice" note in the UI.

- **Excursion ≠ damage.** Quality decides product disposition (released / rejected). The agent never decides it.
- **Air cargo (Montreal Convention 1999):**
  - Written notice of damage within **14 days of receipt** (Art. 31). Delay: 21 days from when the cargo was placed at disposal. Court action time-bar: 2 years (Art. 35).
  - Carrier liability capped at **26 SDR per kg** (since 28 Dec 2024) unless a special declaration of value was made. Keep the SDR→EUR rate as a config value with an "as of" date.
- **Recovery routes:** airline (carrier), forwarder/3PL (under its contract and SLA), cargo insurer (under the policy, minus the deductible). The agent ranks the routes by **expected recoverable €**, explaining caps, exclusions and deadlines for each.
- **Early (protective) notice:** if a deadline is within N days (config, default 5) and quality has not decided yet, the agent drafts a protective notice that reserves the right to claim. It still needs manager approval before sending.
- **Every statement in a dossier or letter cites its source**: document + page/clause, or logger file + row/timestamp. No citation means the agent must flag it as an assumption.

## 3. Stack

- **Next.js (App Router) + TypeScript (strict)**, Tailwind CSS, shadcn/ui, Lucide icons, Framer Motion, Recharts (or visx) for charts.
- **Agent:** Vercel AI SDK with tool calling and streaming. Make the model provider configurable via env (`AI_PROVIDER=anthropic|openrouter`, `AI_MODEL=...`).
- **Data:** Supabase (Postgres + Storage). Also provide a local mode with SQLite or JSON so the demo can run without Supabase. Use Prisma or Drizzle.
- **PDF:** generate synthetic PDFs with `pdf-lib` or `@react-pdf/renderer`; extract text with page numbers using `pdfjs-dist`.
- **Deploy:** Vercel. Put all secrets in `.env.local` and provide `.env.example`.
- **Nothing ever leaves the app:** no real emails. Use a simulated **Outbox** and simulated counterparties.

## 4. Agent architecture

An **orchestrator agent** with a shared **case record** and the following tools. Each tool is a typed function with a Zod schema. Each call is logged to an append-only `audit_events` table: input, output, timestamp, model, duration.

| Tool | What it does |
|---|---|
| `parse_logger` | Reads the logger CSV and returns excursion windows (start, end, peak, minutes out of range) |
| `extract_document` | Text + page numbers from PDFs (air waybill, contract, policy, handling report) |
| `build_custody_timeline` | Merges handling events (who held the cargo, from/to timestamps) with the excursion windows and assigns the excursion to the party in custody |
| `check_contract` | Finds the relevant clauses in the forwarder contract (temperature duties, liability, notice periods) and returns quotes + page refs |
| `check_policy` | Finds the coverage, exclusions, deductible and notice period in the insurance policy |
| `compute_liability` | Applies caps (Montreal 26 SDR/kg × weight, contract caps, insurance value minus deductible) and returns recoverable € per route |
| `compute_deadlines` | Returns all deadlines with dates and days left (Montreal notice, contract notice, policy notice) |
| `rank_routes` | Ranks carrier / forwarder / insurer by expected recoverable € and probability, with reasons |
| `draft_protective_notice` | Short notice reserving rights, addressed to the right party |
| `draft_claim_letter` | Full claim letter with amount, facts, clauses, citations and an annex list |
| `build_evidence_pack` | Bundles the timeline chart, logger extract, cited pages and correspondence into one exportable PDF |
| `request_missing_info` | Lists what is missing and drafts the request (e.g. "commercial invoice to prove value") |
| `send_via_outbox` | Only callable after approval. Puts the message in the simulated Outbox |
| `handle_reply` | Reads a counterparty reply and proposes the next action |

**Case status machine** (enforce it in code, not only in the prompt):
`New → Investigating → Awaiting QA → (No claim → Closed) | (Claim prepared → Awaiting approval → Sent → In negotiation → Closed: Recovered / Settled / Rejected)`.
The protective notice can branch off from `Investigating` or `Awaiting QA`.

**Human gates** are real UI actions with name + timestamp in the audit log:
1. QA disposition (Released / Rejected, optional note).
2. Manager approval (Approve / Edit and approve / Reject, with reason).

**Simulated counterparties:** a small LLM role-play (or a script) that answers claims with realistic replies such as "send the commercial invoice", "we accept liability up to the Montreal limit", or "claim rejected: notice out of time". This lets the demo show the agent following up.

**Demo safety:** record every agent run to `/demo/recordings/*.json`, and add a **Replay mode** that plays a recorded run with the same streaming animation. Then the live demo works even if Wi-Fi or the API fails.

## 5. Synthetic data (build this carefully, it makes or breaks the demo)

Create a `/seed` generator plus three hand-crafted demo cases. Each case has: logger CSV (5-minute readings), air waybill PDF (weight, declared value or "NVD"), handling events JSON, forwarder contract PDF (real-sounding clauses, numbered, on several pages), insurance policy PDF, commercial invoice PDF, and 2–4 emails.

- **Case A: no claim.** FRA→BOS, biologics, 2–8 °C. Peak 9.2 °C for 25 min during a truck transfer. QA releases the product (it is within its stability budget). Expected result: no claim, case closed with the reason logged.
- **Case B: insurer.** FRA→BOS, €200,000, 120 kg. 13 °C for 90 min on the airport ramp, while in the airline's custody. Montreal cap ≈ 26 SDR × 120 kg, a small fraction of the value; no special declaration of value. The policy covers temperature deviation with a €10,000 deductible. Expected result: claim the insurer, plus a protective notice to the airline within 14 days.
- **Case C: forwarder.** AMS→JFK, €350,000. The forwarder's contract requires cold-room storage (2–8 °C) at the hub and makes it liable up to the invoice value. The handling log shows the shipment left on the warehouse floor for 4 hours (peak 15 °C). QA rejects the batch. Expected result: full claim against the forwarder, with a protective notice drafted on day 2.

Also generate **20+ evaluation cases** with varied facts: different custody parties, missing documents, a late discovery near the deadline, exclusions, declared value present or absent. Each comes with an **answer key** (correct route, correct deadlines, claim yes/no).

## 6. Pages and user flow

The core flow must take under 60 seconds to show: **Inbox → open a case → watch the agent work → QA decision → review the claim → approve → see it sent and followed up.**

1. **Cases inbox (home)**
   - KPI strip: open cases, € at stake, € recovered, deadlines at risk (red if under 3 days).
   - Case list: shipment, route, value, status chip, owner, a **deadline countdown pill**, and the recommended route.
   - "New case" and "Run demo" buttons.
2. **New case:** drag-and-drop upload of the files, or "Load demo case A/B/C". After upload, the agent starts automatically.
3. **Case detail (the hero screen).** Design it first and best.
   - **Header:** shipment ID, FRA→BOS, value, weight, status, and a **circular deadline ring** (days left to the nearest deadline).
   - **Temperature × custody chart (the signature visual):** temperature line over time, the 2–8 °C band shaded, excursion areas highlighted. Underneath, colour-coded custody bands (shipper → forwarder → airline → forwarder → consignee). It should be instantly clear *who held the cargo when it got warm*.
   - **Agent panel:** a live, streaming list of steps (tool name, short human summary, duration, citation chips). It must look like an intelligent agent working, not a log dump. Collapsible details show raw tool input/output.
   - **Recovery routes card:** carrier / forwarder / insurer side by side, each with recoverable €, cap or deductible, deadline, and the recommended one highlighted. Each has a "Why?" with citations.
   - **Decisions:** the QA gate and approval gate as clear, focused cards with violet "Human decision" badges.
   - **Documents:** a viewer where clicking a citation chip opens the document at that page with the passage highlighted.
   - **Correspondence:** a thread of Outbox messages and counterparty replies.
   - **Audit log:** a filterable timeline of every event.
4. **Approval screen:** claim letter on the left (editable rich text), evidence and citations on the right; Approve / Edit / Reject. After approval, an animated hand-off to "Sent".
5. **Evaluation page:** runs the agent on the 20+ cases and shows route accuracy, deadline accuracy, citation coverage and average time per case, with a table of wrong answers and a link to each run.
6. **Settings:** model/provider, the rules config (SDR rate, early-notice threshold), and demo reset (re-seed).

## 7. Aesthetic direction

The brand is **Kelvin**: cold, precise, calm, premium. Think of a lab instrument crossed with a modern fintech dashboard, not a generic admin template.

- **Palette:** off-white `#F8FAFC` background, white cards, slate text (`#0F172A` / `#64748B`), hairline borders `#E2E8F0`. AI accent is a gradient `#4F46E5 → #0EA5E9`. Status: green `#16A34A` (no claim / recovered), amber `#D97706` (possible claim / at risk), red only for overdue deadlines, violet `#7C3AED` for human decisions. Provide a dark mode with the same logic (navy `#0B0F17` base).
- **Type:** Inter, with Inter Display for headings; tabular numbers for money and dates; tight letter-spacing on large headings.
- **Shape:** 14–16 px radius cards, soft shadows, generous whitespace, one primary action per screen.
- **Motion (Framer Motion):** agent steps stream in with a subtle fade and slide; numbers count up; status changes animate; the deadline ring fills. Keep it subtle: under 250 ms, no bounces.
- **Details that make it feel real:** empty states, skeleton loaders, keyboard shortcuts (`A` approve, `J/K` move through cases), toasts, sensible € formatting (`€200,000`), dates as "12 Nov 2026 (in 3 days)".
- **Logo:** a simple wordmark "kelvin" plus a small snowflake/thermometer glyph in the indigo→sky gradient.

## 8. Milestones

1. Scaffold, design system (tokens, typography, core components), app shell with sidebar.
2. Data model, the seed generator, and the 3 demo cases with their PDFs.
3. Agent tools + orchestrator + status machine + audit log (test them from a script first).
4. Case detail screen, including the chart and the streaming agent panel.
5. Human gates, approval screen, Outbox, simulated counterparties.
6. Evaluation harness and page.
7. Demo mode, Replay mode, polish (motion, empty states, dark mode), README with a **5-minute demo script**.
8. Deploy to Vercel.

## 9. Acceptance criteria

- Running case A, B or C from the UI produces the expected outcome from section 5, and every claim in the letter has a citation.
- The agent never sends anything without approval. This is enforced in code.
- Deadlines are computed correctly and the early notice appears in cases B and C.
- The eval page runs on 20+ cases and shows the metrics.
- Replay mode reproduces a full run without network access.
- Lighthouse accessibility ≥ 90; the app is usable at 1280 px and looks good on a projector.
- The code is typed, linted, organised, and has unit tests for the rules (caps, deadlines, route ranking).

When something is ambiguous, choose the option that makes the live demo clearer and more convincing, and tell me what you chose.
