-- Weekly reviews and finding dismissals. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

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
  $$ insert into public.weekly_reviews (week_start, wins, rating, stats)
     values ('2026-10-19', 'Shipped the pitch', 4, '{"tasks_completed": 7}') $$,
  'a weekly review can be saved');

select throws_ok(
  $$ insert into public.weekly_reviews (week_start, wins) values ('2026-10-19', 'again') $$,
  '23505', null, 'one weekly review per week');

select throws_ok(
  $$ insert into public.weekly_reviews (week_start, rating) values ('2026-10-26', 9) $$,
  '23514', null, 'rating must be 1 to 5');

select lives_ok(
  $$ insert into public.finding_dismissals (finding_key, dismissed_until)
     values ('repeated_reschedule:abc', '2026-11-01') $$,
  'a finding can be dismissed');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from public.weekly_reviews), 0::bigint, 'Bob sees none of Alice''s weekly reviews');
select is((select count(*) from public.finding_dismissals), 0::bigint, 'Bob sees none of Alice''s dismissals');

select set_config('role', 'anon', true);
select throws_ok($$ select * from public.weekly_reviews $$, '42501', null, 'anonymous visitors cannot read weekly reviews');

select * from finish();
rollback;
