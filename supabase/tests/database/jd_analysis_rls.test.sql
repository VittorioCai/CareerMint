begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_table(
  'public',
  'application_analysis_runs',
  'application analysis runs table exists'
);
select has_table(
  'public',
  'application_requirements',
  'application requirements table exists'
);
select has_table(
  'public',
  'application_requirement_evidence',
  'application requirement evidence table exists'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'jd-analysis-a@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"JD Analysis A"}',
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'jd-analysis-b@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"JD Analysis B"}',
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select set_config(
  'test.jd_application_id',
  (
    select id::text
    from public.create_application(
      'Acme GmbH',
      'Product Manager',
      'Berlin, Germany',
      'hybrid',
      'Company site',
      'https://example.com/jobs/product-manager',
      'Lead product discovery across international markets. Advanced SQL experience is required for funnel analysis.'
    )
  ),
  true
);

insert into public.career_facts (
  id,
  user_id,
  fact_type,
  data,
  source_excerpt,
  confirmation_status,
  confirmed_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'achievement',
    '{"title":"Checkout conversion improvement","organization":"Acme GmbH","startDate":null,"endDate":null,"description":"Improved checkout conversion by 18%.","skills":["SQL"]}',
    'Improved checkout conversion by 18%.',
    'confirmed',
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'skill',
    '{"title":"Discovery","organization":null,"startDate":null,"endDate":null,"description":"Product discovery","skills":[]}',
    'Product discovery',
    'pending',
    null
  );

select set_config(
  'test.jd_run_id',
  (
    select id::text
    from public.create_or_get_application_analysis(
      current_setting('test.jd_application_id')::uuid,
      repeat('a', 64),
      'fake',
      'fake-jd-v1'
    )
  ),
  true
);

select results_eq(
  $$
    select id::text
    from public.create_or_get_application_analysis(
      current_setting('test.jd_application_id')::uuid,
      repeat('a', 64),
      'fake',
      'fake-jd-v1'
    )
  $$,
  array[current_setting('test.jd_run_id')],
  'the same analysis input reuses one run'
);

select results_eq(
  $$select public.claim_application_analysis(current_setting('test.jd_run_id')::uuid)$$,
  array[true],
  'owner can claim a queued analysis once'
);

select results_eq(
  $$select public.claim_application_analysis(current_setting('test.jd_run_id')::uuid)$$,
  array[false],
  'a running analysis cannot be claimed twice'
);

select results_eq(
  $sql$
    select status::text
    from public.complete_application_analysis(
      current_setting('test.jd_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'category', 'skill',
          'text', 'Advanced SQL',
          'sourceExcerpt', 'Advanced SQL experience is required for funnel analysis.',
          'priority', 'core',
          'matchStatus', 'evidence',
          'matchReason', 'The confirmed achievement lists SQL.',
          'matchedFactIds', jsonb_build_array('11111111-1111-4111-8111-111111111111')
        )
      ),
      0,
      0,
      '{"provider":"fake","model":"fake-jd-v1","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}',
      null
    )
  $sql$,
  array['succeeded'::text],
  'owner can atomically complete a running analysis'
);

select results_eq(
  $$select count(*)::bigint from public.application_requirements$$,
  array[1::bigint],
  'completion writes the sanitized requirement set'
);

select results_eq(
  $$select career_fact_id::text from public.application_requirement_evidence$$,
  array['11111111-1111-4111-8111-111111111111'::text],
  'completion links only explicit career fact evidence'
);

select results_eq(
  $$select result ->> 'acceptedRequirementCount' from public.application_analysis_runs$$,
  array['1'::text],
  'run result stores only safe counts and metadata'
);

