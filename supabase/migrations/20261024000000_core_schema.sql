-- =============================================================================
-- Personal OS — core schema
--
-- One shared data model for My Day, Tasks, Life Goals, Projects, Reviews and
-- the AI Companion. Tasks are stored once in `tasks`; every other module
-- references them by ID.
--
-- Ownership: every row has `user_id`. Row Level Security (RLS) limits each
-- signed-in user to their own rows. Cross-table links use composite foreign
-- keys on (id, user_id) so a row can only reference rows with the same owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.task_status as enum
  ('inbox', 'next', 'in_progress', 'waiting', 'done', 'cancelled');

create type public.priority_level as enum ('low', 'medium', 'high', 'critical');

create type public.goal_category as enum
  ('career', 'finance', 'health_fitness', 'learning', 'personal_growth',
   'relationships', 'business', 'other');

create type public.goal_horizon as enum
  ('long_term', 'annual', 'quarterly', 'short_term');

create type public.goal_status as enum
  ('not_started', 'active', 'on_hold', 'achieved', 'abandoned');

-- How a goal's progress is calculated. `auto` picks the first available of:
-- metric → milestones → tasks. `manual` is an explicit, visible opt-out.
create type public.progress_method as enum
  ('auto', 'metric', 'milestones', 'tasks', 'manual');

create type public.project_status as enum
  ('planning', 'active', 'on_hold', 'completed', 'cancelled');

create type public.plan_item_outcome as enum
  ('done', 'partial', 'skipped', 'moved');

create type public.memory_category as enum
  ('preference', 'long_term_goal', 'working_style', 'recurring_obstacle',
   'decision', 'lesson', 'behavioural_observation');

create type public.memory_confidence as enum ('confirmed', 'hypothesis');

create type public.memory_status as enum
  ('proposed', 'approved', 'rejected', 'archived');

create type public.ai_action_status as enum
  ('proposed', 'approved', 'rejected', 'executed', 'failed');

create type public.ai_risk_level as enum ('low', 'high');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- User preferences (one row per user)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  work_day_start time not null default '09:00',
  work_day_end time not null default '17:30',
  -- AI permissions (Phase 3). Off by default: the AI must ask first.
  ai_auto_execute_low_risk boolean not null default false,
  ai_model text check (char_length(ai_model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_day_end > work_day_start)
);

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- A large goal can be broken into smaller sub-goals (e.g. annual → quarterly).
  parent_goal_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  category public.goal_category not null default 'other',
  horizon public.goal_horizon not null default 'annual',
  why_it_matters text check (char_length(why_it_matters) <= 5000),
  success_criteria text check (char_length(success_criteria) <= 5000),
  target_date date,
  status public.goal_status not null default 'active',
  progress_method public.progress_method not null default 'auto',
  -- Optional measurable metric, e.g. "Savings" from 0 to 10000 "USD".
  metric_name text check (char_length(metric_name) <= 100),
  metric_unit text check (char_length(metric_unit) <= 30),
  metric_start numeric,
  metric_target numeric,
  metric_current numeric,
  -- Only used when progress_method = 'manual'.
  manual_progress smallint check (manual_progress between 0 and 100),
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (parent_goal_id is null or parent_goal_id <> id),
  foreign key (parent_goal_id, user_id)
    references public.goals (id, user_id) on delete set null (parent_goal_id)
);

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  goal_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create table public.goal_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  goal_id uuid not null,
  review_date date not null default current_date,
  notes text not null check (char_length(notes) between 1 and 10000),
  -- Progress at the time of the review, for history. Copied from goal_progress.
  progress_snapshot smallint check (progress_snapshot between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 5000),
  objective text check (char_length(objective) <= 2000),
  status public.project_status not null default 'planning',
  priority public.priority_level not null default 'medium',
  start_date date,
  target_date date,
  notes text check (char_length(notes) <= 20000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (target_date is null or start_date is null or target_date >= start_date)
);

-- A project can serve several goals; a goal can have several projects.
create table public.project_goals (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  goal_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, goal_id),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete cascade
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create table public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  review_date date not null default current_date,
  notes text not null check (char_length(notes) between 1 and 10000),
  progress_snapshot smallint check (progress_snapshot between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Tasks — the single source of truth for every actionable item
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 10000),
  status public.task_status not null default 'inbox',
  priority public.priority_level not null default 'medium',
  due_date date,
  start_date date,
  scheduled_start timestamptz,
  estimated_minutes integer check (estimated_minutes between 1 and 10080),
  actual_minutes integer check (actual_minutes between 0 and 100000),
  -- Optional links. Any combination (or none) is allowed.
  project_id uuid,
  goal_id uuid,
  project_milestone_id uuid,
  goal_milestone_id uuid,
  tags text[] not null default '{}'
    check (cardinality(tags) <= 20),
  completed_at timestamptz,
  -- How many times the due date was pushed later. A planning-failure signal.
  reschedule_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete set null (project_id),
  foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete set null (goal_id),
  foreign key (project_milestone_id, user_id)
    references public.project_milestones (id, user_id)
    on delete set null (project_milestone_id),
  foreign key (goal_milestone_id, user_id)
    references public.goal_milestones (id, user_id)
    on delete set null (goal_milestone_id)
);

