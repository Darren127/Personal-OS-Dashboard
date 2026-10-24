# Personal OS

An AI-assisted personal command centre: **My Day**, **Life Goals**, **Projects**, and an **AI Companion**, all sharing one database.

Status: **Phase 1 complete** — app shell, navigation, theming, and configuration checks. See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| App framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS 4 + shadcn/ui-style components (Radix UI primitives) |
| Database | Supabase (PostgreSQL + Row Level Security) — Phase 2 |
| AI | Anthropic Claude API via `@anthropic-ai/sdk` — Phase 3 |
| Validation | Zod |

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in real values (optional for now)
npm run dev                  # http://localhost:3000
```

Other commands:

```bash
npm run build   # production build (also type-checks)
npm run start   # serve the production build
npm run lint    # ESLint
```

The app runs without any credentials. **Settings** shows which integrations are configured (it never displays values), and `/api/health` returns the same information as JSON.

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Where it's used | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Server + browser | No (public by design) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Server + browser | No — data is protected by Row Level Security |
| `SUPABASE_SECRET_KEY` | Server only | **Yes** |
| `ANTHROPIC_API_KEY` | Server only | **Yes** — pay-as-you-go API billing, not part of Claude Pro |
| `ANTHROPIC_MODEL` | Server only | No (optional) |
| `AI_MONTHLY_BUDGET_USD` | Server only | No (optional) |

Real values go in `.env.local`, which Git ignores. Server-only configuration lives in `src/lib/server/`, guarded by the `server-only` package so it can't be bundled into browser code.

## Project layout

```
src/
  app/                 Routes (one folder per page) and API routes
    api/health/        Health and configuration check
  components/          Shared UI (app shell, empty states, theme)
    ui/                Base components (button, card, badge, sheet)
  lib/                 Shared helpers (navigation, utils)
    server/            Server-only code (env, later: database and AI)
```

## Next.js 16 notes

This Next.js version has breaking changes. Bundled docs are in `node_modules/next/dist/docs/`. In particular:

- Middleware is now `proxy.ts`.
- `params`, `searchParams`, and `cookies()` must be awaited.
- `cacheComponents` is on: request-time data must be read inside `<Suspense>` (or after `await connection()`). Personal data is never cached with `"use cache"`.
