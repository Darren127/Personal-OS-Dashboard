# Progress log

## Gmail Intelligence ✅ built · ⏳ live check pending your Google credentials (2026-10-25)

**Implemented**
- **Google OAuth (server-side):** authorization-code flow with PKCE, `access_type=offline`, only the `gmail.readonly` scope. CSRF `state` in a signed, HTTP-only, 10-minute cookie bound to the signed-in user. Callback `/api/gmail/callback` handles declined consent, missing scope, missing refresh token, and forged/expired state; it proves access with a real read-only Gmail request before saving. Refresh tokens are stored encrypted (AES-256-GCM, key only in the server environment). Connect, status, Reconnect, and Disconnect (revokes at Google + deletes stored email) on My Day and in Settings.
- **Gmail retrieval:** recent inbox (default 7 days, 50 messages), unread first, paginated, deduplicated by Gmail message ID (in code and by a unique constraint); only new messages are downloaded; read/unread state kept current; messages outside the window pruned. Safe MIME parsing: prefers text/plain, HTML converted to text (scripts, styles, simple hidden text removed), attachments skipped, charsets and encoded headers decoded, size and nesting bounded, broken data tolerated.
- **Claude analysis:** structured output validated with Zod — importance, summary, reason, reply needed, action required, deadlines, action items, suggested next action, confidence/uncertainty, suspicious flag. Email text is wrapped and treated as untrusted; no tools are offered. Deadlines need a verbatim quote that the server finds in the email, otherwise they're dropped. Cached by content hash (never re-analysed unless the email changes); batches of 8; up to 25 per refresh; usage logged and included in the monthly AI budget. A short AI briefing is regenerated only when the analysed set changes.
- **My Day card:** counts (important, need reply, actions & deadlines, unread), AI briefing, tabs (Urgent / Needs reply / Actions & deadlines / All), Gmail links, last sync time, Refresh, clear states (not set up, not connected, needs reconnect, sync error, not analysed). AI inferences are labelled "AI:"; deadlines show the email's own words.
- **Email → task:** only after a confirmation dialog; built on the server from the stored analysis (priority from importance, due date only from a verified deadline, Gmail link in the description, tag `email`); one task per email.
- **Never:** sends, deletes, archives, labels, or modifies email.

**Verified**
- Unit tests (24 new): MIME parsing incl. multipart, HTML-only, Latin-1, unknown charset, broken base64, deep nesting, oversized bodies, invisible characters; quote verification and invented-deadline removal; prompt wrapper can't be closed or forged by email text; token encryption (tamper/wrong-key fails); state check (missing/forged/expired/mismatched/other user); Google error classification.
- Integration tests (9, real local database, fake Gmail + fake Claude): unread-first pagination and dedupe, storing, verified analysis, briefing, no re-download/re-analysis on the second sync, no-key mode, revoked → needs reconnect, rate limit → stays connected, undecryptable token, pruning, other users can't read emails or tokens.
- Database tests (12 new, 62 total): Row Level Security, one row per Gmail message, append-only usage log, email usage in the monthly view, emails can't link to another user's tasks.
- Browser tests (6 new, 49 total, run twice): the real OAuth flow against a fake Google (state, PKCE, code exchange, refresh, revoke), sync + analysis + UI, confirm-before-task, a fully "fooled" model can't cause any action, declined consent / missing scope / forged state, revoked access → reconnect, disconnect revokes and deletes, sync endpoint refuses cross-site and signed-out calls, accessibility of the populated card in light and dark mode, phone width, Google secrets never reach the browser.
- Fixed along the way: dark-mode red text (4.48:1 → 5.3:1) and white text on red buttons in dark mode (3.4:1 → 6.6:1); light-mode amber darkened again; a timing-sensitive goals test.
- **Not verified:** a real Google consent and real Gmail data (needs your Google Cloud credentials and your browser), and Claude's real analysis quality (needs an API key). The fakes check our side of the protocol, not Google's or Claude's actual behaviour.

## Phase 5 — Quality and deployment readiness ✅ (2026-10-25)

**Implemented**
- **Repeatable browser test suite** (`npm run test:e2e`, Playwright, 43 tests): sign-in/out and 401s for signed-out API calls; Tasks; My Day (capacity, priorities, overdue, time blocks, notes, end-of-day review, one-click overload fix); Goals and Projects (metric and milestone progress, links, blockers, next action, delete keeps tasks); Reviews (patterns, hiding, weekly review); the AI Companion through the real SDK and streaming UI, answered by a test-only mock API (approve/reject, memory proposals, auto-run setting); a second user can't see the first user's data; no sideways scrolling at phone width; the mobile menu. Tests use dedicated test logins and reset only their data.
- **Accessibility**: an axe-core WCAG 2.1 AA scan of all 12 pages in light and dark mode, plus a keyboard-only test. Fixed: amber, green and red text was too faint in light mode (contrast 2.5–4.1 → now ≥ 4.5:1); added a "Skip to main content" link.
- **Security hardening**: security headers on every response (no framing, no MIME sniffing, strict referrer, camera/mic/location off, HSTS; `X-Powered-By` removed); `/api/health` now shows configuration details only to a signed-in user; a last-resort error page that never shows error details.
- **Deployment**: `docs/DEPLOYMENT.md` (Vercel + hosted Supabase, step by step, with a "Verify" check after each step and a security checklist); GitHub Actions CI (`.github/workflows/ci.yml`) running lint, type check, database, unit, integration and browser tests against a throwaway local Supabase — no secrets needed.

