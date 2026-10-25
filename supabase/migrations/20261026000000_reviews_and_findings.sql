-- =============================================================================
-- Personal OS — weekly reviews and pattern findings
-- =============================================================================

-- One reflection per week. `stats` is a snapshot of the week's computed
-- numbers at the time of saving, so later edits to tasks don't rewrite history.
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  week_start date not null,
  wins text check (char_length(wins) <= 5000),
  challenges text check (char_length(challenges) <= 5000),
  lessons text check (char_length(lessons) <= 5000),
  next_week_focus text check (char_length(next_week_focus) <= 2000),
  rating smallint check (rating between 1 and 5),
  stats jsonb,
  ai_summary text check (char_length(ai_summary) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create trigger set_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();
create index weekly_reviews_user_week_idx on public.weekly_reviews (user_id, week_start desc);

-- Findings ("worth a look") are computed on the fly from the data. This table
-- only remembers which ones the user dismissed or snoozed, and until when.
create table public.finding_dismissals (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  finding_key text not null check (char_length(finding_key) <= 200),
  dismissed_until date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, finding_key)
);

do $$
declare
  t text;
begin
  foreach t in array array['weekly_reviews', 'finding_dismissals'] loop
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
