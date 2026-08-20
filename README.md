# Sejuk Sejuk Service — Operations System

A simplified internal operations system for an aircond installation/servicing company, built for the Programmer Assessment (Operations System + AI Challenge).

**Live demo:** https://sejuk-sejuk-ops-assessment.vercel.app
**Repo:** https://github.com/guitges/sejuk-sejuk-ops-assessment

Digitises: **Admin creates order → Technician completes job → Manager reviews → Dashboard/AI reporting.**

## What I built

All modules from the brief, plus most of the bonus/optional items:

| Module | Status |
|---|---|
| Module 1 — Admin Portal (order submission) | ✅ Done, incl. order summary + WhatsApp notify bonus |
| Module 2 — Technician Portal (service job) | ✅ Done, incl. file upload + payment recording bonus |
| Module 3 — WhatsApp Notification Trigger | ✅ Done (deep-link based) |
| Bonus — KPI Dashboard | ✅ Done (stat cards, bar chart, leaderboard) |
| AI Module — Operations Query Window | ✅ Done |
| Optional — AI Workflow Supervisor | ✅ Done (inline flags in Review Queue) |
| Optional — AI Document Understanding | ❌ Not implemented (see Limitations) |
| Optional — AI Operational Insight (overload detection) | ✅ Done (part of the AI query module) |

## Tech stack

- **Front-end:** React 18 + Vite, React Router
- **Styling:** Tailwind CSS
- **Backend/DB:** Supabase (Postgres + RLS + Storage), accessed directly from the client via `@supabase/supabase-js` — no separate backend server
- **File storage:** Supabase Storage (`attachments` bucket)
- **Charts:** Recharts
- **Login:** Mock role switcher (Admin / Technician / Manager), persisted in `localStorage`. No real auth, per the brief.
- **AI:** A rule-based interpreter + controlled Supabase queries by default; optionally calls a real LLM (OpenAI-compatible) if `VITE_AI_API_KEY` is set. See "How AI was integrated" below.

## Project structure

```
src/
  lib/
    supabaseClient.js   # Supabase client init
    db.js                # THE ONLY module that talks to Supabase tables — every
                          # other file (including the AI module) goes through here
    whatsapp.js          # wa.me deep-link builders + message templates
    ai.js                # AI Operations Query Window logic
  context/AuthContext.jsx # mock role/login state
  components/             # Layout, StatusBadge
  pages/
    admin/                # OrdersList, NewOrder, OrderDetail
    technician/            # JobsList, JobComplete
    manager/                # ReviewQueue, Dashboard, AIQuery
supabase/
  schema.sql             # tables, triggers, RLS policies, storage bucket, seed data
```

## Architecture decisions

- **`db.js` as a single controlled data-access layer.** Every Supabase query in the app — including the ones the AI module uses — goes through named, narrow functions in `src/lib/db.js` (e.g. `listCompletedJobs`, `weeklyLeaderboard`). Nothing queries Supabase directly from a page component, and the AI module never receives a database connection or raw table access — only the JSON result of a specific, pre-defined query. This directly satisfies the brief's requirement that "AI responses should be based on structured data retrieved from the system" and "should not rely on unrestricted access to the entire database."
- **Status transitions always write to `order_status_history`.** Every status change (order created, assigned, started, job done, reviewed, closed) is logged with `changed_by` and an optional note, satisfying the "key actions should be traceable" rule, and lets the Order Detail page show a full audit trail.
- **`order_no` is generated server-side** via a Postgres sequence + trigger (`ORDER1001`, `ORDER1002`, ...), not client-side, to avoid collisions if two admins create orders concurrently.
- **WhatsApp integration uses `wa.me` deep links**, not the WhatsApp Business API — no business account/API keys are needed for a take-home assessment, and it's genuinely how many small businesses do this in practice. Every notification is also logged to `notifications_log` for traceability, so swapping in the real Cloud API later is a matter of replacing `buildWaLink` + adding a server-side sender, not restructuring the app.
- **AI Workflow Supervisor is folded into the Manager Review Queue** (RM discrepancy and "no photos" flags) rather than a separate screen, since that's where a manager would actually act on it.

## How AI was integrated

Flow (matches the brief): **question → intent interpretation → controlled DB query → formatted answer.**

`src/lib/ai.js` has two swappable layers:

