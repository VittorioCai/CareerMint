begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'resume_jd_difference_runs', 'V4 difference runs table exists');
select has_column('public', 'resume_jd_difference_runs', 'result', 'one atomic result is stored');
select results_eq(
  $$select relrowsecurity::text from pg_class where oid = 'public.resume_jd_difference_runs'::regclass$$,
  array['true'], 'V4 run table has RLS enabled'
);
select results_eq(
  $$select has_table_privilege('anon', 'public.resume_jd_difference_runs', 'SELECT')::text$$,
  array['false'], 'anonymous users cannot read V4 runs'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.resume_jd_difference_runs', 'INSERT')::text$$,
  array['false'], 'authenticated users cannot insert V4 runs directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'difference-a@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Difference A"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'difference-b@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Difference B"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'alice-resume.pdf', 'application/pdf',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alice-resume.pdf',
  1024, repeat('a', 64), 'ready'
);
select set_config('test.app_a', (select id::text from public.create_application(
  'Acme', 'Product Analyst', 'Berlin', 'hybrid', 'site',
  'https://example.com/a',
  'Collaborate with business stakeholders and use SQL for customer funnel analysis.'
)), true);
select public.set_application_resume_source(
  current_setting('test.app_a')::uuid,
  '11111111-1111-4111-8111-111111111111'
);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bob-resume.pdf', 'application/pdf',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bob-resume.pdf',
  1024, repeat('b', 64), 'ready'
);
select set_config('test.app_b', (select id::text from public.create_application(
  'Beta', 'Data Analyst', 'Munich', 'onsite', 'site',
  'https://example.com/b',
  'Build dashboards with Python and present business recommendations.'
)), true);
select public.set_application_resume_source(
  current_setting('test.app_b')::uuid,
  '22222222-2222-4222-8222-222222222222'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.resume_jd_difference_runs (
      application_id, user_id, source_asset_id, source_filename,
      source_sha256, jd_sha256, fact_fingerprint, input_hash,
      provider, model, schema_version, prompt_version, policy_version
    ) values (
      current_setting('test.app_a')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111', 'forged.pdf',
      repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
      'provider', 'model', 'schema', 'prompt', 'policy'
    )$$,
  '42501', 'permission denied for table resume_jd_difference_runs',
  'authenticated users cannot insert runs directly'
);

select throws_ok(
  $$select public.create_or_get_resume_jd_difference(
    current_setting('test.app_b')::uuid,
    '11111111-1111-4111-8111-111111111111', 'alice-resume.pdf',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'provider', 'model', 'schema', 'prompt', 'policy'
  )$$,
  'P0002', 'application-or-resume-not-found',
  'another owner application is rejected'
);
select throws_ok(
  $$select public.create_or_get_resume_jd_difference(
    current_setting('test.app_a')::uuid,
    '22222222-2222-4222-8222-222222222222', 'bob-resume.pdf',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'provider', 'model', 'schema', 'prompt', 'policy'
  )$$,
  'P0002', 'application-or-resume-not-found',
  'another owner resume is rejected'
);

select set_config('test.run_a', (select id::text from public.create_or_get_resume_jd_difference(
  current_setting('test.app_a')::uuid,
  '11111111-1111-4111-8111-111111111111', 'alice-resume.pdf',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
  'provider', 'model', 'schema', 'prompt', 'policy'
)), true);
select results_eq(
  $$select id::text from public.create_or_get_resume_jd_difference(
    current_setting('test.app_a')::uuid,
    '11111111-1111-4111-8111-111111111111', 'alice-resume.pdf',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'provider', 'model', 'schema', 'prompt', 'policy'
  )$$,
  array[current_setting('test.run_a')],
  'the same complete input reuses one run'
);
select throws_ok(
  $$select public.create_or_get_resume_jd_difference(
    current_setting('test.app_a')::uuid,
    '11111111-1111-4111-8111-111111111111', 'alice-resume.pdf',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'provider', 'model', 'different-schema', 'prompt', 'policy'
  )$$,
  '23505', 'resume-jd-difference-conflict',
  'an identical hash cannot silently bind a different version'
);

