# Progress log

## Phase 3 — AI Companion ✅ built · ⏳ live-AI check pending an API key (2026-10-25)

**Implemented**
- **Engine** (`src/lib/server/ai/`): Claude Opus 5.5 by default via the official SDK, streamed; a frozen system prompt focused on honesty, evidence, and challenging assumptions; a per-turn context note appended as a system message (today's plan, due/overdue/upcoming tasks, goals and projects with progress, latest review, relevant approved memories, outcomes of earlier actions).
- **18 tools** with Zod validation: 7 read tools (search tasks, goal and project details, reviews, behaviour statistics, memories, past conversations) and 11 write tools (create task, status, priority, reschedule, link, add milestone, draft today's schedule, record daily review, propose memory, update goal, delete task).
- **Permissions:** read = always; memory = always *proposed*; low-risk = approval unless auto-run is enabled in Settings; high-risk (delete task, change goal, replace plan, overwrite review) = always approval. The AI is told truthfully whether an action ran, was queued, or failed.
- **Action log:** append-only and tamper-resistant at the database level; records input, before-state, result; approve/reject from the chat or the log page; double-approval prevented.
- **Memory:** categories, confirmed vs hypothesis, importance, AI suggestions wait for review; inspect, edit, archive, restore, delete; retrieval includes all memories while there are few, then important + text-matched ones.
- **History:** stored exactly as sent and replayed byte-for-byte (append-only; `json` column; explicit sequence), so the model's reasoning and the prompt cache stay valid across turns.
- **Cost:** prompt caching, `medium` effort, 8-call cap per message, token usage stored, monthly budget guard, estimated spend in Settings. The app uses only its own API key and the official endpoint, never credentials from the surrounding environment.
- **Safety filters:** refusals handled; server-side fallback enabled.
- **UI:** chat with streaming, progress notes, tool chips and approval cards; conversation list; quick prompts (plan my day, next action, procrastination, overcommitment, weekly and monthly reviews); Memory and Action log pages with pending counts; setup screen when no key is configured; shortcuts from My Day and Reviews.
- **Proactive foundations:** behaviour statistics module, documented design in `docs/PROACTIVE.md`. No scheduler, so nothing runs on its own.

**Verified**
- `npm run db:test`: 43/43 (15 new — append-only messages, action-log rules, AI memory rule, usage view, isolation).
- `npm test`: 39/39 — 29 unit tests plus 10 engine integration tests against the real local database with a scripted stand-in model (approval flow, auto-run rules, invalid input, refusals, failed requests, budget guard, byte-identical history replay, all read tools).
- Browser tests through the real SDK streaming path against a local test-only mock of the API: chat streaming, approve, reject, memory approval, action log, settings toggle, prefilled review prompts, no-key state, API guards (400/401/503), mobile layout; confirmed the request carries only the app's key, the right model, fallbacks, betas, and an append-only history.
- Phase 2 regression browser tests (Tasks, My Day, Goals, Projects): all pass.
- Type check, lint, production build: pass.

**Not yet verified:** real Claude responses. Everything up to the API boundary is tested; the model's actual answers, tool choices, and costs need a real API key.

**Bugs found and fixed:** JSON key reordering would have altered replayed history (switched `jsonb` → `json`); message order could be ambiguous (added `seq`); action cards could attach to the wrong message (match by message + tool call); quick prompts unreadable on the server (moved to a shared module); signed-out API calls got an HTML redirect (now 401 JSON).

## Phase 2 — Shared database and core modules ✅ (2026-10-24)

**Implemented**
- **Database:** one migration with 17 tables, composite same-owner foreign keys, indexes, triggers, progress views, and Row Level Security on every table. See `docs/DATA_MODEL.md`.
- **Local Supabase** (Docker) via the Supabase CLI, pinned as a dev dependency.
- **Login:** email + password, public sign-up disabled, `create-user` script, session refresh in `proxy.ts`, sign-out.
- **Tasks:** quick add; full create/edit form with every field; status/priority changes; completion checkbox; delete with confirmation; search plus status, due, priority, project, goal and tag filters; five sort orders.
- **My Day:** greeting and date in your timezone; progress; top 3 priorities; due today; overdue with "do it today / move to tomorrow"; upcoming deadlines (tasks, milestones, project deadlines); time blocks with overlap warning; capacity warning when estimates exceed working hours; daily notes; end-of-day review that records each planned task's outcome.
- **Life Goals:** 8 categories, 4 horizons, sub-goals, why/success criteria, metric/milestone/task/manual progress (always with its source shown), milestones, linked tasks and projects, dated review notes with progress snapshots.
- **Projects:** status/priority/dates/objective; progress; milestones; overdue tasks; blockers (optionally tied to a task); linked goals; notes; review history; rule-based next recommended action.
- **Reviews:** history of daily reviews with planned-task outcomes.
- **Settings:** name, timezone, working hours; integration status.

**Verified**
- `npm run db:test`: 28/28 pgTAP tests — cross-user isolation, anonymous access denied, same-owner links enforced, constraints, triggers, progress maths.
- `npm test`: 29/29 Vitest tests — timezone conversion (incl. daylight-saving changes), validation, recommendation rules.
- Type check, lint, production build: pass.
- Browser tests (Playwright, scripted) of every module's main journeys, against the real local database: all passed with zero console errors.
- Second-user test through the UI: sees 0 tasks/projects and gets "not found" on the first user's project URL.
- Public sign-up request rejected; anonymous API read of tasks rejected.
- No horizontal overflow at 390px on any page; dark mode renders.

**Bugs found and fixed during testing:** form contents wiped after failed submit (React 19 auto-reset); rapid filter changes reverting each other; personal pages being prerendered; empty-array filter syntax; mobile overflow on My Day; invalid list markup.

**Decisions**
- Server-only data access (no browser database client).
- Native `<select>` and plain forms + server actions instead of React Hook Form — simpler and accessible; React Hook Form can be added if a form needs it.
- Supabase CLI run locally in Docker because `supabase.com` is blocked from this container.

## Phase 1 — Environment and foundation ✅
Next.js 16 + TypeScript + Tailwind 4 app shell, theming, navigation, env validation, health endpoint.

## Remaining issues / open items
- **Not pushed to GitHub** — the cloud container is temporary.
- **No hosted Supabase project yet** (`supabase.com` blocked here); everything was verified against a local Supabase.
- **No Claude API key yet** — live AI behaviour and real costs unverified.
- No undo button for AI actions yet (the before-state is recorded, so it can be added).
- Very long conversations aren't compacted; start a new conversation per topic (server-side compaction can be enabled later).
- Goal/goal-milestone links on tasks aren't cross-checked (a task can link to goal A and a milestone of goal B — the milestone wins and overwrites the goal). Acceptable for now.
- Reordering milestones (drag-and-drop) not implemented; new milestones append.
- Invalid record URLs show a "Not found" message but return HTTP 200 (streaming limitation).
- Playwright scripts used for verification are not yet part of the repo's automated suite (Phase 5).

## Next: Phase 4 — Reviews and adaptive planning
Weekly review page with stored summaries, plan-failure detection surfaced on My Day ("worth a look"), schedule-adjustment suggestions, and optional scheduled runs once a scheduler is configured (see `docs/PROACTIVE.md`).
