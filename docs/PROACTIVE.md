# Proactive AI — design

**Status:** detection is built and shown in the app (My Day → "Worth a look", Reviews → Patterns); nothing runs on a schedule yet. Personal OS cannot contact you on its own: no scheduler or notification service is connected. Every review today is started by you.

## What exists now

| Piece | Where | What it does |
|---|---|---|
| Behaviour statistics | `src/lib/server/insights.ts` | Deterministic facts over a time window: tasks created vs completed, repeatedly rescheduled tasks, planned-day outcomes, top-priority completion, estimate accuracy, review mood/energy, goals with no recent progress. |
| Planned-day outcomes | `daily_plan_items.outcome` | Recorded at each end-of-day review (`done` / `partial` / `moved` / `skipped`), derived from task state. |
| Reschedule counter | `tasks.reschedule_count` | Incremented by a database trigger whenever a due date moves later. |
| Manual reviews | Companion quick prompts; Reviews page buttons | "Plan my day", "Weekly review", "Monthly review", "Why do I keep postponing things?", "Am I overcommitted?" |
| AI tools | `get_behavior_insights`, `get_reviews` | Let the Companion cite the statistics above as evidence. |
| Conversation kinds | `conversations.kind` | Already allows `daily_review`, `weekly_review`, `monthly_review` for scheduled runs. |

## Checks (built)

`src/lib/findings.ts` holds pure detector functions; `src/lib/server/findings.ts` gathers their input and removes dismissed findings. A finding has a stable key, severity, title, evidence, and suggested actions.

| Check | Rule |
|---|---|
| Overload | Today's estimated open work > working hours minus fixed blocks; includes a move-to-tomorrow plan |
| Overdue follow-up | Open tasks overdue ≥ 2 days |
| Repeated postponement | Task pushed later ≥ 3 times |
| Failed priority | Same task a top priority on ≥ 2 reviewed days without being done |
| Low priority completion | < 40% of ≥ 5 reviewed top priorities done in 14 days |
| Goal stall | Active goal (≥ 14 days old) with no completed task or milestone in 14 days |
| Blocked project | Unresolved blocker ≥ 7 days old |
| Missing reviews | ≥ 3 planned days in a week, ≤ 1 reviewed |

Still to add when a scheduler exists: a morning planning reminder and a weekly summary prompt.

Checks are free (database only). Only turning a finding into an AI-written message costs API tokens, so findings should be batched into one Companion run per day at most, and respect `AI_MONTHLY_BUDGET_USD`.

## What's needed to switch it on

1. **A scheduler** — one of:
   - Vercel Cron calling a protected route (e.g. `POST /api/jobs/daily`, authorised with a secret in an environment variable), or
   - Supabase `pg_cron` + an Edge Function.
   The job runs per user, signed in as a service identity that **only** reads that user's data and writes findings, never other actions.
2. **Delivery** — findings are already computed on demand and dismissals stored (`finding_dismissals`); a scheduled job would compute them per user and send a digest of new, undismissed ones.
3. **Optional notifications** — email (e.g. Resend) or web push. Each needs explicit opt-in in Settings, a separate setup step, and possibly a paid service.
4. **Settings** — per-check on/off, quiet hours, and a daily AI-run limit.

Until those exist, the Companion's system prompt tells it to say plainly that it cannot remind or contact the user.
