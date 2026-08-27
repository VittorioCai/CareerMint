begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'jd_structure_runs', 'JD structure runs table exists');
select has_table('public', 'jd_structure_requirements', 'JD structure requirements table exists');
select has_table('public', 'jd_structure_criteria', 'JD structure criteria table exists');
select has_table('public', 'jd_gap_v3_runs', 'JD gap V3 runs table exists');
select has_table('public', 'jd_gap_v3_requirement_results', 'JD gap V3 requirement results table exists');
select has_table('public', 'jd_gap_v3_criterion_assessments', 'JD gap V3 criterion assessments table exists');

select results_eq(
  $$select count(*)::text from pg_class where oid in (
    'public.jd_structure_runs'::regclass,
    'public.jd_structure_requirements'::regclass,
    'public.jd_structure_criteria'::regclass,
    'public.jd_gap_v3_runs'::regclass,
    'public.jd_gap_v3_requirement_results'::regclass,
    'public.jd_gap_v3_criterion_assessments'::regclass
  ) and relrowsecurity$$,
  array['6'],
  'all six V3 tables enable RLS'
);
select results_eq(
  $$select count(*)::text from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'jd_structure_runs', 'jd_structure_requirements', 'jd_structure_criteria',
        'jd_gap_v3_runs', 'jd_gap_v3_requirement_results', 'jd_gap_v3_criterion_assessments'
      )
      and grantee = 'authenticated' and privilege_type = 'SELECT'$$,
  array['6'], 'authenticated receives SELECT on every V3 table'
);
select results_eq(
  $$select count(*)::text from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'jd_structure_runs', 'jd_structure_requirements', 'jd_structure_criteria',
        'jd_gap_v3_runs', 'jd_gap_v3_requirement_results', 'jd_gap_v3_criterion_assessments'
      )
      and grantee = 'authenticated' and privilege_type <> 'SELECT'$$,
  array['0'], 'authenticated receives no direct V3 mutation privilege'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'gap-v3-a@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Gap V3 A"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'gap-v3-b@example.com', 'test-password-hash', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Gap V3 B"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256, status
) values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'synthetic-a.pdf', 'application/pdf',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/synthetic-a.pdf',
  1024, repeat('a', 64), 'uploaded'
);

insert into public.career_facts (
  id, user_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
) values
  ('33333333-3333-4333-8333-333333333333',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'skill',
   '{"title":"SQL","description":"Used SQL for weekly reporting","skills":["SQL"]}',
   'Used SQL for weekly reporting', 'confirmed', now()),
  ('44444444-4444-4444-8444-444444444444',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'skill',
   '{"title":"Pending Python","description":"Python claim pending","skills":["Python"]}',
   'Python claim pending', 'pending', null);