**Security review (what was checked)**
- All 42 data-changing server actions verify the signed-in user (the other two are sign-in and sign-out); all inputs are validated (Zod, or strict ID/boolean checks).
- All 19 tables have Row Level Security on; the anonymous role has no table access; no database function runs with elevated privileges, and all fix their `search_path`. `supabase db lint`: no issues.
- No secret value appears in any page or script sent to the browser (automated test), in the built static files, or in git-tracked files. `.env*` is git-ignored except `.env.example` (placeholders only).
- `npm audit`: 0 vulnerabilities.

**Verified**
- `npm run lint`, `npm run typecheck`, production build: pass.
- `npm test`: 57/57. `npm run db:test`: 50/50.
- `npm run test:e2e`: 43/43, run twice in a row with the same result.
- **Not verified:** the CI workflow hasn't run on GitHub yet (the code isn't pushed); no real deployment has been done (supabase.com and Vercel are unreachable from this environment); live Claude responses (no API key).

## Phase 4 — Reviews and adaptive planning ✅ (2026-10-25)

**Implemented**
- **Pattern detection ("Worth a look")** — exact, free rules over your data (no AI): today over capacity, tasks overdue 2+ days, tasks pushed back 3+ times, top priorities missed on 2+ reviewed days, a low top-priority completion rate (only with 5+ reviewed priorities — one miss is never a pattern), goals with no progress in 14 days (new goals get two weeks), projects blocked 7+ days, and planning without reviewing. Each finding shows its evidence and one-click responses. Shown on My Day (top 3) and Reviews → Patterns (all).
- **Schedule adjustment** — when today is over capacity, a concrete plan to move the lowest-priority tasks to tomorrow (never top-3 priorities, in-progress, or critical tasks), with an honest note if it still won't fit. One click applies it.
- **Dismiss / snooze** — hide until tomorrow, for a week, or until the situation changes (a task pushed back again reappears).
- **Weekly reviews** — Reviews → Weekly: the week's numbers (tasks done, top priorities done, planned/reviewed days, energy and mood, outcomes, estimate accuracy, goal progress, stalled goals, repeatedly postponed tasks), that week's daily reviews, your reflection with a 1–5 rating, history, previous/next week. A statistics snapshot is saved with each review.
- **AI integration** — the Companion sees current findings in its context; new `record_weekly_review` tool (needs approval to replace existing text); "Ask AI" buttons on findings open the Companion with the question pre-filled (never auto-sent).
- **Settings** — week starts on Monday or Sunday.
- **Scheduled reminders** — not built: no scheduler or notification service is configured. The design is in `docs/PROACTIVE.md`; the detectors are the part a scheduler would run.

**Verified**
- `npm run db:test`: 50/50 (7 new).
- `npm test`: 57/57 — unit tests for every detector rule and the adjustment planner, week helpers; integration tests for findings and dismissals against the real database, and for the weekly-review AI tool (now on a fixed clock so results don't depend on the current date).
- Browser tests: Worth a look, applying an adjustment (verified in the database), Patterns, hiding, Ask-AI pre-fill, weekly review save/history/navigation, week-start setting, mobile layout; full regression of Tasks, My Day, Goals, Projects, Companion (via the test-only mock API), Settings, and second-user isolation: all pass.
- Type check, lint, production build: pass.

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
- Deployed on Vercel with a hosted Supabase project (set up by the owner); automated tests run against a local Supabase.
- Gmail in Google's Testing mode: refresh tokens expire after 7 days, so Gmail needs reconnecting weekly (one click).
- Gmail sync is manual (Refresh); there is no background scheduler.
- **No Claude API key yet** — live AI behaviour and real costs unverified.
- No undo button for AI actions yet (the before-state is recorded, so it can be added).
- Very long conversations aren't compacted; start a new conversation per topic (server-side compaction can be enabled later).
- Goal/goal-milestone links on tasks aren't cross-checked (a task can link to goal A and a milestone of goal B — the milestone wins and overwrites the goal). Acceptable for now.
- Reordering milestones (drag-and-drop) not implemented; new milestones append.
- Invalid record URLs show a "Not found" message but return HTTP 200 (streaming limitation).
- CI workflow written but not yet run on GitHub.
- No error-monitoring service (e.g. Sentry) — deliberately not added, to avoid an extra paid service; errors go to the Vercel logs, and error screens show a reference code to search for.
- No rate limiting on the chat endpoint beyond sign-in, the monthly budget guard, and the Anthropic Console spend limit (single-user app).

## Next steps
0. Gmail: follow `docs/GMAIL_SETUP.md`, connect, and confirm a real sync works.
1. Push to GitHub and check the CI run passes.
2. Deploy following `docs/DEPLOYMENT.md`.
3. Add an Anthropic API key and do the live Companion check (tone, tool choices, real costs).
4. Optional improvements: undo for AI actions, conversation compaction, milestone reordering, scheduled reminders (`docs/PROACTIVE.md`).