-- Blockers may point at the specific task that is stuck.
create table public.project_blockers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  project_id uuid not null,
  task_id uuid,
  description text not null check (char_length(description) between 1 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);

-- Task bookkeeping: completion timestamp, reschedule counting, and keeping
-- goal/project links consistent with a linked milestone.
create function public.tasks_before_write() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked uuid;
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if tg_op = 'UPDATE' and old.due_date is not null and new.due_date > old.due_date then
    new.reschedule_count := old.reschedule_count + 1;
  end if;

  if new.goal_milestone_id is not null then
    select goal_id into linked from public.goal_milestones
      where id = new.goal_milestone_id and user_id = new.user_id;
    new.goal_id := linked;
  end if;

  if new.project_milestone_id is not null then
    select project_id into linked from public.project_milestones
      where id = new.project_milestone_id and user_id = new.user_id;
    new.project_id := linked;
  end if;

  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------------------------
-- Daily plans and reviews
-- ---------------------------------------------------------------------------
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  plan_date date not null,
  intention text check (char_length(intention) <= 500),
  notes text check (char_length(notes) <= 20000),
  available_minutes integer check (available_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, plan_date)
);

-- An entry in a day's plan: a reference to an existing task (optionally one of
-- the top three priorities and/or given a time block), or a non-task time
-- block such as "Lunch" (title only).
create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  plan_id uuid not null,
  task_id uuid,
  title text check (char_length(title) <= 200),
  priority_rank smallint check (priority_rank between 1 and 3),
  start_time time,
  end_time time,
  outcome public.plan_item_outcome,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (task_id is not null or title is not null),
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time),
  unique (plan_id, task_id),
  unique (plan_id, priority_rank),
  foreign key (plan_id, user_id)
    references public.daily_plans (id, user_id) on delete cascade,
  foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);

create table public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  review_date date not null,
  wins text check (char_length(wins) <= 5000),
  challenges text check (char_length(challenges) <= 5000),
  lessons text check (char_length(lessons) <= 5000),
  tomorrow_focus text check (char_length(tomorrow_focus) <= 2000),
  energy smallint check (energy between 1 and 5),
  mood smallint check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

-- ---------------------------------------------------------------------------
-- AI Companion (used from Phase 3)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 200),
  kind text not null default 'chat'
    check (kind in ('chat', 'daily_review', 'weekly_review', 'monthly_review')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  -- Plain text for display and search; full API content blocks for replay.
  text_content text not null default '',
  content jsonb not null default '[]'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade
);

-- Structured long-term memory. Nothing is permanent until approved.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  category public.memory_category not null,
  content text not null check (char_length(content) between 1 and 2000),
  confidence public.memory_confidence not null default 'hypothesis',
  status public.memory_status not null default 'proposed',
  -- How many separate occasions support this memory. One incident ≠ a pattern.
  evidence_count integer not null default 1 check (evidence_count >= 1),
  importance smallint not null default 3 check (importance between 1 and 5),
  source_conversation_id uuid,
  last_referenced_at timestamptz,
  search tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete set null (source_conversation_id)
);

