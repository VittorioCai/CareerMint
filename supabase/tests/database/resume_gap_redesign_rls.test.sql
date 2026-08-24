begin;

create extension if not exists pgtap with schema extensions;

select plan(80);

select has_table('public', 'resume_gap_runs', 'resume gap runs table exists');
select has_table('public', 'resume_gap_items', 'resume gap items table exists');
select has_column('public', 'applications', 'resume_source_asset_id', 'applications can select a resume source asset');
select results_eq($$select has_function_privilege('anon', 'public.resume_gap_json_has_exact_keys(jsonb,text[])', 'EXECUTE')::text$$, array['false'], 'anon cannot execute the internal JSON helper');
select results_eq($$select has_function_privilege('authenticated', 'public.resume_gap_json_has_exact_keys(jsonb,text[])', 'EXECUTE')::text$$, array['false'], 'authenticated cannot execute the internal JSON helper');
select results_eq($$select (lower(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure)) like '%target_source_asset_id uuid default null%')::text$$, array['true'], 'source selection RPC exposes an optional null skip argument');
select results_eq(
  $$select (
    strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'select application_id, user_id') > 0
      and strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'select application_id, user_id') < strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'for locked_analysis')
      and strpos(substring(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure) from 1 for strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'for locked_analysis')), 'for update') = 0
      and strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'for locked_analysis') < strpos(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'select * into owned_analysis')
      and regexp_count(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), 'order by created_at, id[[:space:]]+for update') = 1
  )::text$$,
  array['true'], 'resume gap creation discovers then locks all analyses once before re-reading the selected row'
);
select results_eq(
  $$select (
    strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'select analysis_run_id') > 0
      and strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'select analysis_run_id') < strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'for analysis_row')
      and strpos(substring(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure) from 1 for strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'for analysis_row')), 'for update') = 0
      and strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'for analysis_row') < strpos(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'select * into locked_application')
      and regexp_count(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), 'order by created_at, id[[:space:]]+for update') = 1
  )::text$$,
  array['true'], 'resume gap completion discovers then locks all analyses once before application/source'
);
select results_eq(
  $$select (
    strpos(lower(regexp_replace(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_asset from public.source_assets where id = target_source_asset_id and user_id = current_user_id for update') > 0
      and strpos(lower(regexp_replace(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_asset from public.source_assets where id = target_source_asset_id and user_id = current_user_id for update')
        < strpos(lower(regexp_replace(pg_get_functiondef('public.create_or_get_resume_gap(uuid,uuid,uuid,text,text,text)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_application from public.applications where id = owned_analysis.application_id and user_id = current_user_id for update')
  )::text$$,
  array['true'], 'resume gap creation locks source before application to match source deletion FK order'
);
select results_eq(
  $$select (
    strpos(lower(regexp_replace(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into locked_asset from public.source_assets where id = candidate_source_asset_id and user_id = current_user_id for update') > 0
      and strpos(lower(regexp_replace(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into locked_asset from public.source_assets where id = candidate_source_asset_id and user_id = current_user_id for update')
        < strpos(lower(regexp_replace(pg_get_functiondef('public.complete_resume_gap(uuid,integer,jsonb,jsonb,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into locked_application from public.applications where id = selected_analysis.application_id and user_id = current_user_id for update')
  )::text$$,
  array['true'], 'resume gap completion locks source before application to match source deletion FK order'
);
select results_eq(
  $$select (
    strpos(lower(regexp_replace(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_asset from public.source_assets where id = target_source_asset_id and user_id = current_user_id for update') > 0
      and strpos(lower(regexp_replace(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_asset from public.source_assets where id = target_source_asset_id and user_id = current_user_id for update')
        < strpos(lower(regexp_replace(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g')), 'select * into owned_application from public.applications where id = target_application_id and user_id = current_user_id for update')
  )::text$$,
  array['true'], 'source selection locks a non-null source before the application'
);
select results_eq(
  $$select (
    regexp_count(lower(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure)), 'candidate_asset\.id is null') = 1
      and regexp_count(lower(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure)), 'owned_asset\.id is null') = 1
      and strpos(lower(pg_get_functiondef('public.set_application_resume_source(uuid,uuid)'::regprocedure)), 'owned_asset := null') > 0
  )::text$$,
  array['true'], 'source selection clears and revalidates the locked asset after the locking read'
);
select results_eq(
  $$select count(*)::text from pg_indexes where schemaname = 'public' and indexname = 'resume_gap_items_run_order_idx'$$,
  array['0'], 'the item unique constraint supplies the run/order index'
);
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
  )), 0, 0, '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null
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
  '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":1,"inputCacheMissTokens":2,"outputTokens":3},"priceScheduleVersion":null}', null
);
select results_eq(
  $$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.gap_run')::uuid$$,
  array[1::bigint], 'completion stores exactly one item per requirement'
);
select results_eq(
  $$select requirement_text || '|' || category || '|' || priority || '|' || jd_source_excerpt from public.resume_gap_items where run_id = current_setting('test.gap_run')::uuid$$,
  array['Advanced SQL|skill|core|Advanced SQL experience is required for funnel analysis.'],
  'completion stores exact requirement snapshots'
);
select results_eq(
  $$select (result ? 'fullResumeText')::text || ':' || (result ? 'fullJdText')::text from public.resume_gap_runs where id = current_setting('test.gap_run')::uuid$$,
  array['false:false'], 'completion stores no full resume or JD text'
);
set local role postgres;
select throws_ok(
  $$update public.resume_gap_runs
    set result = jsonb_set(result, '{ai,usage,inputCacheHitTokens}', '"1"'::jsonb, false)
    where id = current_setting('test.gap_run')::uuid$$,
  '23514',
  'new row for relation "resume_gap_runs" violates check constraint "resume_gap_runs_result_check"',
  'result constraints reject string-valued token counts'
);
set local role authenticated;

select set_config('test.fail_run', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('f', 64), 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.fail_run')::uuid, 120);
select results_eq(
  $$select status::text from public.fail_resume_gap(current_setting('test.fail_run')::uuid, 1, 'ai-provider-request-failed', 'try again')$$,
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

-- Cross-owner reads are isolated even though both tables are grantable SELECTs.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select results_eq($$select count(*)::bigint from public.resume_gap_runs$$, array[0::bigint], 'user B cannot select user A gap runs');
select results_eq($$select count(*)::bigint from public.resume_gap_items$$, array[0::bigint], 'user B cannot select user A gap items');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- A queued JD run and a succeeded JD run with no requirements are both invalid gap inputs.
select set_config('test.queued_analysis', (select id::text from public.create_or_get_application_analysis(
  current_setting('test.app_a')::uuid, repeat('1', 64), 'test-provider', 'test-model'
)), true);
select throws_ok(
  $$select public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.queued_analysis')::uuid, '11111111-1111-4111-8111-111111111111', repeat('2', 64), 'test-provider', 'test-model')$$,
  'P0002', 'application-or-resume-not-found', 'a non-succeeded JD run cannot create gap work'
);
select public.claim_application_analysis(current_setting('test.queued_analysis')::uuid);
select public.complete_application_analysis(current_setting('test.queued_analysis')::uuid, '[]'::jsonb, 0, 0, null, null);
select throws_ok(
  $$select public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.queued_analysis')::uuid, '11111111-1111-4111-8111-111111111111', repeat('3', 64), 'test-provider', 'test-model')$$,
  'P0002', 'application-or-resume-not-found', 'a zero-requirement JD run cannot create gap work'
);
set local role postgres;
insert into public.application_requirements (
  id, analysis_run_id, application_id, user_id, category, requirement_text,
  source_excerpt, priority, match_status, sort_order
) values (
  '33333333-3333-4333-8333-333333333333', current_setting('test.analysis_run')::uuid,
  current_setting('test.app_a')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'skill', 'Advanced SQL', 'Advanced SQL experience is required for funnel analysis.',
  'core', 'none', 0
);
insert into public.application_requirements (
  id, analysis_run_id, application_id, user_id, category, requirement_text,
  source_excerpt, priority, match_status, sort_order
) values (
  '55555555-5555-4555-8555-555555555555', current_setting('test.queued_analysis')::uuid,
  current_setting('test.app_a')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'skill', 'Other SQL', 'Advanced SQL experience is required for funnel analysis.',
  'core', 'none', 1
);
select set_config('test.same_owner_cross_run_req', '55555555-5555-4555-8555-555555555555', true);
update public.application_analysis_runs
set created_at = case
  when id = current_setting('test.analysis_run')::uuid then '2026-08-24 13:00:00+00'::timestamptz
  else '2026-08-24 11:00:00+00'::timestamptz
end
where id in (current_setting('test.analysis_run')::uuid, current_setting('test.queued_analysis')::uuid);
set local role authenticated;

-- Safe result payloads reject extra/nested provider data.
select set_config('test.strict_run', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 64), 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_run')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_run')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null)),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null,"secret":{"resume":"do not store"}}', null)$$,
  '22023', 'invalid-resume-gap-usage', 'AI usage rejects extra sensitive keys'
);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_run')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null)),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}',
    '{"amount":1,"currency":"USD","scheduleVersion":"v1","tier":"default","secret":{"resume":"do not store"}}')$$,
  '22023', 'invalid-resume-gap-cost', 'estimated cost rejects extra sensitive keys'
);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_run')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', '   ')),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'missing coverage rejects whitespace-only excerpts'
);
select set_config('test.strict_case2', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 63) || '2', 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_case2')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_case2')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing')),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'missing coverage requires an explicit null excerpt'
);
select set_config('test.strict_case3', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 63) || '3', 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_case3')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_case3')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'covered', 'resumeExcerpt', null)),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'covered coverage requires a non-null excerpt'
);
select set_config('test.strict_case4', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 63) || '4', 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_case4')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_case4')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'partial', 'resumeExcerpt', '  ')),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'partial coverage rejects whitespace-only excerpts'
);
select set_config('test.strict_case5', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 63) || '5', 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_case5')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_case5')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null, 'extra', 'sensitive')),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'resume gap items reject extra keys'
);
select set_config('test.strict_case6', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('4', 63) || '6', 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.strict_case6')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_case6')::uuid, 1,
    jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing')),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$,
  '22023', 'invalid-resume-gap-item', 'resume gap items reject missing keys'
);
select results_eq($$select status::text from public.resume_gap_runs where id = current_setting('test.strict_run')::uuid$$, array['running'], 'invalid completion rolls back item insertion and status');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.strict_run')::uuid$$, array[0::bigint], 'invalid item payloads leave no partially inserted items');