select set_config('test.app_a', (select id::text from public.create_application(
  'Synthetic A', 'Commercial Analyst', 'Berlin', 'hybrid', 'site',
  'https://example.com/jobs/a',
  'Use SQL or Python to analyze weekly sales funnels. At least three years of professional analytics experience is mandatory.'
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
  'synthetic-b.pdf', 'application/pdf',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/synthetic-b.pdf',
  1024, repeat('b', 64), 'ready'
);
insert into public.career_facts (
  id, user_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
) values (
  '55555555-5555-4555-8555-555555555555',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'skill',
  '{"title":"Foreign fact","description":"Other owner evidence","skills":["SQL"]}',
  'Other owner evidence', 'confirmed', now()
);
select set_config('test.app_b', (select id::text from public.create_application(
  'Synthetic B', 'Data Specialist', 'Munich', 'onsite', 'site',
  'https://example.com/jobs/b',
  'Build operational dashboards with SQL and present recommendations to senior stakeholders every month.'
)), true);
select public.set_application_resume_source(
  current_setting('test.app_b')::uuid,
  '22222222-2222-4222-8222-222222222222'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.jd_structure_runs (
      application_id, user_id, jd_sha256, input_hash, provider, model,
      schema_version, prompt_version
    ) values (
      current_setting('test.app_a')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('1', 64), repeat('2', 64),
      'test-provider', 'test-model', 'schema-v1', 'prompt-v1'
    )$$,
  '42501', 'permission denied for table jd_structure_runs',
  'authenticated users cannot insert V3 structure runs directly'
);
select throws_ok(
  $$insert into public.jd_gap_v3_runs (
      application_id, user_id, structure_run_id, source_filename,
      source_sha256, fact_fingerprint, input_hash, provider, model,
      schema_version, prompt_version, policy_version
    ) values (
      current_setting('test.app_a')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'forged.pdf',
      repeat('1', 64), repeat('2', 64), repeat('3', 64), 'x', 'y', 's', 'p', 'q'
    )$$,
  '42501', 'permission denied for table jd_gap_v3_runs',
  'authenticated users cannot insert V3 comparison runs directly'
);

select throws_ok(
  $$select public.create_or_get_jd_structure(
    current_setting('test.app_b')::uuid, repeat('1', 64), repeat('2', 64),
    'test-provider', 'test-model', 'schema-v1', 'structure-prompt-v1'
  )$$,
  'P0002', 'application-not-found',
  'structure creation rejects another owner application'
);

select set_config('test.structure_run', (select id::text
  from public.create_or_get_jd_structure(
    current_setting('test.app_a')::uuid, repeat('1', 64), repeat('2', 64),
    'test-provider', 'test-model', 'schema-v1', 'structure-prompt-v1'
  )), true);
select results_eq(
  $$select id::text from public.create_or_get_jd_structure(
    current_setting('test.app_a')::uuid, repeat('1', 64), repeat('2', 64),
    'test-provider', 'test-model', 'schema-v1', 'structure-prompt-v1'
  )$$,
  array[current_setting('test.structure_run')],
  'identical structure hashes and versions reuse the run'
);
select throws_ok(
  $$select public.create_or_get_jd_structure(
    current_setting('test.app_a')::uuid, repeat('1', 64), repeat('2', 64),
    'test-provider', 'test-model', 'schema-v2', 'structure-prompt-v1'
  )$$,
  '23505', 'jd-structure-conflict',
  'same hash cannot silently bind a different structure schema version'
);

select results_eq(
  $$select public.claim_jd_structure(current_setting('test.structure_run')::uuid, 0, 'queued', 120)$$,
  array[true], 'queued structure work can be claimed'
);
select results_eq(
  $$select public.claim_jd_structure(current_setting('test.structure_run')::uuid, 1, 'running', 120)$$,
  array[false], 'fresh structure work cannot be claimed twice'
);
set local role postgres;
update public.jd_structure_runs
set updated_at = now() - interval '3 minutes'
where id = current_setting('test.structure_run')::uuid;
set local role authenticated;
select results_eq(
  $$select public.claim_jd_structure(current_setting('test.structure_run')::uuid, 1, 'running', 120)$$,
  array[true], 'stale structure work can be reclaimed'
);
select results_eq(
  $$select public.claim_jd_structure(current_setting('test.structure_run')::uuid, 1, 'running', 120)$$,
  array[false], 'old structure attempt fencing cannot claim the new attempt'
);

select throws_ok(
  $$select public.complete_jd_structure(
    current_setting('test.structure_run')::uuid, 2,
    '需要使用 SQL 或 Python 分析销售漏斗，并至少有三年经验。',
    jsonb_build_array(jsonb_build_object(
      'category', 'skill', 'requirementType', 'required',
      'originalText', 'Use SQL or Python', 'translationZh', '使用 SQL 或 Python',
      'sourceExcerpt', 'Use SQL or Python to analyze weekly sales funnels.',
      'allowsEquivalent', false, 'explicitGate', false, 'sortOrder', 0,
      'criteria', jsonb_build_array(
        jsonb_build_object('groupKey', 'g1', 'groupRule', 'any', 'kind', 'tool',
          'originalText', 'SQL', 'translationZh', 'SQL',
          'constraint', jsonb_build_object('operator', 'one_of', 'value', 'SQL|Python', 'unit', null), 'sortOrder', 0),
        jsonb_build_object('groupKey', 'g1', 'groupRule', 'all', 'kind', 'tool',
          'originalText', 'Python', 'translationZh', 'Python',
          'constraint', jsonb_build_object('operator', 'one_of', 'value', 'SQL|Python', 'unit', null), 'sortOrder', 1)
      )
    )),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":10,"outputTokens":20},"priceScheduleVersion":null}',
    null
  )$$,
  '22023', 'invalid-jd-structure-groups',
  'structure completion rejects inconsistent criterion group rules atomically'
);
select results_eq(
  $$select count(*)::text from public.jd_structure_requirements
    where run_id = current_setting('test.structure_run')::uuid$$,
  array['0'], 'failed structure completion inserts no partial rows'
);

select public.complete_jd_structure(
  current_setting('test.structure_run')::uuid, 2,
  '需要使用 SQL 或 Python 分析销售漏斗，并至少有三年专业分析经验。',
  jsonb_build_array(
    jsonb_build_object(
      'category', 'skill', 'requirementType', 'required',
      'originalText', 'Use SQL or Python', 'translationZh', '使用 SQL 或 Python',
      'sourceExcerpt', 'Use SQL or Python to analyze weekly sales funnels.',
      'allowsEquivalent', false, 'explicitGate', false, 'sortOrder', 0,
      'criteria', jsonb_build_array(
        jsonb_build_object('groupKey', 'g1', 'groupRule', 'any', 'kind', 'tool',
          'originalText', 'SQL', 'translationZh', 'SQL',
          'constraint', jsonb_build_object('operator', 'one_of', 'value', 'SQL|Python', 'unit', null), 'sortOrder', 0),
        jsonb_build_object('groupKey', 'g1', 'groupRule', 'any', 'kind', 'tool',
          'originalText', 'Python', 'translationZh', 'Python',
          'constraint', jsonb_build_object('operator', 'one_of', 'value', 'SQL|Python', 'unit', null), 'sortOrder', 1)
      )
    ),
    jsonb_build_object(
      'category', 'hard_requirement', 'requirementType', 'required',
      'originalText', 'At least three years of professional analytics experience',
      'translationZh', '至少三年专业分析经验',
      'sourceExcerpt', 'At least three years of professional analytics experience is mandatory.',
      'allowsEquivalent', false, 'explicitGate', true, 'sortOrder', 1,
      'criteria', jsonb_build_array(
        jsonb_build_object('groupKey', 'g1', 'groupRule', 'all', 'kind', 'years_experience',
          'originalText', 'At least three years', 'translationZh', '至少三年',
          'constraint', jsonb_build_object('operator', 'gte', 'value', '3', 'unit', 'years'), 'sortOrder', 0)
      )
    )
  ),
  '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":10,"outputTokens":20},"priceScheduleVersion":null}',
  null
);
select results_eq(
  $$select status::text from public.jd_structure_runs where id = current_setting('test.structure_run')::uuid$$,
  array['succeeded'], 'valid structure completion succeeds'
);
select results_eq(
  $$select count(*)::text from public.jd_structure_requirements where run_id = current_setting('test.structure_run')::uuid$$,
  array['2'], 'structure completion stores every requirement once'
);
select results_eq(
  $$select count(*)::text from public.jd_structure_criteria where run_id = current_setting('test.structure_run')::uuid$$,
  array['3'], 'structure completion stores every atomic criterion once'
);
select results_eq(
  $$select (result ? 'jdText' or result ? 'jdTranslationZh' or result ? 'requirements')::text
    from public.jd_structure_runs where id = current_setting('test.structure_run')::uuid$$,
  array['false'], 'structure run result contains metadata and counts, not full source documents'
);

select throws_ok(
  $$select public.create_or_get_jd_gap_v3(
    current_setting('test.app_a')::uuid, current_setting('test.structure_run')::uuid,
    '22222222-2222-4222-8222-222222222222', repeat('3', 64), repeat('4', 64),
    'test-provider', 'test-model', 'schema-v1', 'gap-prompt-v1', 'policy-v1'
  )$$,
  'P0002', 'application-or-resume-not-found',
  'comparison creation rejects another owner source asset'
);
select throws_ok(
  $$select public.create_or_get_jd_gap_v3(
    current_setting('test.app_b')::uuid, current_setting('test.structure_run')::uuid,
    '11111111-1111-4111-8111-111111111111', repeat('3', 64), repeat('4', 64),
    'test-provider', 'test-model', 'schema-v1', 'gap-prompt-v1', 'policy-v1'
  )$$,
  'P0002', 'application-or-resume-not-found',
  'comparison creation rejects cross-owner application and structure bindings'
);

select set_config('test.gap_run', (select id::text
  from public.create_or_get_jd_gap_v3(
    current_setting('test.app_a')::uuid, current_setting('test.structure_run')::uuid,
    '11111111-1111-4111-8111-111111111111', repeat('3', 64), repeat('4', 64),
    'test-provider', 'test-model', 'schema-v1', 'gap-prompt-v1', 'policy-v1'
  )), true);
select results_eq(
  $$select id::text from public.create_or_get_jd_gap_v3(
    current_setting('test.app_a')::uuid, current_setting('test.structure_run')::uuid,
    '11111111-1111-4111-8111-111111111111', repeat('3', 64), repeat('4', 64),
    'test-provider', 'test-model', 'schema-v1', 'gap-prompt-v1', 'policy-v1'
  )$$,
  array[current_setting('test.gap_run')],
  'identical comparison input and versions reuse the run'
);
select results_eq(
  $$select public.claim_jd_gap_v3(current_setting('test.gap_run')::uuid, 0, 'queued', 120)$$,
  array[true], 'queued comparison work can be claimed'
);
select results_eq(
  $$select public.claim_jd_gap_v3(current_setting('test.gap_run')::uuid, 1, 'running', 120)$$,
  array[false], 'fresh comparison work cannot be claimed twice'
);
set local role postgres;
update public.jd_gap_v3_runs
set updated_at = now() - interval '3 minutes'
where id = current_setting('test.gap_run')::uuid;
set local role authenticated;
select results_eq(
  $$select public.claim_jd_gap_v3(current_setting('test.gap_run')::uuid, 1, 'running', 120)$$,
  array[true], 'stale comparison work can be reclaimed'
);

select set_config('test.req_1', (select id::text from public.jd_structure_requirements
  where run_id = current_setting('test.structure_run')::uuid and sort_order = 0), true);
select set_config('test.req_2', (select id::text from public.jd_structure_requirements
  where run_id = current_setting('test.structure_run')::uuid and sort_order = 1), true);
select set_config('test.criterion_1', (select id::text from public.jd_structure_criteria
  where run_id = current_setting('test.structure_run')::uuid and sort_order = 0
    and requirement_id = current_setting('test.req_1')::uuid), true);
select set_config('test.criterion_2', (select id::text from public.jd_structure_criteria
  where run_id = current_setting('test.structure_run')::uuid and sort_order = 1
    and requirement_id = current_setting('test.req_1')::uuid), true);
select set_config('test.criterion_3', (select id::text from public.jd_structure_criteria
  where run_id = current_setting('test.structure_run')::uuid
    and requirement_id = current_setting('test.req_2')::uuid), true);

select throws_ok(
  $$select public.complete_jd_gap_v3(
    current_setting('test.gap_run')::uuid, 2,
    jsonb_build_array(
      jsonb_build_object('requirementId', current_setting('test.req_1'), 'coverageStatus', 'partial',
        'impactLevel', 'important', 'coveredCriterionCount', 1, 'missingCriterionCount', 1, 'sortOrder', 0),
      jsonb_build_object('requirementId', current_setting('test.req_2'), 'coverageStatus', 'none',
        'impactLevel', 'blocking', 'coveredCriterionCount', 0, 'missingCriterionCount', 1, 'sortOrder', 1)
    ),
    jsonb_build_array(
      jsonb_build_object('criterionId', current_setting('test.criterion_1'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'direct', 'verifiedResumeExcerpt', 'Used SQL for weekly reporting',
        'profileFactIds', jsonb_build_array('44444444-4444-4444-8444-444444444444'),
        'gapType', 'none', 'reasonZh', 'SQL 有证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_2'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
        'gapType', 'no_supporting_fact', 'reasonZh', '没有 Python 证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_3'), 'requirementId', current_setting('test.req_2'),
        'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
        'gapType', 'no_supporting_fact', 'reasonZh', '没有三年证据。', 'userQuestionZh', '你有几年经验？')
    ),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":20,"outputTokens":30},"priceScheduleVersion":null}',
    null
  )$$,
  '22023', 'invalid-jd-gap-facts',
  'comparison completion rejects pending fact IDs atomically'
);
select results_eq(
  $$select count(*)::text from public.jd_gap_v3_criterion_assessments
    where run_id = current_setting('test.gap_run')::uuid$$,
  array['0'], 'rejected comparison completion inserts no partial assessments'
);

select throws_ok(
  $$select public.complete_jd_gap_v3(
    current_setting('test.gap_run')::uuid, 2,
    jsonb_build_array(
      jsonb_build_object('requirementId', current_setting('test.req_1'), 'coverageStatus', 'partial',
        'impactLevel', 'important', 'coveredCriterionCount', 1, 'missingCriterionCount', 1, 'sortOrder', 0),
      jsonb_build_object('requirementId', current_setting('test.req_2'), 'coverageStatus', 'none',
        'impactLevel', 'blocking', 'coveredCriterionCount', 0, 'missingCriterionCount', 1, 'sortOrder', 1)
    ),
    jsonb_build_array(
      jsonb_build_object('criterionId', current_setting('test.criterion_1'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'direct', 'verifiedResumeExcerpt', 'Used SQL for weekly reporting',
        'profileFactIds', jsonb_build_array('55555555-5555-4555-8555-555555555555'),
        'gapType', 'none', 'reasonZh', 'SQL 有证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_2'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
        'gapType', 'no_supporting_fact', 'reasonZh', '没有 Python 证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_3'), 'requirementId', current_setting('test.req_2'),
        'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
        'gapType', 'no_supporting_fact', 'reasonZh', '没有三年证据。', 'userQuestionZh', '你有几年经验？')
    ),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":20,"outputTokens":30},"priceScheduleVersion":null}', null
  )$$,
  '22023', 'invalid-jd-gap-facts',
  'comparison completion rejects cross-owner fact IDs atomically'
);

select throws_ok(
  $$select public.complete_jd_gap_v3(
    current_setting('test.gap_run')::uuid, 2,
    jsonb_build_array(
      jsonb_build_object('requirementId', current_setting('test.req_1'), 'coverageStatus', 'complete',
        'impactLevel', 'important', 'coveredCriterionCount', 1, 'missingCriterionCount', 1, 'sortOrder', 0),
      jsonb_build_object('requirementId', current_setting('test.req_2'), 'coverageStatus', 'none',
        'impactLevel', 'blocking', 'coveredCriterionCount', 0, 'missingCriterionCount', 1, 'sortOrder', 1)
    ),
    jsonb_build_array(
      jsonb_build_object('criterionId', current_setting('test.criterion_1'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'direct', 'verifiedResumeExcerpt', 'Used SQL for weekly reporting',
        'profileFactIds', '[]'::jsonb, 'gapType', 'none', 'reasonZh', 'SQL 有证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_1'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'direct', 'verifiedResumeExcerpt', 'Used SQL for weekly reporting',
        'profileFactIds', '[]'::jsonb, 'gapType', 'none', 'reasonZh', '重复证据。', 'userQuestionZh', null),
      jsonb_build_object('criterionId', current_setting('test.criterion_2'), 'requirementId', current_setting('test.req_1'),
        'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
        'gapType', 'no_supporting_fact', 'reasonZh', '没有 Python 证据。', 'userQuestionZh', null)
    ),
    '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":20,"outputTokens":30},"priceScheduleVersion":null}', null
  )$$,
  '22023', 'invalid-jd-gap-completeness',
  'duplicate and missing criterion IDs are rejected as one atomic result'
);
select results_eq(
  $$select count(*)::text from public.jd_gap_v3_criterion_assessments
    where run_id = current_setting('test.gap_run')::uuid$$,
  array['0'], 'duplicate criterion rejection leaves no assessment rows'
);

select public.complete_jd_gap_v3(
  current_setting('test.gap_run')::uuid, 2,
  jsonb_build_array(
    jsonb_build_object('requirementId', current_setting('test.req_1'), 'coverageStatus', 'complete',
      'impactLevel', 'important', 'coveredCriterionCount', 1, 'missingCriterionCount', 1, 'sortOrder', 0),
    jsonb_build_object('requirementId', current_setting('test.req_2'), 'coverageStatus', 'none',
      'impactLevel', 'blocking', 'coveredCriterionCount', 0, 'missingCriterionCount', 1, 'sortOrder', 1)
  ),
  jsonb_build_array(
    jsonb_build_object('criterionId', current_setting('test.criterion_1'), 'requirementId', current_setting('test.req_1'),
      'resumeEvidenceStatus', 'direct', 'verifiedResumeExcerpt', 'Used SQL for weekly reporting',
      'profileFactIds', jsonb_build_array('33333333-3333-4333-8333-333333333333'),
      'gapType', 'none', 'reasonZh', 'SQL 有明确证据。', 'userQuestionZh', null),
    jsonb_build_object('criterionId', current_setting('test.criterion_2'), 'requirementId', current_setting('test.req_1'),
      'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
      'gapType', 'no_supporting_fact', 'reasonZh', '没有 Python 证据。', 'userQuestionZh', null),
    jsonb_build_object('criterionId', current_setting('test.criterion_3'), 'requirementId', current_setting('test.req_2'),
      'resumeEvidenceStatus', 'none', 'verifiedResumeExcerpt', null, 'profileFactIds', '[]'::jsonb,
      'gapType', 'no_supporting_fact', 'reasonZh', '没有三年经验的证据。', 'userQuestionZh', '你有几年专业分析经验？')
  ),
  '{"provider":"test-provider","model":"test-model","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":20,"outputTokens":30},"priceScheduleVersion":null}',
  null
);
select results_eq(
  $$select count(*)::text from public.jd_gap_v3_requirement_results where run_id = current_setting('test.gap_run')::uuid$$,
  array['2'], 'valid comparison stores every requirement result exactly once'
);
select results_eq(
  $$select count(*)::text from public.jd_gap_v3_criterion_assessments where run_id = current_setting('test.gap_run')::uuid$$,
  array['3'], 'valid comparison stores every criterion assessment exactly once'
);
select results_eq(
  $$select (result ? 'jdText' or result ? 'resumeText' or result ? 'confirmedFacts' or result ? 'providerBody')::text
    from public.jd_gap_v3_runs where id = current_setting('test.gap_run')::uuid$$,
  array['false'], 'comparison run result contains metadata and counts only'
);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::text from public.jd_structure_runs where id = current_setting('test.structure_run')::uuid$$,
  array['0'], 'another owner cannot read structure runs'
);
select results_eq(
  $$select count(*)::text from public.jd_gap_v3_runs where id = current_setting('test.gap_run')::uuid$$,
  array['0'], 'another owner cannot read gap runs'
);
select throws_ok(
  $$select public.claim_jd_gap_v3(current_setting('test.gap_run')::uuid, 2, 'succeeded', 120)$$,
  'P0002', 'jd-gap-run-not-found',
  'another owner cannot claim a gap run'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('test.failed_gap_run', (select id::text
  from public.create_or_get_jd_gap_v3(
    current_setting('test.app_a')::uuid, current_setting('test.structure_run')::uuid,
    '11111111-1111-4111-8111-111111111111', repeat('5', 64), repeat('6', 64),
    'test-provider', 'test-model', 'schema-v1', 'gap-prompt-v1', 'policy-v1'
  )), true);
select public.claim_jd_gap_v3(current_setting('test.failed_gap_run')::uuid, 0, 'queued', 120);
select public.fail_jd_gap_v3(
  current_setting('test.failed_gap_run')::uuid, 1,
  'jd-gap-invalid-output', 'unsafe provider text must not be stored'
);
select results_eq(
  $$select status::text from public.jd_gap_v3_runs where id = current_setting('test.gap_run')::uuid$$,
  array['succeeded'], 'a later failure preserves the prior successful run'
);
select results_eq(
  $$select error_message from public.jd_gap_v3_runs where id = current_setting('test.failed_gap_run')::uuid$$,
  array['JD gap analysis failed.'], 'failure persists only a stable safe message'
);

delete from public.source_assets where id = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$select source_asset_id::text, source_filename, source_sha256
    from public.jd_gap_v3_runs where id = current_setting('test.gap_run')::uuid$$,
  $$values (null::text, 'synthetic-a.pdf'::text, repeat('a', 64)::text)$$,
  'source deletion clears only the live FK and preserves filename/SHA history snapshots'
);

select * from finish();
rollback;
