-- Run with: npm run db:test   (wraps `supabase test db`)
-- Everything runs inside a transaction that is rolled back afterwards.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Two users. Alice owns the data under test; Bob must never see or touch it.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.act_as_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

-- ---------------------------------------------------------------- Alice's data
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.goals (id, title, category, horizon,
  metric_start, metric_target, metric_current)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Save an emergency fund',
  'finance', 'annual', 0, 10000, 2500);

insert into public.goal_milestones (id, goal_id, title) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Open savings account'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'Automate transfers');

insert into public.projects (id, name, status)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'Budget overhaul', 'active');

insert into public.tasks (id, title, project_id, due_date, tags)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'List monthly expenses',
  'aaaaaaaa-0000-0000-0000-000000000002', '2026-10-20', '{money}');

select is(
  (select user_id from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id defaults to the signed-in user');

-- Task linked to a milestone inherits the milestone's goal.
insert into public.tasks (id, title, goal_milestone_id)
values ('aaaaaaaa-0000-0000-0000-000000000004', 'Compare bank rates',
  'aaaaaaaa-0000-0000-0000-0000000000a1');
select is(
  (select goal_id from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'milestone link sets the task''s goal automatically');

-- ------------------------------------------------------------ Task bookkeeping
update public.tasks set status = 'done' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select isnt(
  (select completed_at from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  null, 'marking a task done records completed_at');

update public.tasks set status = 'next' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is(
  (select completed_at from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  null, 'reopening a task clears completed_at');

update public.tasks set due_date = '2026-10-25' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.tasks set due_date = '2026-10-22' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is(
  (select reschedule_count from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  1, 'pushing a due date later counts as a reschedule; pulling it earlier does not');

select throws_ok(
  $$ insert into public.tasks (title) values ('') $$,
  '23514', null, 'empty task titles are rejected');

select throws_ok(
  $$ insert into public.tasks (title, start_date, due_date) values ('x', '2026-10-10', '2026-10-01') $$,
  '23514', null, 'due date before start date is rejected');

-- ------------------------------------------------------------ Calculated progress
select is(
  (select progress from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  25::numeric, 'auto progress uses the metric when one is defined (2500 of 10000)');

update public.goals set progress_method = 'milestones'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.goal_milestones set completed_at = now()
  where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select is(
  (select progress from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  50::numeric, 'milestone progress = completed / total');

update public.goals set progress_method = 'tasks'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select progress from public.goal_progress where goal_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0::numeric, 'task progress counts linked tasks (0 of 1 done)');

insert into public.tasks (title, status, project_id) values
  ('Cancelled idea', 'cancelled', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('Done thing', 'done', 'aaaaaaaa-0000-0000-0000-000000000002');
select is(
  (select progress from public.project_progress where project_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  50::numeric, 'project progress ignores cancelled tasks (1 of 2 done)');

-- ------------------------------------------------------------ Daily plan
insert into public.daily_plans (id, plan_date)
values ('aaaaaaaa-0000-0000-0000-000000000005', '2026-10-24');
insert into public.daily_plan_items (plan_id, task_id, priority_rank)
values ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003', 1);
select throws_ok(
  $$ insert into public.daily_plan_items (plan_id, task_id, priority_rank)
     values ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000004', 1) $$,
  '23505', null, 'each priority rank is used once per day');
select throws_ok(
  $$ insert into public.daily_plan_items (plan_id, task_id)
     values ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  '23505', null, 'a task appears in a day''s plan only once');
select throws_ok(
  $$ insert into public.daily_plan_items (plan_id, title, start_time, end_time)
     values ('aaaaaaaa-0000-0000-0000-000000000005', 'Lunch', '13:00', '12:00') $$,
  '23514', null, 'time blocks must end after they start');

-- ------------------------------------------------------------ Bob: isolation
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is((select count(*) from public.tasks), 0::bigint, 'Bob sees none of Alice''s tasks');
select is((select count(*) from public.goals), 0::bigint, 'Bob sees none of Alice''s goals');
select is((select count(*) from public.goal_progress), 0::bigint, 'progress views respect RLS');
select is((select count(*) from public.daily_plan_items), 0::bigint, 'Bob sees none of Alice''s plan items');

update public.tasks set title = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
delete from public.goals where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.tasks (title, user_id)
     values ('Sneaky', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'Bob cannot create rows owned by Alice');

select throws_ok(
  $$ insert into public.tasks (title, project_id)
     values ('Link to Alice''s project', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'Bob cannot link his task to Alice''s project');

select throws_ok(
  $$ insert into public.project_goals (project_id, goal_id)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'Bob cannot link Alice''s project to Alice''s goal');

-- ------------------------------------------------------------ Anonymous visitors
select pg_temp.act_as_anon();
select throws_ok($$ select * from public.tasks $$, '42501', null,
  'anonymous visitors cannot read tasks at all');
select throws_ok($$ select * from public.memories $$, '42501', null,
  'anonymous visitors cannot read memories at all');

-- ------------------------------------------------------------ Alice: still intact
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is(
  (select title from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'List monthly expenses', 'Bob''s update had no effect');
select is((select count(*) from public.goals), 1::bigint, 'Bob''s delete had no effect');

-- Deleting a project keeps its tasks, just unlinked.
delete from public.projects where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is(
  (select project_id from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  null, 'deleting a project unlinks (does not delete) its tasks');
select is(
  (select user_id from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'unlinking keeps the task''s owner intact');

-- Every public table has RLS enabled.
reset role;
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint, 'every public table has Row Level Security enabled');

select * from finish();
rollback;