1. **`interpretQuestion()`** — turns free text into one of a fixed set of intents (`technician_jobs`, `top_technician`, `jobs_completed_count`, `overloaded_technician`) plus parameters (technician name, time period), using keyword/regex matching against the known technician list and period words ("today", "this week", "last week"). This is deliberately deterministic rather than LLM-based by default, so answers are reproducible and can't hallucinate a query that touches data it shouldn't.
2. **`runControlledQuery()`** — executes the matched intent through the *same* `db.js` functions the rest of the app uses (e.g. `weeklyLeaderboard()`, `listCompletedJobs({ technicianName })`). The AI never sees a table name or writes SQL.
3. **`formatAnswer()`** — turns the small structured result into the natural-language reply. By default this is a template that mirrors the PDF's example output exactly (e.g. *"Technician Ali completed 3 jobs last week: ORDER1234 – Cleaning..."*). If `VITE_AI_API_KEY` is set, `formatWithLLM()` instead sends **only the already-retrieved JSON** (never credentials or a DB connection) to an OpenAI-compatible chat completions endpoint with a system prompt that forbids inventing data not in that JSON, and uses its response instead.

### Supported AI queries

- "What jobs did technician **[name]** complete **[today / this week / last week]**?"
- "Which technician completed the most jobs **[this week]**?"
- "How many jobs were completed **[today / this week]**?"
- "Which technician might be overloaded **[this week]**?" (compares each technician's job count to the team average)

### Limitations of the AI implementation

- Intent matching is keyword-based, not a general NLU model — it correctly answers the four question shapes above (and close paraphrases) but will fall back to a generic "here's what I can answer" message for anything else, rather than attempting a best-effort guess. This is a deliberate tradeoff: predictable and safe over clever.
- "Last week" is approximated as "last 14 days" (not bounded to exactly the prior Mon–Sun), since the assessment's own example data doesn't require calendar-week precision.
- If a technician name isn't recognised (not one of the 4 seeded technicians) and no other keyword matches, the assistant returns the generic capability message rather than a specific "I don't know that technician" — a minor UX gap I'd fix first in a real iteration.
- No conversation memory — each question is answered independently (no follow-up "and what about last week?" support).
- The optional **AI Document Understanding** challenge (extracting structured fields from uploaded documents) was not implemented, to keep scope focused on making the other modules solid — see below.

## Challenges / assumptions

- **No real auth** — per the brief, this is a role switcher. RLS is enabled on every table but uses permissive "allow all to anon" policies (documented in `supabase/schema.sql`) since there's no `auth.uid()` to key real per-user policies on. In production this would be Supabase Auth + policies like "a technician can only update jobs where `assigned_technician_id` matches their own user id."
- **Business rules (only Admin assigns, only assigned technician completes, etc.) are enforced in the UI, not the database** — e.g. `JobComplete.jsx` checks `order.technicians.name !== user.name` and blocks the form, but a determined user could still call Supabase directly with the anon key. This matches the brief ("you do not need to fully enforce these rules but your system should consider them in design") but is a gap I'd close with real auth + RLS before production.
- **Storage bucket is public-read** for simplicity (so `<img>` tags can just use the returned public URL without signed-URL handling) — acceptable for a demo of an internal tool, not for real customer photos in production.
- Seed data assumes a 7-day "week" window ending now, so the KPI dashboard and AI answers reflect data relative to whenever `schema.sql` was run.

## Self-assessment

- **Easiest module:** Module 1 (Admin order submission) — it's a straightforward form-to-database flow with clear fields specified in the brief.
- **Hardest module:** The AI Operations Query Window — not the "call an LLM" part, but designing the retrieval layer so the AI is *provably* restricted to controlled queries (per the brief's explicit requirement) while still feeling like a real assistant, and keeping the mock-vs-real-LLM path swappable with one env var.
- **What I'd improve for a real production system:** real Supabase Auth with per-role RLS policies instead of UI-only rule enforcement; server-side WhatsApp Cloud API sending instead of client-generated deep links (so notifications don't depend on the browser being open); signed/private storage URLs; a real NLU layer (or a constrained LLM function-calling setup) for the AI module instead of keyword matching, while keeping the same "structured-data-only" retrieval boundary; and pagination for the orders list once volume grows past a few hundred rows.
- **How AI tools were used while building this:** built end-to-end with Claude Code (Anthropic) — used to scaffold the React/Vite/Tailwind project, write the Supabase schema and RLS policies, implement all pages/modules, and drive an in-browser QA pass (creating orders, walking a job through Assigned → In Progress → Job Done → Reviewed, uploading a test file, and exercising the AI query module) that caught and fixed two real bugs before this was written up (an `order_no` sequence collision with seed data, and a snake_case/camelCase mismatch that caused newly-assigned orders to show status "New" instead of "Assigned").

## Running it locally

```bash
npm install
# .env.local already has VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for this assessment's project
npm run dev
```

Database setup (one-time): run `supabase/schema.sql` in the Supabase project's SQL Editor. It creates all tables, RLS policies, the `attachments` storage bucket, and seeds 4 technicians + ~30 sample orders spanning the last week (including one technician with a deliberately heavy week, to demo the "overloaded technician" AI insight).

To enable real LLM-formatted AI answers instead of the built-in template engine, set `VITE_AI_API_KEY` in `.env.local` (OpenAI-compatible chat completions endpoint).
