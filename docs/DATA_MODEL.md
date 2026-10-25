# Data model

Defined in `supabase/migrations/20261024000000_core_schema.sql`. Every table has `user_id`, Row Level Security, and `created_at` (most also `updated_at`).

```
goals ─┬─< goal_milestones            projects ─┬─< project_milestones
       ├─< goal_reviews                         ├─< project_reviews
       └─< goals (parent_goal_id)               └─< project_blockers ──> tasks (optional)
goals >──< projects   (via project_goals)

tasks ──> projects?  goals?  project_milestones?  goal_milestones?   (all optional)

daily_plans ─< daily_plan_items ──> tasks?   (top-3 rank, time block, outcome)
daily_reviews (one per day)

conversations ─< conversation_messages        (Phase 3)
memories (proposed → approved; confirmed vs hypothesis)
ai_action_logs (every AI proposal/action, with before-state)
user_preferences (timezone, working hours, AI permissions)
```

## Key rules

- **One task, many views.** A task is a single row. Projects, goals, milestones and daily plans point at it.
- **Same-owner links.** Foreign keys are composite `(id, user_id)`, so a row can only reference rows owned by the same user — enforced by the database itself.
- **Deleting a project or goal unlinks its tasks** rather than deleting them. Deleting a task removes it from daily plans.
- **Task bookkeeping** (trigger `tasks_before_write`): sets `completed_at` when marked done; increments `reschedule_count` when the due date moves later; linking a milestone sets the matching goal/project.
- **Progress views** (`goal_progress`, `project_progress`) compute progress with the caller's permissions:
  - Goals (`auto`): metric → milestones → linked tasks; or an explicit method; `manual` only if chosen.
  - Projects: linked tasks (excluding cancelled), else milestones.
- **Daily plan outcomes** are recorded when the end-of-day review is saved: `done`, `partial` (in progress), `moved` (due date pushed later), `skipped`.

## AI Companion tables

- **`conversation_messages`** stores every message exactly as sent to the Claude API: `content` is `json` (not `jsonb`, which would reorder keys), ordered by `seq`. It is **append-only** — users can't update or delete individual messages (deleting a conversation removes them). `role` can be `system` for the per-turn context notes; `visible = false` hides context notes and tool results from the transcript. Token usage per model call is stored for cost tracking.
- **`ai_action_logs`** is an audit trail: no deletes; only outcome columns can be updated, and status can only move forward (proposed → approved/rejected; approved → executed/failed).
- **`memories`**: `created_by` is `user` or `ai`; an AI-created memory must start as `proposed`.
- **`ai_usage_monthly`** (view): tokens per model per month, for the spending guard.

## Reviews and patterns

- **`weekly_reviews`** — one per user per week (`week_start` follows the user's week-start setting): reflection fields, 1–5 rating, an optional AI summary, and `stats`, a snapshot of the week's numbers when it was saved.
- **`finding_dismissals`** — pattern findings are computed on the fly, never stored; this table only records which finding keys the user hid and until when. Keys change when the situation changes, so a hidden finding returns if things get worse.
