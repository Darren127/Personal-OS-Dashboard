-- AI Companion schema rules. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.conversations (id, title)
values ('cccccccc-0000-0000-0000-000000000001', 'Planning');

-- ------------------------------------------------------------- Messages
select lives_ok(
  $$ insert into public.conversation_messages (conversation_id, role, text_content, visible)
     values ('cccccccc-0000-0000-0000-000000000001', 'system', 'Context for this turn', false) $$,
  'system-role context messages can be stored');

insert into public.conversation_messages (id, conversation_id, role, text_content, model, input_tokens, output_tokens, cache_read_input_tokens)
values ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', 'assistant',
  'You have three overdue tasks about the budget.', 'claude-opus-5-5', 1000, 200, 5000);

select throws_ok(
  $$ update public.conversation_messages set text_content = 'edited'
     where id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'messages cannot be edited after they are stored');

select throws_ok(
  $$ delete from public.conversation_messages where id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'individual messages cannot be deleted');

select is(
  (select count(*) from public.conversation_messages
   where search @@ websearch_to_tsquery('english', 'overdue budget')),
  1::bigint, 'messages are full-text searchable');

select is(
  (select output_tokens from public.ai_usage_monthly where model = 'claude-opus-5-5'),
  200::bigint, 'monthly usage view sums tokens');

-- ------------------------------------------------------------- Memories
select throws_ok(
  $$ insert into public.memories (category, content, created_by, status)
     values ('working_style', 'Works best in the morning', 'ai', 'approved') $$,
  '23514', null, 'the AI cannot create an already-approved memory');

select lives_ok(
  $$ insert into public.memories (category, content, created_by, status, confidence)
     values ('working_style', 'Seems to work best in the morning', 'ai', 'proposed', 'hypothesis') $$,
  'the AI can propose a memory');

-- ------------------------------------------------------------- Action log
insert into public.ai_action_logs (id, tool_name, input, status, risk_level, summary)
values ('cccccccc-0000-0000-0000-0000000000b1', 'update_goal', '{"goal_id": "x"}', 'proposed', 'high', 'Change goal target date');

select throws_ok(
  $$ update public.ai_action_logs set input = '{"tampered": true}'
     where id = 'cccccccc-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'an action''s recorded input cannot be changed');

select lives_ok(
  $$ update public.ai_action_logs set status = 'approved', decided_at = now()
     where id = 'cccccccc-0000-0000-0000-0000000000b1' $$,
  'a proposed action can be approved');

select lives_ok(
  $$ update public.ai_action_logs set status = 'executed', executed_at = now(), result = '{"ok": true}'
     where id = 'cccccccc-0000-0000-0000-0000000000b1' $$,
  'an approved action can be marked executed');

select throws_ok(
  $$ update public.ai_action_logs set status = 'proposed'
     where id = 'cccccccc-0000-0000-0000-0000000000b1' $$,
  '23514', null, 'an executed action cannot go back to proposed');

insert into public.ai_action_logs (id, tool_name, status, summary)
values ('cccccccc-0000-0000-0000-0000000000b2', 'create_task', 'proposed', 'Create a task');
update public.ai_action_logs set status = 'rejected' where id = 'cccccccc-0000-0000-0000-0000000000b2';
select throws_ok(
  $$ update public.ai_action_logs set status = 'executed'
     where id = 'cccccccc-0000-0000-0000-0000000000b2' $$,
  '23514', null, 'a rejected action cannot be executed later');

select throws_ok($$ delete from public.ai_action_logs $$, '42501', null,
  'action log entries cannot be deleted');

-- ------------------------------------------------------------- Isolation
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.conversation_messages), 0::bigint, 'Bob sees none of Alice''s messages');
select is((select count(*) from public.ai_usage_monthly), 0::bigint, 'Bob sees none of Alice''s AI usage');

select * from finish();
rollback;