-- Audit trail of everything the AI proposed or did.
create table public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  conversation_id uuid,
  message_id uuid,
  tool_name text not null check (char_length(tool_name) <= 100),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  -- State of the affected record before the change, so it can be reviewed.
  before_state jsonb,
  status public.ai_action_status not null default 'proposed',
  risk_level public.ai_risk_level not null default 'low',
  entity_type text,
  entity_id uuid,
  error text,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete set null (conversation_id),
  foreign key (message_id, user_id)
    references public.conversation_messages (id, user_id)
    on delete set null (message_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_preferences', 'goals', 'goal_milestones', 'projects',
    'project_milestones', 'project_blockers', 'tasks', 'daily_plans',
    'daily_plan_items', 'daily_reviews', 'conversations', 'memories'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes (every foreign key, plus the common filters)
-- ---------------------------------------------------------------------------
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_open_idx on public.tasks (user_id, due_date)
  where status not in ('done', 'cancelled');
create index tasks_user_completed_idx on public.tasks (user_id, completed_at)
  where completed_at is not null;
create index tasks_project_idx on public.tasks (project_id);
create index tasks_goal_idx on public.tasks (goal_id);
create index tasks_project_milestone_idx on public.tasks (project_milestone_id);
create index tasks_goal_milestone_idx on public.tasks (goal_milestone_id);
create index tasks_tags_idx on public.tasks using gin (tags);

create index goals_user_status_idx on public.goals (user_id, status);
create index goals_parent_idx on public.goals (parent_goal_id);
create index goal_milestones_goal_idx on public.goal_milestones (goal_id, position);
create index goal_reviews_goal_idx on public.goal_reviews (goal_id, review_date desc);

create index projects_user_status_idx on public.projects (user_id, status);
create index project_goals_goal_idx on public.project_goals (goal_id);
create index project_milestones_project_idx on public.project_milestones (project_id, position);
create index project_blockers_project_idx on public.project_blockers (project_id)
  where resolved_at is null;
create index project_blockers_task_idx on public.project_blockers (task_id);
create index project_reviews_project_idx on public.project_reviews (project_id, review_date desc);

create index daily_plan_items_plan_idx on public.daily_plan_items (plan_id);
create index daily_plan_items_task_idx on public.daily_plan_items (task_id);
create index daily_reviews_user_date_idx on public.daily_reviews (user_id, review_date desc);

create index conversations_user_idx on public.conversations (user_id, updated_at desc);
create index conversation_messages_conv_idx
  on public.conversation_messages (conversation_id, created_at);
create index memories_user_status_idx on public.memories (user_id, status, category);
create index memories_search_idx on public.memories using gin (search);
create index memories_source_idx on public.memories (source_conversation_id);
create index ai_action_logs_user_idx on public.ai_action_logs (user_id, created_at desc);
create index ai_action_logs_conv_idx on public.ai_action_logs (conversation_id);
create index ai_action_logs_message_idx on public.ai_action_logs (message_id);

-- ---------------------------------------------------------------------------
-- Calculated progress (views run with the caller's permissions, so RLS applies)
-- ---------------------------------------------------------------------------
create view public.goal_progress with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  ms.total as milestones_total,
  ms.done as milestones_done,
  tk.total as tasks_total,
  tk.done as tasks_done,
  m.metric_pct,
  case
    when g.progress_method = 'manual' then 'manual'
    when g.progress_method = 'metric' or (g.progress_method = 'auto' and m.metric_pct is not null) then 'metric'
    when g.progress_method = 'milestones' or (g.progress_method = 'auto' and ms.total > 0) then 'milestones'
    when g.progress_method = 'tasks' or (g.progress_method = 'auto' and tk.total > 0) then 'tasks'
    else 'none'
  end as progress_source,
  case
    when g.progress_method = 'manual' then g.manual_progress::numeric
    when g.progress_method = 'metric' or (g.progress_method = 'auto' and m.metric_pct is not null) then m.metric_pct
    when g.progress_method = 'milestones' or (g.progress_method = 'auto' and ms.total > 0)
      then case when ms.total > 0 then round(100.0 * ms.done / ms.total) end
    when g.progress_method = 'tasks' or (g.progress_method = 'auto' and tk.total > 0)
      then case when tk.total > 0 then round(100.0 * tk.done / tk.total) end
  end as progress
from public.goals g
cross join lateral (
  select
    case
      when g.metric_start is not null and g.metric_target is not null
       and g.metric_current is not null and g.metric_target <> g.metric_start
      then greatest(0, least(100, round(
        100.0 * (g.metric_current - g.metric_start) / (g.metric_target - g.metric_start))))
    end as metric_pct
) m
cross join lateral (
  select count(*)::int as total, count(completed_at)::int as done
  from public.goal_milestones where goal_id = g.id
) ms
cross join lateral (
  select
    count(*) filter (where status <> 'cancelled')::int as total,
    count(*) filter (where status = 'done')::int as done
  from public.tasks where goal_id = g.id
) tk;

create view public.project_progress with (security_invoker = true) as
select
  p.id as project_id,
  p.user_id,
  ms.total as milestones_total,
  ms.done as milestones_done,
  ms.next_due as next_milestone_due,
  tk.total as tasks_total,
  tk.done as tasks_done,
  bl.open as open_blockers,
  case
    when tk.total > 0 then 'tasks'
    when ms.total > 0 then 'milestones'
    else 'none'
  end as progress_source,
  case
    when tk.total > 0 then round(100.0 * tk.done / tk.total)
    when ms.total > 0 then round(100.0 * ms.done / ms.total)
  end as progress
from public.projects p
cross join lateral (
  select count(*)::int as total, count(completed_at)::int as done,
         min(due_date) filter (where completed_at is null) as next_due
  from public.project_milestones where project_id = p.id
) ms
cross join lateral (
  select
    count(*) filter (where status <> 'cancelled')::int as total,
    count(*) filter (where status = 'done')::int as done
  from public.tasks where project_id = p.id
) tk
cross join lateral (
  select count(*)::int as open
  from public.project_blockers where project_id = p.id and resolved_at is null
) bl;

-- ---------------------------------------------------------------------------
-- Row Level Security: each signed-in user can only touch their own rows.
-- Anonymous visitors get nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_preferences', 'goals', 'goal_milestones', 'goal_reviews',
    'projects', 'project_goals', 'project_milestones', 'project_reviews',
    'project_blockers', 'tasks', 'daily_plans', 'daily_plan_items',
    'daily_reviews', 'conversations', 'conversation_messages', 'memories',
    'ai_action_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "Owner can read" on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Owner can delete" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

revoke all on public.goal_progress, public.project_progress from anon;