-- A stale worker attempt cannot complete after a newer claim.
set local role postgres;
update public.resume_gap_runs set updated_at = now() - interval '3 minutes' where id = current_setting('test.strict_run')::uuid;
set local role authenticated;
select public.claim_resume_gap(current_setting('test.strict_run')::uuid, 120);
select throws_ok(
  $$select public.complete_resume_gap(current_setting('test.strict_run')::uuid, 1, '[]'::jsonb, null, null)$$,
  'P0002', 'resume-gap-not-running', 'stale attempt cannot complete after reclaim'
);

-- Caller-controlled failure text is never persisted.
select set_config('test.error_run', (select id::text from public.create_or_get_resume_gap(
  current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid,
  '11111111-1111-4111-8111-111111111111', repeat('5', 64), 'test-provider', 'test-model'
)), true);
select public.claim_resume_gap(current_setting('test.error_run')::uuid, 120);
select public.fail_resume_gap(current_setting('test.error_run')::uuid, 1, 'resume-gap-failed', repeat('sensitive resume text ', 25));
select results_eq($$select error_message from public.resume_gap_runs where id = current_setting('test.error_run')::uuid$$, array['Resume comparison failed.'], 'failure stores only the fixed safe message');

-- Build a second owner's succeeded JD requirement for cross-run/cross-owner checks.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select public.set_application_resume_source(current_setting('test.app_b')::uuid, '22222222-2222-4222-8222-222222222222');
select set_config('test.b_analysis', (select id::text from public.create_or_get_application_analysis(
  current_setting('test.app_b')::uuid, repeat('6', 64), 'test-provider', 'test-model'
)), true);
select public.claim_application_analysis(current_setting('test.b_analysis')::uuid);
select public.complete_application_analysis(
  current_setting('test.b_analysis')::uuid,
  jsonb_build_array(jsonb_build_object(
    'category', 'skill', 'text', 'Advanced SQL',
    'sourceExcerpt', 'Advanced SQL experience is required.',
    'priority', 'core', 'matchStatus', 'none', 'matchReason', null,
    'matchedFactIds', '[]'::jsonb
  )), 0, 0, null, null
);
select set_config('test.b_req', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.b_analysis')::uuid), true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- Unknown, duplicate, missing, cross-run, and cross-owner ids all roll back atomically.
select set_config('test.unknown_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('7', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.unknown_run')::uuid, 120);
select throws_ok($$select public.complete_resume_gap(current_setting('test.unknown_run')::uuid, 1, jsonb_build_array(jsonb_build_object('requirementId', '99999999-9999-4999-8999-999999999999', 'resumeCoverage', 'missing', 'resumeExcerpt', null)), '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$, '22023', 'invalid-resume-gap-requirements', 'unknown requirement ids are rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.unknown_run')::uuid$$, array[0::bigint], 'unknown requirement rollback leaves no items');

select set_config('test.duplicate_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('8', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.duplicate_run')::uuid, 120);
select throws_ok($$select public.complete_resume_gap(current_setting('test.duplicate_run')::uuid, 1, jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null), jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null)), '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$, '22023', 'invalid-resume-gap-requirements', 'duplicate requirement ids are rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.duplicate_run')::uuid$$, array[0::bigint], 'duplicate requirement rollback leaves no items');