select throws_ok(
  $$
    insert into public.application_analysis_runs (
      application_id,
      user_id,
      input_hash,
      provider,
      model
    ) values (
      current_setting('test.jd_application_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('z', 64),
      'fake',
      'forged'
    )
  $$,
  '42501',
  'permission denied for table application_analysis_runs',
  'authenticated users cannot directly insert analysis runs'
);

select throws_ok(
  $$
    insert into public.application_requirements (
      analysis_run_id,
      application_id,
      user_id,
      category,
      requirement_text,
      source_excerpt,
      priority,
      match_status
    ) values (
      current_setting('test.jd_run_id')::uuid,
      current_setting('test.jd_application_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'skill',
      'Forged',
      'Forged requirement evidence',
      'core',
      'none'
    )
  $$,
  '42501',
  'permission denied for table application_requirements',
  'authenticated users cannot directly forge requirements'
);

select throws_ok(
  $$
    insert into public.application_requirement_evidence (
      requirement_id,
      career_fact_id,
      application_id,
      user_id
    )
    select
      id,
      '11111111-1111-4111-8111-111111111111',
      application_id,
      user_id
    from public.application_requirements
    limit 1
  $$,
  '42501',
  'permission denied for table application_requirement_evidence',
  'authenticated users cannot directly forge evidence links'
);

select set_config(
  'test.invalid_jd_run_id',
  (
    select id::text
    from public.create_or_get_application_analysis(
      current_setting('test.jd_application_id')::uuid,
      repeat('b', 64),
      'fake',
      'fake-jd-v1'
    )
  ),
  true
);

select public.claim_application_analysis(
  current_setting('test.invalid_jd_run_id')::uuid
);

select throws_ok(
  $sql$
    select public.complete_application_analysis(
      current_setting('test.invalid_jd_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'category', 'responsibility',
          'text', 'Lead discovery',
          'sourceExcerpt', 'Lead product discovery across international markets.',
          'priority', 'core',
          'matchStatus', 'evidence',
          'matchReason', 'Pending facts are not evidence.',
          'matchedFactIds', jsonb_build_array('22222222-2222-4222-8222-222222222222')
        )
      ),
      0,
      0,
      '{}',
      null
    )
  $sql$,
  '22023',
  'invalid-analysis-evidence',
  'completion rejects evidence that is not a confirmed owned fact'
);

select results_eq(
  $$select count(*)::bigint from public.application_requirements$$,
  array[1::bigint],
  'failed completion preserves the prior successful requirement set'
);

select set_config(
  'test.failed_jd_run_id',
  (
    select id::text
    from public.create_or_get_application_analysis(
      current_setting('test.jd_application_id')::uuid,
      repeat('c', 64),
      'fake',
      'fake-jd-v1'
    )
  ),
  true
);

select public.claim_application_analysis(
  current_setting('test.failed_jd_run_id')::uuid
);

select results_eq(
  $sql$
    select status::text
    from public.fail_application_analysis(
      current_setting('test.failed_jd_run_id')::uuid,
      'jd-analysis-invalid-output',
      '岗位分析失败，请稍后重试。'
    )
  $sql$,
  array['failed'::text],
  'a running analysis records a sanitized failure'
);

select results_eq(
  $$select public.claim_application_analysis(current_setting('test.failed_jd_run_id')::uuid)$$,
  array[true],
  'a failed analysis can be claimed for retry'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::bigint from public.application_analysis_runs$$,
  array[0::bigint],
  'user B cannot see user A analysis runs'
);

select results_eq(
  $$select count(*)::bigint from public.application_requirements$$,
  array[0::bigint],
  'user B cannot see user A requirements'
);

select results_eq(
  $$select count(*)::bigint from public.application_requirement_evidence$$,
  array[0::bigint],
  'user B cannot see user A evidence links'
);

select throws_ok(
  $$
    select public.create_or_get_application_analysis(
      current_setting('test.jd_application_id')::uuid,
      repeat('d', 64),
      'fake',
      'fake-jd-v1'
    )
  $$,
  'P0002',
  'application-not-found',
  'user B cannot create an analysis for user A application'
);

select results_eq(
  $$select public.claim_application_analysis(current_setting('test.jd_run_id')::uuid)$$,
  array[false],
  'user B cannot claim user A analysis run'
);

select * from finish();
rollback;
