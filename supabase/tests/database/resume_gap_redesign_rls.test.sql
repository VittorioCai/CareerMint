begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table('public', 'resume_gap_runs', 'resume gap runs table exists');
select has_table('public', 'resume_gap_items', 'resume gap items table exists');
select has_column('public', 'applications', 'resume_source_asset_id', 'applications can select a resume source asset');
select results_eq(
  $$
    select (c.confdeltype = 'n')::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.applications'::regclass
      and c.contype = 'f'
      and a.attname = 'resume_source_asset_id'
      and c.confrelid = 'public.source_assets'::regclass
  $$,
  array['true'::text],
  'application source asset uses on delete set null'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'gap-a@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Gap A"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'gap-b@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Gap B"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'alice-resume.pdf', 'application/pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alice-resume.pdf',
   1024, repeat('a', 64), 'ready');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
)
values ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bob-resume.pdf', 'application/pdf', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bob-resume.pdf',
  1024, repeat('b', 64), 'ready');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select set_config('test.app_a', (select id::text from public.create_application(
  'Acme GmbH', 'Product Manager', 'Berlin', 'hybrid', 'site',
  'https://example.com/jobs/pm',
  'Lead product discovery across international markets. Advanced SQL experience is required for funnel analysis.'
)), true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select set_config('test.app_b', (select id::text from public.create_application(
  'Beta GmbH', 'Data Analyst', 'Munich', 'onsite', 'site',
  'https://example.com/jobs/analyst',
  'Analyze customer data and build dashboards for business stakeholders. Advanced SQL experience is required.'
)), true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select results_eq(
  $$select (public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111')).resume_source_asset_id::text$$,
  array['11111111-1111-4111-8111-111111111111'],
  'owner can select their source asset'
);
select results_eq(
  $$select (public.set_application_resume_source(current_setting('test.app_a')::uuid, null)).resume_source_asset_id::text$$,
  array[null::text],
  'owner can skip the resume comparison'
);
select throws_ok(
  $$select public.set_application_resume_source(current_setting('test.app_a')::uuid, '22222222-2222-4222-8222-222222222222')$$,
  'P0002', 'application-or-resume-not-found',
  'cross-owner source assets are rejected'
);
select results_eq(
  $$select resume_source_asset_id::text from public.applications where id = current_setting('test.app_a')::uuid$$,
  array[null::text],
  'a failed source selection does not mutate the application'
);
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111');
delete from public.source_assets where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$select resume_source_asset_id::text from public.applications where id = current_setting('test.app_a')::uuid$$,
  array[null::text],
  'deleting a selected asset clears only the active selection'
);

-- Recreate the selected asset after exercising ON DELETE SET NULL.
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'alice-resume.pdf', 'application/pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alice-resume-2.pdf',
  1024, repeat('a', 64), 'ready');
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111');

select set_config('test.analysis_run', (select id::text from public.create_or_get_application_analysis(
  current_setting('test.app_a')::uuid, repeat('c', 64), 'test-provider', 'test-model'
)), true);
select public.claim_application_analysis(current_setting('test.analysis_run')::uuid);
select public.complete_application_analysis(
  current_setting('test.analysis_run')::uuid,
  jsonb_build_array(jsonb_build_object(
    'category', 'skill', 'text', 'Advanced SQL',
    'sourceExcerpt', 'Advanced SQL experience is required for funnel analysis.',
    'priority', 'core', 'matchStatus', 'none', 'matchReason', null,
    'matchedFactIds', '[]'::jsonb
  )), 0, 0, '{"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0}}', null
);

select set_config('test.gap_run', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('d', 64), 'test-provider', 'test-model'
)), true);
select results_eq(
  $$select id::text from public.create_or_get_resume_gap(
    current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
    '11111111-1111-4111-8111-111111111111', repeat('d', 64), 'test-provider', 'test-model'
  )$$,
  array[current_setting('test.gap_run')],
  'resume gap creation is idempotent for application, input, provider, and model'
);
select results_eq(
  $$select public.claim_resume_gap(current_setting('test.gap_run')::uuid, 120)$$,
  array[true], 'queued gap work can be claimed'
);
select results_eq(
  $$select attempt_count::text from public.resume_gap_runs where id = current_setting('test.gap_run')::uuid$$,
  array['1'], 'claim increments attempt count'
);
select results_eq(
  $$select public.claim_resume_gap(current_setting('test.gap_run')::uuid, 120)$$,
  array[false], 'fresh running work is not claimed twice'
);
set local role postgres;
update public.resume_gap_runs set updated_at = now() - interval '3 minutes' where id = current_setting('test.gap_run')::uuid;
set local role authenticated;
select results_eq(
  $$select public.claim_resume_gap(current_setting('test.gap_run')::uuid, 120)$$,
  array[true], 'stale running work can be reclaimed'
);

select throws_ok(
  $$insert into public.resume_gap_runs (application_id, user_id, analysis_run_id, input_hash, provider, model)
    values (current_setting('test.app_a')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.analysis_run')::uuid, repeat('e', 64), 'x', 'y')$$,
  '42501', 'permission denied for table resume_gap_runs',
  'authenticated users cannot insert gap runs directly'
);
select throws_ok(
  $$insert into public.resume_gap_items (run_id, application_id, user_id, requirement_id, requirement_text, category, priority, jd_source_excerpt, resume_coverage, sort_order)
    values (current_setting('test.gap_run')::uuid, current_setting('test.app_a')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'x', 'skill', 'core', 'x', 'missing', 1)$$,
  '42501', 'permission denied for table resume_gap_items',
  'authenticated users cannot insert gap items directly'
);
select throws_ok(
  $$update public.resume_gap_runs set provider = 'forged' where id = current_setting('test.gap_run')::uuid$$,
  '42501', 'permission denied for table resume_gap_runs',
  'authenticated users cannot update gap runs directly'
);
select throws_ok(
  $$delete from public.resume_gap_items where run_id = current_setting('test.gap_run')::uuid$$,
  '42501', 'permission denied for table resume_gap_items',
  'authenticated users cannot delete gap items directly'
);

select public.complete_resume_gap(
  current_setting('test.gap_run')::uuid, 2,
  jsonb_build_array(jsonb_build_object(
    'requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid),
    'resumeCoverage', 'missing', 'resumeExcerpt', null
  )),
  '{"usage":{"inputCacheHitTokens":1,"inputCacheMissTokens":2,"outputTokens":3}}', null
);
select results_eq(
  $$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.gap_run')::uuid$$,
  array[1::bigint], 'completion stores exactly one item per requirement'
);
select results_eq(
  $$select (result ? 'fullResumeText')::text || ':' || (result ? 'fullJdText')::text from public.resume_gap_runs where id = current_setting('test.gap_run')::uuid$$,
  array['false:false'], 'completion stores no full resume or JD text'
);

select set_config('test.fail_run', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('f', 64), 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.fail_run')::uuid, 120);
select results_eq(
  $$select status::text from public.fail_resume_gap(current_setting('test.fail_run')::uuid, 1, 'resume-gap-provider-error', 'try again')$$,
  array['failed'], 'failure records an allowlisted stable error'
);
select throws_ok(
  $$select public.fail_resume_gap(current_setting('test.fail_run')::uuid, 1, 'secret-provider-response', 'not allowed')$$,
  '22023', 'invalid-resume-gap-error', 'failure rejects non-allowlisted codes'
);
select results_eq(
  $$select count(*)::bigint from public.resume_gap_runs where status = 'succeeded'$$,
  array[1::bigint], 'failure does not delete the preceding succeeded run'
);

select finish();
rollback;