select set_config('test.missing_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('9', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.missing_run')::uuid, 120);
select throws_ok($$select public.complete_resume_gap(current_setting('test.missing_run')::uuid, 1, '[]'::jsonb, '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$, '22023', 'invalid-resume-gap-requirements', 'missing requirement ids are rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.missing_run')::uuid$$, array[0::bigint], 'missing requirement rollback leaves no items');

select set_config('test.cross_run_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('a', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.cross_run_run')::uuid, 120);
select throws_ok($$select public.complete_resume_gap(current_setting('test.cross_run_run')::uuid, 1, jsonb_build_array(jsonb_build_object('requirementId', current_setting('test.same_owner_cross_run_req'), 'resumeCoverage', 'missing', 'resumeExcerpt', null)), '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$, '22023', 'invalid-resume-gap-requirements', 'same-owner cross-run requirement ids are rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.cross_run_run')::uuid$$, array[0::bigint], 'cross-run rollback leaves no items');

select set_config('test.cross_owner_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('b', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.cross_owner_run')::uuid, 120);
select throws_ok($$select public.complete_resume_gap(current_setting('test.cross_owner_run')::uuid, 1, jsonb_build_array(jsonb_build_object('requirementId', current_setting('test.b_req'), 'resumeCoverage', 'missing', 'resumeExcerpt', null)), '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null)$$, '22023', 'invalid-resume-gap-requirements', 'cross-owner requirement ids are rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.cross_owner_run')::uuid$$, array[0::bigint], 'cross-owner rollback leaves no items');

-- Filename whitespace is normalized consistently in snapshots and completion.
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '66666666-6666-4666-8666-666666666666', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '  alice-whitespace.pdf  ', 'application/pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alice-whitespace.pdf',
  1024, repeat('6', 64), 'ready'
);
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '66666666-6666-4666-8666-666666666666');
select set_config('test.whitespace_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '66666666-6666-4666-8666-666666666666', repeat('0', 64), 'test-provider', 'test-model')), true);
select results_eq($$select source_filename from public.resume_gap_runs where id = current_setting('test.whitespace_run')::uuid$$, array['alice-whitespace.pdf'], 'source filename snapshots are trimmed');
select public.claim_resume_gap(current_setting('test.whitespace_run')::uuid, 120);
select public.complete_resume_gap(current_setting('test.whitespace_run')::uuid, 1, jsonb_build_array(jsonb_build_object('requirementId', (select id::text from public.application_requirements where analysis_run_id = current_setting('test.analysis_run')::uuid), 'resumeCoverage', 'missing', 'resumeExcerpt', null)), '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}', null);
select results_eq($$select status::text from public.resume_gap_runs where id = current_setting('test.whitespace_run')::uuid$$, array['succeeded'], 'trimmed source filename completes successfully');
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111');

-- Mutating either source snapshot after creation aborts atomically.
select set_config('test.mutable_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('1', 63) || '2', 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.mutable_run')::uuid, 120);
set local role postgres;
update public.source_assets set original_name = 'changed.pdf' where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.complete_resume_gap(current_setting('test.mutable_run')::uuid, 1, '[]'::jsonb, null, null)$$, 'P0002', 'application-or-resume-not-found', 'filename snapshot mutation is rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.mutable_run')::uuid$$, array[0::bigint], 'filename mismatch leaves no items');
select results_eq($$select status::text from public.resume_gap_runs where id = current_setting('test.mutable_run')::uuid$$, array['running'], 'filename mismatch does not succeed the run');
set local role postgres;
update public.source_assets set original_name = 'alice-resume.pdf', sha256 = repeat('c', 64) where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.complete_resume_gap(current_setting('test.mutable_run')::uuid, 1, '[]'::jsonb, null, null)$$, 'P0002', 'application-or-resume-not-found', 'SHA snapshot mutation is rejected');
select results_eq($$select count(*)::bigint from public.resume_gap_items where run_id = current_setting('test.mutable_run')::uuid$$, array[0::bigint], 'SHA mismatch leaves no items');
select results_eq($$select status::text from public.resume_gap_runs where id = current_setting('test.mutable_run')::uuid$$, array['running'], 'SHA mismatch does not succeed the run');
set local role postgres;
update public.source_assets set sha256 = repeat('a', 64) where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;

