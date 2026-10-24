# Personal OS

An AI-assisted personal command centre: **My Day**, **Tasks**, **Life Goals**, **Projects**, and (from Phase 3) an **AI Companion**, all on one shared database.

Status: **Phase 2 complete.** See [`docs/PROGRESS.md`](docs/PROGRESS.md) and the data model in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, Turbopack), React 19 |
| Styling | Tailwind CSS 4, shadcn/ui-style components on Radix UI |
| Database & login | Supabase (PostgreSQL, Row Level Security, Auth) |
| Validation | Zod (every server action validates its input) |
| Tests | pgTAP (database), Vitest (logic) |
| AI | Anthropic Claude API — Phase 3 |

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
| `npm test` | Unit tests (Vitest) |
| `npm run db:test` | Database tests: security rules, constraints, triggers (needs `db:start`) |
| `npm run db:start` / `db:stop` | Start/stop local Supabase (data is kept between restarts) |
| `npm run db:types` | Regenerate TypeScript types after a schema change |
| `npm run create-user -- <email>` | Create a login |

## Environment variables

See [`.env.example`](.env.example).

| Variable | Used by | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Server | No — public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Server | No — data is protected by Row Level Security |
| `SUPABASE_SECRET_KEY` | `create-user` script only | **Yes** — bypasses security rules; never in the app |
| `ANTHROPIC_API_KEY` | Server (Phase 3) | **Yes** — pay-as-you-go API billing, not part of Claude Pro |
| `ANTHROPIC_MODEL`, `AI_MONTHLY_BUDGET_USD` | Server (Phase 3) | No (optional) |

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
tests/unit/         Vitest tests
```
