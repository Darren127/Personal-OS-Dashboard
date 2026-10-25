-- =============================================================================
-- Personal OS — AI Companion
--
-- Conversation history is stored exactly as it was sent to the Claude API and
-- is append-only: the API ties the model's reasoning to the exact history, so
-- rows are never edited after insert. The AI action log is an audit trail:
-- rows can't be deleted, and only their outcome columns can change, in a valid
-- order (proposed → approved/rejected → executed/failed).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Conversation messages
-- ---------------------------------------------------------------------------
alter table public.conversation_messages
  drop constraint conversation_messages_role_check;
alter table public.conversation_messages
  add constraint conversation_messages_role_check
    check (role in ('user', 'assistant', 'system'));

alter table public.conversation_messages
  -- false for tool results and the per-turn context notes the app appends.
  add column visible boolean not null default true,
  add column stop_reason text,
  add column cache_read_input_tokens integer,
  add column cache_creation_input_tokens integer,
  add column search tsvector
    generated always as (to_tsvector('english', text_content)) stored;

create index conversation_messages_search_idx
  on public.conversation_messages using gin (search) where visible;

-- Append-only: no edits or deletes of individual messages. Deleting a whole
-- conversation still removes its messages (foreign-key cascade).
revoke update, delete on public.conversation_messages from authenticated;
drop policy "Owner can update" on public.conversation_messages;
drop policy "Owner can delete" on public.conversation_messages;

-- ---------------------------------------------------------------------------
-- Memories: record who created each one
-- ---------------------------------------------------------------------------
alter table public.memories
  add column created_by text not null default 'user'
    check (created_by in ('user', 'ai'));

-- An AI-created memory can never start out approved: the user decides.
create function public.memories_ai_must_propose() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by = 'ai' and tg_op = 'INSERT' and new.status <> 'proposed' then
    raise exception 'AI-created memories must start as proposed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger memories_ai_must_propose
  before insert on public.memories
  for each row execute function public.memories_ai_must_propose();

-- ---------------------------------------------------------------------------
-- AI action log: append-only audit trail
-- ---------------------------------------------------------------------------
alter table public.ai_action_logs
  add column summary text check (char_length(summary) <= 500),
  add column tool_use_id text check (char_length(tool_use_id) <= 100);

revoke update, delete on public.ai_action_logs from authenticated;
grant update (status, result, error, before_state, entity_type, entity_id, decided_at, executed_at)
  on public.ai_action_logs to authenticated;
drop policy "Owner can delete" on public.ai_action_logs;

create function public.ai_action_logs_valid_transition() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status = 'proposed' and new.status in ('approved', 'rejected', 'executed', 'failed'))
     or (old.status = 'approved' and new.status in ('executed', 'failed')) then
    return new;
  end if;
  raise exception 'Invalid action status change: % -> %', old.status, new.status
    using errcode = '23514';
end;
$$;

create trigger ai_action_logs_valid_transition
  before update on public.ai_action_logs
  for each row execute function public.ai_action_logs_valid_transition();

create index ai_action_logs_pending_idx
  on public.ai_action_logs (user_id, created_at desc) where status = 'proposed';

-- ---------------------------------------------------------------------------
-- Monthly AI usage (for the spending guard). Runs with the caller's
-- permissions, so each user sees only their own usage.
-- ---------------------------------------------------------------------------
create view public.ai_usage_monthly with (security_invoker = true) as
select
  user_id,
  date_trunc('month', created_at)::date as month,
  model,
  count(*)::int as requests,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_input_tokens,
  coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_input_tokens
from public.conversation_messages
where role = 'assistant' and model is not null
group by user_id, date_trunc('month', created_at), model;

revoke all on public.ai_usage_monthly from anon;
