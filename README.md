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
- **AI:** Google Gemini (`gemini-3.6-flash`), called from a Vercel serverless function (`api/ai.js`) so the API key never reaches the browser. Falls back to a deterministic local engine if the AI endpoint is unavailable. See "How AI was integrated" below.

## Project structure

```
api/
  ai.js                 # Vercel serverless function — holds GEMINI_API_KEY server-side,
                         # calls the Gemini REST API for "interpret" and "format"
src/
  lib/
    supabaseClient.js   # Supabase client init
    db.js                # THE ONLY module that talks to Supabase tables — every
                          # other file (including the AI module) goes through here
    whatsapp.js          # wa.me deep-link builders + message templates
    ai.js                # AI Operations Query Window logic — calls api/ai.js,
                          # falls back to a local deterministic engine on failure
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
- **The AI's API key never touches the browser.** The app is otherwise fully client-side (React talks straight to Supabase using the public anon key, which is safe — it's protected by RLS). An LLM API key is different: it's a billable secret, and a client-side `VITE_*` env var gets bundled straight into the JS anyone can view. So `api/ai.js` — a Vercel serverless function — is the *only* piece of backend code in this project, existing solely to keep `GEMINI_API_KEY` server-side.

## How AI was integrated

Flow (matches the brief): **question → AI interprets question → controlled DB query → AI formats answer.** Both AI steps are real calls to Google's Gemini API (`gemini-3.6-flash`), not templates — see `api/ai.js` (server) and `src/lib/ai.js` (client orchestration).

1. **Interpret** (`POST /api/ai {action:'interpret', question}`) — Gemini classifies the free-text question into one of four supported intents (`technician_jobs`, `top_technician`, `jobs_completed_count`, `overloaded_technician`) plus parameters (technician name, time period), constrained by a system prompt listing the exact valid intents/technicians/periods and forced to `responseMimeType: application/json`. Gemini never sees the database — only the question text and that fixed vocabulary. Anything outside the four shapes (or naming an unknown technician) is classified `unsupported`.
2. **Controlled DB query** (`runControlledQuery()` in `src/lib/ai.js`) — executes the matched intent through the *same* `db.js` functions the rest of the app uses (e.g. `weeklyLeaderboard()`, `listCompletedJobs({ technicianName })`). This step has no AI in it at all — it's a plain JS switch statement, so the model can never construct or influence an actual database query, only pick from a pre-defined menu of them.
3. **Format** (`POST /api/ai {action:'format', question, intent, data}`) — Gemini turns the small retrieved JSON into a natural-language answer, with a system prompt that explicitly forbids inventing data not present in that JSON. This is genuine model reasoning, not string templating — e.g. asking "which technician might be overloaded" doesn't just report the top count, it compares it against each other technician individually in the phrasing.

**Fallback:** if the `/api/ai` call fails for any reason (offline, `ANTHROPIC`/`GEMINI_API_KEY` unset, running plain `npm run dev` without Vercel's serverless runtime — Vite alone doesn't serve the `api/` folder), both steps fall back to a small deterministic engine in `src/lib/ai.js` (keyword matching for interpretation, a string template for formatting), so the module degrades gracefully instead of breaking. The chat UI labels each answer with which path was actually used (`interpret: Gemini` vs `local fallback`), so this is visible, not hidden.

### Supported AI queries

- "What jobs did technician **[name]** complete **[today / this week / last week]**?"
- "Which technician completed the most jobs **[this week]**?"
- "How many jobs were completed **[today / this week]**?"
- "Which technician might be overloaded **[this week]**?" (compares each technician's job count to the others)

### Limitations of the AI implementation

- Still only four supported *shapes* of question — Gemini is doing real NLU within that vocabulary (handles paraphrases, typos, indirect phrasing well), but a question genuinely outside those four intents is correctly declined (`unsupported`) rather than answered speculatively. Verified live: asking about the weather in Shah Alam correctly returns "I do not have access to weather information" instead of a hallucinated answer.
- "Last week" is approximated as "last 14 days" (not bounded to exactly the prior Mon–Sun), since the assessment's own example data doesn't require calendar-week precision.
- Each question triggers two sequential model calls (interpret, then format) — noticeably slower (several seconds) than the deterministic fallback. A production version would likely combine these into one call with function-calling, or stream the response.
- No conversation memory — each question is answered independently (no follow-up "and what about last week?" support).
- The Gemini free tier has modest rate limits; a burst of concurrent managers asking questions could hit them, in which case the local fallback engine takes over automatically.
- The optional **AI Document Understanding** challenge (extracting structured fields from uploaded documents) was not implemented, to keep scope focused on making the other modules solid — see below.

## Challenges / assumptions

- **No real auth** — per the brief, this is a role switcher. RLS is enabled on every table but uses permissive "allow all to anon" policies (documented in `supabase/schema.sql`) since there's no `auth.uid()` to key real per-user policies on. In production this would be Supabase Auth + policies like "a technician can only update jobs where `assigned_technician_id` matches their own user id."
- **Business rules (only Admin assigns, only assigned technician completes, etc.) are enforced in the UI, not the database** — e.g. `JobComplete.jsx` checks `order.technicians.name !== user.name` and blocks the form, but a determined user could still call Supabase directly with the anon key. This matches the brief ("you do not need to fully enforce these rules but your system should consider them in design") but is a gap I'd close with real auth + RLS before production.
- **Storage bucket is public-read** for simplicity (so `<img>` tags can just use the returned public URL without signed-URL handling) — acceptable for a demo of an internal tool, not for real customer photos in production.
- Seed data assumes a 7-day "week" window ending now, so the KPI dashboard and AI answers reflect data relative to whenever `schema.sql` was run.

## Self-assessment

- **Easiest module:** Module 1 (Admin order submission) — it's a straightforward form-to-database flow with clear fields specified in the brief.
- **Hardest module:** The AI Operations Query Window — not the "call an LLM" part, but designing the retrieval layer so the AI is *provably* restricted to controlled queries (per the brief's explicit requirement) while still feeling like a real assistant, and keeping the mock-vs-real-LLM path swappable with one env var.
- **What I'd improve for a real production system:** real Supabase Auth with per-role RLS policies instead of UI-only rule enforcement; server-side WhatsApp Cloud API sending instead of client-generated deep links (so notifications don't depend on the browser being open); signed/private storage URLs; combine the interpret+format AI calls into one function-calling round trip to cut latency; and pagination for the orders list once volume grows past a few hundred rows.
- **How AI tools were used while building this:** built end-to-end with Claude Code (Anthropic) — used to scaffold the React/Vite/Tailwind project, write the Supabase schema and RLS policies, implement all pages/modules, and drive an in-browser QA pass (creating orders, walking a job through Assigned → In Progress → Job Done → Reviewed, uploading a test file, and exercising the AI query module against the live deployment) that caught and fixed several real bugs before submission: an `order_no` sequence collision with seed data, a snake_case/camelCase mismatch that kept newly-assigned orders stuck on status "New", a missing SPA rewrite that 404'd on direct route access on Vercel, and an initial design that would have put the AI provider's API key directly in client-side JS (moved to a serverless function instead once caught).

## Running it locally

```bash
npm install
# .env.local already has VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for this assessment's project
npm run dev
```

Database setup (one-time): run `supabase/schema.sql` in the Supabase project's SQL Editor. It creates all tables, RLS policies, the `attachments` storage bucket, and seeds 4 technicians + ~30 sample orders spanning the last week (including one technician with a deliberately heavy week, to demo the "overloaded technician" AI insight).

**Note on the AI module locally:** `npm run dev` runs plain Vite, which does not serve the `api/` serverless function — so the AI Query page will use its local fallback engine (still fully functional, just not calling Gemini) unless you also set `GEMINI_API_KEY` and run via `vercel dev` instead. The deployed production site (see the live demo link above) always uses real Gemini calls, since `GEMINI_API_KEY` is configured there.
