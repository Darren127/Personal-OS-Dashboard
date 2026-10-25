-- Gmail Intelligence tables. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ insert into public.gmail_connections (google_email, refresh_token_enc) values ('alice@gmail.com', 'v1.iv.tag.ct') $$,
  'Alice can store her Gmail connection');

select lives_ok(
  $$ insert into public.email_messages (provider_message_id, thread_id, received_at, content_hash)
     values ('msg-1', 'thr-1', now(), 'h1') $$,
  'Alice can store an email');

select throws_ok(
  $$ insert into public.email_messages (provider_message_id, thread_id, received_at, content_hash)
     values ('msg-1', 'thr-1', now(), 'h2') $$,
  '23505', null, 'the same Gmail message is stored only once per user');

select lives_ok(
  $$ insert into public.email_analysis_runs (kind, model, message_count, input_tokens, output_tokens)
     values ('triage', 'claude-opus-5-5', 3, 1000, 200) $$,
  'analysis usage can be logged');

select throws_ok(
  $$ update public.email_analysis_runs set input_tokens = 0 $$,
  '42501', null, 'the usage log cannot be edited (it feeds the budget guard)');

select throws_ok(
  $$ delete from public.email_analysis_runs $$,
  '42501', null, 'the usage log cannot be deleted');

select is(
  (select input_tokens from public.ai_usage_monthly where model = 'claude-opus-5-5'),
  1000::bigint, 'email analysis counts toward monthly AI usage');

-- A task belonging to Bob cannot be linked to Alice's email.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
insert into public.tasks (id, title) values ('33333333-3333-3333-3333-333333333333', 'Bob task');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok(
  $$ update public.email_messages set task_id = '33333333-3333-3333-3333-333333333333' where provider_message_id = 'msg-1' $$,
  '23503', null, 'an email can only link to its owner''s tasks');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.gmail_connections), 0::bigint, 'Bob cannot see Alice''s Gmail connection or token');
select is((select count(*) from public.email_messages), 0::bigint, 'Bob cannot see Alice''s emails');
select is((select count(*) from public.ai_usage_monthly), 0::bigint, 'Bob cannot see Alice''s AI usage');

select set_config('role', 'anon', true);
select throws_ok($$ select * from public.gmail_connections $$, '42501', null, 'anonymous visitors cannot read Gmail connections');

select * from finish();
rollback;