select results_eq(
  $$select public.claim_resume_jd_difference(current_setting('test.run_a')::uuid, 0, 'queued', 120)$$,
  array[true], 'queued work can be claimed'
);
select results_eq(
  $$select attempt_count::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array['1'], 'claim increments the attempt token'
);
select results_eq(
  $$select public.claim_resume_jd_difference(current_setting('test.run_a')::uuid, 1, 'running', 120)$$,
  array[false], 'fresh running work cannot be claimed twice'
);
set local role postgres;
update public.resume_jd_difference_runs
set updated_at = now() - interval '3 minutes'
where id = current_setting('test.run_a')::uuid;
set local role authenticated;
select results_eq(
  $$select public.claim_resume_jd_difference(current_setting('test.run_a')::uuid, 1, 'running', 120)$$,
  array[true], 'stale running work can be reclaimed'
);
select results_eq(
  $$select public.claim_resume_jd_difference(current_setting('test.run_a')::uuid, 1, 'running', 120)$$,
  array[false], 'old attempt fencing cannot reclaim current work'
);

select throws_ok(
  $$select public.complete_resume_jd_difference(
    current_setting('test.run_a')::uuid, 1,
    '{"jobCore":{},"overallDifference":{},"issues":[],"matched":[],"directions":[]}',
    '{"provider":"provider"}', null
  )$$,
  'P0002', 'resume-jd-difference-run-not-claimable',
  'an old attempt cannot complete reclaimed work'
);
select throws_ok(
  $$select public.complete_resume_jd_difference(
    current_setting('test.run_a')::uuid, 2,
    '{"issues":[]}', '{"provider":"provider"}', null
  )$$,
  '22023', 'invalid-resume-jd-difference-result',
  'an incomplete result is rejected atomically'
);
select results_eq(
  $$select result::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array[null::text], 'invalid completion publishes no partial result'
);

select public.complete_resume_jd_difference(
  current_setting('test.run_a')::uuid, 2,
  '{
    "jobCore":{"missionZh":"支持业务决策","coreCapabilities":["分析","报告","协作"],"concepts":[],"gates":[],"preferredItems":[]},
    "overallDifference":{"summaryZh":"表达需要加强","topIssueIds":[]},
    "issues":[],"matched":[],"directions":[]
  }',
  '{"provider":"provider","model":"model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":10,"outputTokens":20},"priceScheduleVersion":null}',
  null
);
select results_eq(
  $$select status::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array['succeeded'], 'valid completion succeeds'
);
select results_eq(
  $$select (result ?& array['jobCore','overallDifference','issues','matched','directions'])::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array['true'], 'both pages receive one complete atomic result'
);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array['0'], 'another owner cannot read the run'
);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array['1'], 'the owner can read the run'
);

select set_config('test.failed_run', (select id::text from public.create_or_get_resume_jd_difference(
  current_setting('test.app_a')::uuid,
  '11111111-1111-4111-8111-111111111111', 'alice-resume.pdf',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('e', 64),
  'provider', 'model', 'schema', 'prompt', 'policy'
)), true);
select public.claim_resume_jd_difference(current_setting('test.failed_run')::uuid, 0, 'queued', 120);
select public.fail_resume_jd_difference(
  current_setting('test.failed_run')::uuid, 1,
  'ai-timeout', 'provider timed out'
);
select results_eq(
  $$select status::text from public.resume_jd_difference_runs where id = current_setting('test.failed_run')::uuid$$,
  array['failed'], 'a claimed run can fail with a stable status'
);
select results_eq(
  $$select count(*)::text from public.resume_jd_difference_runs where application_id = current_setting('test.app_a')::uuid and status = 'succeeded'$$,
  array['1'], 'a failed rerun preserves the previous successful result'
);

delete from public.source_assets where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$select source_asset_id::text from public.resume_jd_difference_runs where id = current_setting('test.run_a')::uuid$$,
  array[null::text], 'deleting a source keeps historical analysis metadata'
);

select public.delete_owned_application(current_setting('test.app_a')::uuid);
select results_eq(
  $$select count(*)::text from public.resume_jd_difference_runs where application_id = current_setting('test.app_a')::uuid$$,
  array['0'], 'deleting an application cascades all V4 runs'
);

select * from finish();
rollback;
