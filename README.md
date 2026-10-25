# Personal OS

An AI-assisted personal command centre: **My Day**, **Tasks**, **Life Goals**, **Projects**, **Reviews**, an **AI Companion**, and **Gmail Intelligence**, all on one shared database.

Status: **Phase 5 complete — ready to deploy** (live-AI verification still pending an API key). Deploy with [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). See [`docs/PROGRESS.md`](docs/PROGRESS.md), the data model in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), and the proactive-features design in [`docs/PROACTIVE.md`](docs/PROACTIVE.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, Turbopack), React 19 |
| Styling | Tailwind CSS 4, shadcn/ui-style components on Radix UI |
| Database & login | Supabase (PostgreSQL, Row Level Security, Auth) |
| Validation | Zod (every server action validates its input) |
| Tests | pgTAP (database), Vitest (logic + engine integration), Playwright + axe-core (browser, accessibility) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Email | Gmail API (`@googleapis/gmail`) with Google OAuth (`google-auth-library`), read-only |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Running locally

You need Node.js 20.9+ and Docker (for a local copy of Supabase).

```bash
npm install
npm run db:start                 # starts local Supabase in Docker and applies migrations
npx supabase status -o env       # shows local URL and keys
```

Create `.env.local` (git-ignored) using those values:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from status>
SUPABASE_SECRET_KEY=<SECRET_KEY from status>
```

Then create your login and start the app:

```bash
npm run create-user -- you@example.com   # prompts for a password (min 10 characters)
npm run dev                              # http://localhost:3000
```

Public sign-up is disabled — `create-user` is the only way to make an account.

## Using a hosted Supabase project

The full step-by-step (including Vercel) is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). In short:

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema from this repo (never hand-edit tables in production):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. In the Supabase dashboard's Authentication settings, **turn off new user sign-ups**.
4. Copy the project URL, publishable key, and secret key (Project Settings → API keys) into `.env.local`.
5. `npm run create-user -- you@example.com`

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm test` | Unit tests, plus AI-engine integration tests against the local database (skipped if it isn't running) |
| `npm run db:test` | Database tests: security rules, constraints, triggers (needs `db:start`) |
| `npm run test:e2e` | Builds the app, then runs the browser tests (needs `db:start`; see below) |
| `npm run db:start` / `db:stop` | Start/stop local Supabase (data is kept between restarts) |
| `npm run db:types` | Regenerate TypeScript types after a schema change |
| `npm run create-user -- <email>` | Create a login |

## Tests

| Suite | Where | What it covers |
| --- | --- | --- |
| Database (pgTAP) | `supabase/tests/database/` | Row Level Security between users, constraints, triggers, the append-only AI log |
| Unit (Vitest) | `tests/unit/` | Dates and timezones, validation, recommendations, pattern detectors |
| Integration (Vitest) | `tests/integration/` | The AI engine's tool loop and approvals against the real local database, with a scripted stand-in model |
| Browser (Playwright) | `tests/e2e/` | Sign-in, every module's main journeys, the Companion through the real streaming UI, Gmail OAuth/sync/analysis against a fake Google (`mock-google.mjs`), data isolation between two users, phone-width layout, keyboard use, security headers, no secrets in the browser, and an axe-core WCAG 2.1 AA scan of every page in light and dark mode |

The browser tests create two test logins (`e2e@personal-os.local`, `e2e-other@personal-os.local`) in the **local** database and reset their data before each test; your own account is never touched. The Companion is answered by `tests/e2e/mock-anthropic.mjs`, a test-only fake of the Claude API, so the tests cost nothing and need no key. First time on a new computer: `npx playwright install chromium`.

## Environment variables

See [`.env.example`](.env.example).

| Variable | Used by | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Server | No — public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Server | No — data is protected by Row Level Security |
| `SUPABASE_SECRET_KEY` | `create-user` script and local tests only | **Yes** — bypasses security rules; never in the app |
| `ANTHROPIC_API_KEY` | Server only | **Yes** — pay-as-you-go API billing, not part of Claude Pro |
| `ANTHROPIC_MODEL` | Server | No — default `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | Server | No — `low` / `medium` (default) / `high` / `xhigh` / `max` |
| `AI_MONTHLY_BUDGET_USD` | Server | No — AI features stop when estimated monthly spend (Companion + email analysis) reaches it |
| `GOOGLE_CLIENT_ID` | Server | No — but keep it with the secret |
| `GOOGLE_CLIENT_SECRET` | Server only | **Yes** — Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Server | No — `<app address>/api/gmail/callback`, registered in Google Cloud |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Server only | **Yes** — encrypts stored Gmail refresh tokens (32 bytes, base64) |
| `GMAIL_SYNC_DAYS`, `GMAIL_SYNC_MAX_MESSAGES`, `GMAIL_ANALYZE_MAX`, `GMAIL_ANALYSIS_EFFORT` | Server | No — optional tuning (defaults 7 days, 50 messages, 25 analysed per refresh, `low`) |

## AI Companion

The Companion chats with you using your real data and can act on it through validated tools.

**Setup:** create an API key at [console.anthropic.com](https://console.anthropic.com) (billed per use, separately from Claude Pro), set a spending limit there, put it in `ANTHROPIC_API_KEY`, and restart. Optionally set `AI_MONTHLY_BUDGET_USD`.

**What it can see:** a fresh snapshot each turn (today's plan, due and overdue tasks, current goals and projects with progress, the latest review, relevant approved memories), plus tools to search tasks, read goal/project details, reviews, behaviour statistics, memories, and past conversations.

**What it can do, and who decides:**

| Risk | Examples | Behaviour |
|---|---|---|
| Read | search tasks, read a goal | Always allowed |
| Memory | propose a memory | Saved as *proposed*; nothing is remembered until you approve it on the Memory page |
| Low | create a task, change status/priority/due date, link a task, add a milestone, save a first daily review | Waits for approval, unless you enable auto-run in Settings |
| High | delete a task, change a goal, replace today's plan, overwrite a review | Always waits for approval |

Every proposed or executed change is written to an append-only action log (`/companion/actions`) with the state before the change. The AI is only told an action succeeded when the database confirms it.

**Cost controls:** prompt caching, `medium` effort by default, at most 8 model calls per message, per-request token usage stored, and the monthly budget guard. Estimated spend is shown in Settings.

**API features used:** adaptive thinking with progress updates, server-side refusal fallbacks (`fallbacks: "default"`), and append-only history with `drop_block` so conversations survive system-prompt changes between releases.

## Gmail Intelligence

Read-only Gmail triage on My Day: important-email counts, urgent emails, replies owed, action items and deadlines, an AI briefing, links back to Gmail, last sync time, and a Refresh button. Setup (Google Cloud Console, step by step): [`docs/GMAIL_SETUP.md`](docs/GMAIL_SETUP.md).

- **OAuth:** authorization-code flow with PKCE and offline access; the CSRF `state` lives in a signed, HTTP-only cookie bound to the signed-in user; callback at `/api/gmail/callback`. Before saving, one real Gmail request proves the access works. Refresh tokens are stored AES-256-GCM-encrypted; Disconnect revokes them at Google and deletes stored email.
- **Sync** (`src/lib/server/gmail/sync.ts`): unread first, then the rest of the window; paginated; deduplicated by Gmail message ID; only new messages are downloaded; MIME parsing (`src/lib/email/mime.ts`) prefers plain text, skips attachments, bounds size and depth; expired/revoked access marks the connection "needs reconnect".
- **Analysis** (`src/lib/server/gmail/analyze.ts`): Claude with structured output (a Zod schema), no tools offered, email text wrapped and treated as untrusted data. Deadlines and action items must quote the email verbatim — the server checks the quote and drops deadlines it can't find. Results are cached by content hash; usage is logged and counts toward the monthly budget.
- **Tasks:** an action item becomes a task only after you confirm it in a dialog; the task is built on the server from the stored analysis and links back to the email.

## How it's built (short version)

- **All database access happens on the server**, as the signed-in user, so Row Level Security applies to every query. The browser never talks to the database directly.
- **Tasks are stored once.** My Day, goals, and projects reference tasks by ID.
- **Progress is calculated, not typed in** — from a goal's metric, its milestones, or linked tasks (database views `goal_progress`, `project_progress`). A manual estimate is possible but labelled as such.
- **"Today" is in your timezone** (Settings), not the server's.
- `src/proxy.ts` refreshes the login session and redirects signed-out visitors (Next.js 16 renamed "middleware" to "proxy").

```
src/
  app/(app)/        Signed-in pages: My Day, tasks, goals, projects, reviews, settings
  app/(auth)/login  Sign-in page
  app/actions/      Server actions (all writes; validated with Zod)
  components/       UI (tasks/, my-day/, goals/, projects/, shared/, ui/)
  lib/server/       Server-only data loading
  lib/validation/   Zod schemas
supabase/
  migrations/       Reproducible SQL schema
  tests/database/   pgTAP tests
tests/unit/         Vitest unit tests
tests/integration/  Vitest tests against the local database
tests/e2e/          Playwright browser tests
docs/               Progress log, data model, deployment guide
```
