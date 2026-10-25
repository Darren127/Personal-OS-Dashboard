-- =============================================================================
-- Personal OS — Gmail Intelligence
--
-- Read-only Gmail access: a connection per user, a cache of recent messages
-- (only what the analysis needs), Claude's structured analysis of each, and a
-- log of analysis requests so their cost counts toward the monthly AI budget.
-- =============================================================================

create type public.gmail_connection_status as enum ('active', 'needs_reconnect');
create type public.email_importance as enum ('critical', 'high', 'medium', 'low');

-- One Gmail account per user. The refresh token is stored encrypted
-- (AES-256-GCM) with a key that exists only in the server environment, so a
-- copy of this row is useless without it.
create table public.gmail_connections (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  google_email text not null check (char_length(google_email) <= 320),
  refresh_token_enc text not null check (char_length(refresh_token_enc) <= 4000),
  scopes text[] not null default '{}',
  status public.gmail_connection_status not null default 'active',
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text check (char_length(last_sync_error) <= 1000),
  last_sync_error_at timestamptz,
  briefing text check (char_length(briefing) <= 4000),
  briefing_at timestamptz,
  -- Which analyses the briefing was written from, to skip regenerating it.
  briefing_source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.gmail_connections
  for each row execute function public.set_updated_at();

-- Recent messages, deduplicated by Gmail's message ID. `body_excerpt` is the
-- readable text, capped, kept only so analysis can be cached and re-run.
-- Messages are pruned once they fall outside the sync window.
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  provider_message_id text not null check (char_length(provider_message_id) <= 200),
  thread_id text not null check (char_length(thread_id) <= 200),
  from_name text check (char_length(from_name) <= 300),
  from_email text check (char_length(from_email) <= 320),
  subject text check (char_length(subject) <= 1000),
  snippet text check (char_length(snippet) <= 1000),
  body_excerpt text check (char_length(body_excerpt) <= 20000),
  received_at timestamptz not null,
  is_unread boolean not null default false,
  label_ids text[] not null default '{}',
  -- Hash of exactly what was sent for analysis; a change means re-analyse.
  content_hash text not null,
  -- Claude's structured analysis (validated by the app before saving).
  analysis jsonb,
  importance public.email_importance,
  needs_reply boolean,
  action_required boolean,
  analysis_model text,
  analysis_content_hash text,
  analyzed_at timestamptz,
  -- Set when the user turned this email's action item into a task.
  task_id uuid,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_message_id),
  foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);

create trigger set_updated_at before update on public.email_messages
  for each row execute function public.set_updated_at();
create index email_messages_user_received_idx on public.email_messages (user_id, received_at desc);

-- One row per Claude request made for email analysis (token usage only; no content).
create table public.email_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  kind text not null check (kind in ('triage', 'briefing')),
  model text not null,
  message_count integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index email_analysis_runs_user_created_idx on public.email_analysis_runs (user_id, created_at);

do $$
declare
  t text;
begin
  foreach t in array array['gmail_connections', 'email_messages', 'email_analysis_runs'] loop
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

-- The usage log is append-only: it feeds the spending guard.
revoke update, delete on public.email_analysis_runs from authenticated;
drop policy "Owner can update" on public.email_analysis_runs;
drop policy "Owner can delete" on public.email_analysis_runs;

-- Monthly AI usage now includes email analysis, so one budget covers both.
create or replace view public.ai_usage_monthly with (security_invoker = true) as
select
  user_id,
  month,
  model,
  sum(requests)::int as requests,
  sum(input_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(cache_read_input_tokens)::bigint as cache_read_input_tokens,
  sum(cache_creation_input_tokens)::bigint as cache_creation_input_tokens
from (
  select
    user_id,
    date_trunc('month', created_at)::date as month,
    model,
    count(*) as requests,
    coalesce(sum(input_tokens), 0) as input_tokens,
    coalesce(sum(output_tokens), 0) as output_tokens,
    coalesce(sum(cache_read_input_tokens), 0) as cache_read_input_tokens,
    coalesce(sum(cache_creation_input_tokens), 0) as cache_creation_input_tokens
  from public.conversation_messages
  where role = 'assistant' and model is not null
  group by 1, 2, 3
  union all
  select
    user_id,
    date_trunc('month', created_at)::date,
    model,
    count(*),
    sum(input_tokens),
    sum(output_tokens),
    sum(cache_read_input_tokens),
    sum(cache_creation_input_tokens)
  from public.email_analysis_runs
  group by 1, 2, 3
) usage
group by user_id, month, model;

revoke all on public.ai_usage_monthly from anon;
