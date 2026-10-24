# Progress log

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
- `ai_action_logs` is currently editable by its owner like other tables; Phase 3 should make it append-only.
- Goal/goal-milestone links on tasks aren't cross-checked (a task can link to goal A and a milestone of goal B — the milestone wins and overwrites the goal). Acceptable for now.
- Reordering milestones (drag-and-drop) not implemented; new milestones append.
- Invalid record URLs show a "Not found" message but return HTTP 200 (streaming limitation).
- Playwright scripts used for verification are not yet part of the repo's automated suite (Phase 5).

## Next: Phase 3 — AI Companion
Claude API integration (server-side), context retrieval from the database, structured memory with review/approval, validated tools with permission levels, action log UI.