-- Same-timestamp succeeded JD runs use UUID as a deterministic tie-break.
set local role postgres;
update public.application_analysis_runs
set created_at = '2026-08-24 12:00:00+00'
where id in (current_setting('test.analysis_run')::uuid, current_setting('test.queued_analysis')::uuid);
set local role authenticated;
select set_config('test.lex_latest_run', (select max(id::text) from public.application_analysis_runs where id in (current_setting('test.analysis_run')::uuid, current_setting('test.queued_analysis')::uuid)), true);
select set_config('test.lex_earlier_run', (select min(id::text) from public.application_analysis_runs where id in (current_setting('test.analysis_run')::uuid, current_setting('test.queued_analysis')::uuid)), true);
select throws_ok(
  $$select public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.lex_earlier_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('2', 63) || '3', 'test-provider', 'test-model')$$,
  '22023', 'invalid-resume-gap-input', 'an earlier same-timestamp succeeded JD run is stale by UUID tie-break'
);
select set_config('test.lex_latest_gap_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.lex_latest_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('2', 63) || '4', 'test-provider', 'test-model')), true);
select results_eq(
  $$select analysis_run_id::text from public.resume_gap_runs where id = current_setting('test.lex_latest_gap_run')::uuid$$,
  array[current_setting('test.lex_latest_run')],
  'the lexicographically latest same-timestamp succeeded JD run is accepted'
);
set local role postgres;
update public.application_analysis_runs
set created_at = case
  when id = current_setting('test.analysis_run')::uuid then '2026-08-24 13:00:00+00'::timestamptz
  else '2026-08-24 11:00:00+00'::timestamptz
end
where id in (current_setting('test.analysis_run')::uuid, current_setting('test.queued_analysis')::uuid);
set local role authenticated;

-- Selection changes and hash reuse cannot complete or rebind a prior run.
select set_config('test.snapshot_run', (select id::text from public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '11111111-1111-4111-8111-111111111111', repeat('c', 64), 'test-provider', 'test-model')), true);
select public.claim_resume_gap(current_setting('test.snapshot_run')::uuid, 120);
select public.set_application_resume_source(current_setting('test.app_a')::uuid, null);
select throws_ok($$select public.complete_resume_gap(current_setting('test.snapshot_run')::uuid, 1, '[]'::jsonb, null, null)$$, 'P0002', 'application-or-resume-not-found', 'completion rejects a changed source selection');
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111');
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'alice-resume-new.pdf', 'application/pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alice-resume-new.pdf',
  1024, repeat('4', 64), 'ready'
);
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '44444444-4444-4444-8444-444444444444');
select throws_ok($$select public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.analysis_run')::uuid, '44444444-4444-4444-8444-444444444444', repeat('d', 64), 'test-provider', 'test-model')$$, '23505', 'resume-gap-conflict', 'hash reuse after switching selected resume cannot rebind a prior run');
select public.set_application_resume_source(current_setting('test.app_a')::uuid, '11111111-1111-4111-8111-111111111111');
select set_config('test.alt_analysis', (select id::text from public.create_or_get_application_analysis(current_setting('test.app_a')::uuid, repeat('e', 64), 'test-provider', 'test-model')), true);
select public.claim_application_analysis(current_setting('test.alt_analysis')::uuid);
select public.complete_application_analysis(
  current_setting('test.alt_analysis')::uuid,
  jsonb_build_array(jsonb_build_object(
    'category', 'skill', 'text', 'Advanced SQL',
    'sourceExcerpt', 'Advanced SQL experience is required for funnel analysis.',
    'priority', 'core', 'matchStatus', 'none', 'matchReason', null,
    'matchedFactIds', '[]'::jsonb
  )), 0, 0, null, null
);
select throws_ok($$select public.create_or_get_resume_gap(current_setting('test.app_a')::uuid, current_setting('test.alt_analysis')::uuid, '11111111-1111-4111-8111-111111111111', repeat('d', 64), 'test-provider', 'test-model')$$, '23505', 'resume-gap-conflict', 'hash reuse cannot rebind a prior run to another analysis');

-- dblink is available in the local image, so exercise the source-delete versus
-- source-selection lock path with two bounded sessions. The source deleter
-- owns the source lock first; source selection must wait on it without holding
-- the application lock, allowing deletion to finish and SET NULL to apply.
set local role postgres;
create extension if not exists dblink;
select dblink_connect('gap_lock_a', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
select dblink_connect('gap_lock_b', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
select dblink_exec('gap_lock_a', $$delete from auth.users where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$);
select dblink_exec('gap_lock_a', $$insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated',
  'gap-c@example.com', 'test-password-hash', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
)$$);
select dblink_exec('gap_lock_a', $$delete from public.interview_questions where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$);
select dblink_exec('gap_lock_a', $$insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '77777777-7777-4777-8777-777777777777', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'concurrency-resume.pdf', 'application/pdf', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/concurrency-resume.pdf',
  1024, repeat('7', 64), 'ready'
) on conflict (id) do update set
  user_id = excluded.user_id,
  original_name = excluded.original_name,
  content_type = excluded.content_type,
  storage_path = excluded.storage_path,
  size_bytes = excluded.size_bytes,
  sha256 = excluded.sha256,
  status = excluded.status$$);
select dblink_exec('gap_lock_a', $$set role authenticated$$);
select dblink_exec('gap_lock_a', $$set request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}'$$);
select set_config('test.concurrent_app', (
  select result from dblink('gap_lock_a', $$select id::text from public.create_application(
    'Deadlock Co', 'Product Analyst', 'Berlin', 'hybrid', 'site',
    'https://example.com/jobs/concurrency', 'Concurrency test application requiring stable source and application locking.'
  )$$) as rows(result text)
), true);
select dblink_exec('gap_lock_a', format($$set test.concurrent_app = %L$$, current_setting('test.concurrent_app')));
select dblink_exec('gap_lock_a', $$do $body$
begin
  perform public.set_application_resume_source(current_setting('test.concurrent_app')::uuid, '77777777-7777-4777-8777-777777777777');
end
$body$;$$);
select dblink_exec('gap_lock_a', $$reset role$$);
select dblink_exec('gap_lock_a', $$begin$$);
select dblink_exec('gap_lock_a', $$set local lock_timeout = '2s'$$);
select dblink_exec('gap_lock_a', $$set local statement_timeout = '5s'$$);
select dblink_exec('gap_lock_a', $$do $body$ begin perform 1 from public.source_assets where id = '77777777-7777-4777-8777-777777777777' for update; end $body$;$$);
select dblink_exec('gap_lock_b', $$begin$$);
select dblink_exec('gap_lock_b', $$set local lock_timeout = '2s'$$);
select dblink_exec('gap_lock_b', $$set local statement_timeout = '5s'$$);
select dblink_exec('gap_lock_b', $$set local role authenticated$$);
select dblink_exec('gap_lock_b', $$set request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}'$$);
select dblink_exec('gap_lock_b', format($$set test.concurrent_app = %L$$, current_setting('test.concurrent_app')));
select dblink_exec('gap_lock_b', $$set test.concurrent_outcome = 'unset'$$);
select dblink_send_query('gap_lock_b', $$do $body$
begin
  perform public.set_application_resume_source(current_setting('test.concurrent_app')::uuid, '77777777-7777-4777-8777-777777777777');
  perform set_config('test.concurrent_outcome', 'unexpected-success', false);
exception when sqlstate 'P0002' then
  perform set_config('test.concurrent_outcome', 'expected-p0002', false);
end
$body$;$$);
select pg_sleep(0.2);
select dblink_send_query('gap_lock_a', $$delete from public.source_assets where id = '77777777-7777-4777-8777-777777777777'$$);
select results_eq($$select count(*)::text from dblink_get_result('gap_lock_a') as rows(result text)$$, array['1'], 'source deletion session completes without deadlock');
select results_eq($$select count(*)::text from dblink_get_result('gap_lock_a') as rows(result text)$$, array['0'], 'source deletion async result is fully drained');
select dblink_exec('gap_lock_a', $$commit$$);
select results_eq($$select count(*)::text from dblink_get_result('gap_lock_b') as rows(result text)$$, array['1'], 'source selection session completes without deadlock');
select results_eq($$select count(*)::text from dblink_get_result('gap_lock_b') as rows(result text)$$, array['0'], 'source selection async result is fully drained');
select results_eq($$select result from dblink('gap_lock_b', $inner$select current_setting('test.concurrent_outcome')$inner$) as rows(result text)$$, array['expected-p0002'], 'source selection race reports only the expected not-found outcome');
select dblink_exec('gap_lock_b', $$commit$$);
select results_eq($$select (resume_source_asset_id is null)::text from public.applications where id = current_setting('test.concurrent_app')::uuid$$, array['true'], 'bounded source-delete race leaves the application safely unselected');
select dblink_exec('gap_lock_a', $$delete from auth.users where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$);
select dblink_disconnect('gap_lock_a');
select dblink_disconnect('gap_lock_b');
set local role authenticated;

select finish();
rollback;
