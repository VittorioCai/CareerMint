begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select has_table('public', 'resume_generation_runs', 'resume generation runs table exists');
select has_table('public', 'resume_suggestions', 'resume suggestions table exists');
select has_table('public', 'resume_suggestion_facts', 'resume suggestion facts table exists');
select has_table('public', 'resume_suggestion_requirements', 'resume suggestion requirements table exists');
select has_table('public', 'resume_versions', 'resume versions table exists');
select has_table('public', 'resume_version_items', 'resume version items table exists');
select has_table('public', 'resume_version_item_evidence', 'resume version evidence table exists');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
    'resume-a@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Resume A"}', now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
    'resume-b@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Resume B"}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select set_config(
  'test.resume_application_id',
  (
    select id::text
    from public.create_application(
      'Acme GmbH', 'Product Manager', 'Berlin, Germany', 'hybrid',
      'Company site', 'https://example.com/jobs/product-manager',
      'Lead product discovery across international markets. Advanced SQL experience is required for funnel analysis.'
    )
  ),
  true
);

insert into public.career_facts (
  id, user_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'achievement',
    '{"title":"Checkout conversion improvement","organization":"Acme GmbH","startDate":null,"endDate":null,"description":"Improved checkout conversion by 18%.","skills":["SQL"]}',
    'Improved checkout conversion by 18%.', 'confirmed', now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'skill',
    '{"title":"Discovery","organization":null,"startDate":null,"endDate":null,"description":"Product discovery","skills":[]}',
    'Product discovery', 'pending', null
  );

select set_config(
  'test.analysis_run_id',
  (
    select id::text
    from public.create_or_get_application_analysis(
      current_setting('test.resume_application_id')::uuid,
      repeat('a', 64), 'fake', 'fake-jd-v1'
    )
  ),
  true
);

select public.claim_application_analysis(current_setting('test.analysis_run_id')::uuid);

select public.complete_application_analysis(
  current_setting('test.analysis_run_id')::uuid,
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
  0, 0,
  '{"provider":"fake","model":"fake-jd-v1","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}',
  null
);

select set_config(
  'test.requirement_id',
  (
    select id::text
    from public.application_requirements
    where application_id = current_setting('test.resume_application_id')::uuid
    limit 1
  ),
  true
);

select set_config(
  'test.resume_run_id',
  (
    select id::text
    from public.create_or_get_resume_generation(
      current_setting('test.resume_application_id')::uuid,
      repeat('b', 64), 'fake', 'fake-resume-v1'
    )
  ),
  true
);

select results_eq(
  $$
    select id::text
    from public.create_or_get_resume_generation(
      current_setting('test.resume_application_id')::uuid,
      repeat('b', 64), 'fake', 'fake-resume-v1'
    )
  $$,
  array[current_setting('test.resume_run_id')],
  'identical resume input reuses one run'
);

select results_eq(
  $$select public.claim_resume_generation(current_setting('test.resume_run_id')::uuid)$$,
  array[true],
  'owner can claim a queued resume generation once'
);

select results_eq(
  $$select public.claim_resume_generation(current_setting('test.resume_run_id')::uuid)$$,
  array[false],
  'a running generation cannot be claimed twice'
);

select results_eq(
  $sql$
    select status::text
    from public.complete_resume_generation(
      current_setting('test.resume_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'section', 'achievement',
          'content', 'Improved checkout conversion by 18% through SQL-led funnel analysis.',
          'reason', 'Directly supports the core SQL requirement.',
          'factIds', jsonb_build_array('11111111-1111-4111-8111-111111111111'),
          'requirementIds', jsonb_build_array(current_setting('test.requirement_id'))
        )
      ),
      0, 0,
      '{"provider":"fake","model":"fake-resume-v1","requestId":null,"usage":{"inputCacheHitTokens":0,"inputCacheMissTokens":0,"outputTokens":0},"priceScheduleVersion":null}',
      null
    )
  $sql$,
  array['succeeded'::text],
  'owner can atomically complete a running resume generation'
);

select results_eq(
  $$select count(*)::bigint from public.resume_suggestions$$,
  array[1::bigint],
  'completion writes the validated suggestion set'
);

select results_eq(
  $$select career_fact_id::text from public.resume_suggestion_facts$$,
  array['11111111-1111-4111-8111-111111111111'::text],
  'completion links a confirmed fact'
);

select results_eq(
  $$select requirement_id::text from public.resume_suggestion_requirements$$,
  array[current_setting('test.requirement_id')],
  'completion links a requirement from the same application'
);

select results_eq(
  $$select result ->> 'acceptedSuggestionCount' from public.resume_generation_runs$$,
  array['1'::text],
  'run result stores safe counts and AI metadata'
);

select throws_ok(
  $$
    insert into public.resume_generation_runs (
      application_id, user_id, input_hash, provider, model
    ) values (
      current_setting('test.resume_application_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('z', 64), 'fake', 'forged'
    )
  $$,
  '42501',
  'permission denied for table resume_generation_runs',
  'authenticated users cannot directly forge generation runs'
);

select throws_ok(
  $$
    insert into public.resume_suggestions (
      run_id, application_id, user_id, section, content, reason, sort_order
    ) values (
      current_setting('test.resume_run_id')::uuid,
      current_setting('test.resume_application_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'summary', 'Forged content', 'Forged reason', 2
    )
  $$,
  '42501',
  'permission denied for table resume_suggestions',
  'authenticated users cannot directly forge suggestions'
);

select set_config(
  'test.suggestion_id',
  (select id::text from public.resume_suggestions limit 1),
  true
);

select throws_ok(
  $$
    select public.review_resume_suggestion(
      current_setting('test.suggestion_id')::uuid,
      'accepted',
      'Improved checkout conversion by 40% using SQL.'
    )
  $$,
  '22023',
  'invalid-resume-content',
  'review rejects a changed number absent from confirmed evidence'
);

select results_eq(
  $$
    select decision || ':' || reviewed_content
    from public.review_resume_suggestion(
      current_setting('test.suggestion_id')::uuid,
      'accepted',
      'Improved checkout conversion by 18% using SQL funnel analysis.'
    )
  $$,
  array['accepted:Improved checkout conversion by 18% using SQL funnel analysis.'::text],
  'owner can edit and accept a suggestion without changing its evidence'
);

select set_config(
  'test.version_one_id',
  (
    select id::text
    from public.create_resume_version(
      current_setting('test.resume_application_id')::uuid,
      current_setting('test.resume_run_id')::uuid,
      'simple'
    )
  ),
  true
);

select results_eq(
  $$select version_number from public.resume_versions where id = current_setting('test.version_one_id')::uuid$$,
  array[1],
  'first saved resume is V1'
);

select results_eq(
  $$select content from public.resume_version_items where version_id = current_setting('test.version_one_id')::uuid$$,
  array['Improved checkout conversion by 18% using SQL funnel analysis.'::text],
  'version snapshot uses the reviewed content'
);

select results_eq(
  $$select fact_snapshot #>> '{data,description}' from public.resume_version_item_evidence$$,
  array['Improved checkout conversion by 18%.'::text],
  'version evidence captures an immutable fact snapshot'
);

select throws_ok(
  $$update public.resume_versions set version_number = 99 where id = current_setting('test.version_one_id')::uuid$$,
  '42501',
  'permission denied for table resume_versions',
  'authenticated users cannot mutate saved versions'
);

select lives_ok(
  $$
    select id
    from public.create_resume_version(
      current_setting('test.resume_application_id')::uuid,
      current_setting('test.resume_run_id')::uuid,
      'modern'
    )
  $$,
  'owner can save a later full snapshot from reviewed suggestions'
);

select results_eq(
  $$select version_number from public.resume_versions order by version_number$$,
  array[1, 2],
  'later snapshots receive a monotonically increasing version number'
);

select set_config(
  'test.invalid_resume_run_id',
  (
    select id::text
    from public.create_or_get_resume_generation(
      current_setting('test.resume_application_id')::uuid,
      repeat('c', 64), 'fake', 'fake-resume-v1'
    )
  ),
  true
);
select public.claim_resume_generation(current_setting('test.invalid_resume_run_id')::uuid);

select throws_ok(
  $sql$
    select public.complete_resume_generation(
      current_setting('test.invalid_resume_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'section', 'experience', 'content', 'Unsupported discovery leadership.',
          'reason', 'Uses an unconfirmed fact.',
          'factIds', jsonb_build_array('22222222-2222-4222-8222-222222222222'),
          'requirementIds', jsonb_build_array()
        )
      ),
      0, 0, '{}', null
    )
  $sql$,
  '22023',
  'invalid-resume-evidence',
  'completion rejects unconfirmed fact evidence'
);

select set_config(
  'test.unsupported_resume_run_id',
  (
    select id::text
    from public.create_or_get_resume_generation(
      current_setting('test.resume_application_id')::uuid,
      repeat('e', 64), 'fake', 'fake-resume-v1'
    )
  ),
  true
);
select public.claim_resume_generation(current_setting('test.unsupported_resume_run_id')::uuid);

select throws_ok(
  $sql$
    select public.complete_resume_generation(
      current_setting('test.unsupported_resume_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'section', 'achievement',
          'content', 'Improved checkout conversion by 40%.',
          'reason', 'Changes the confirmed result.',
          'factIds', jsonb_build_array('11111111-1111-4111-8111-111111111111'),
          'requirementIds', jsonb_build_array()
        )
      ),
      0, 0, '{}', null
    )
  $sql$,
  '22023',
  'invalid-resume-content',
  'completion rejects a changed number absent from confirmed evidence'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::bigint from public.resume_generation_runs$$,
  array[0::bigint],
  'user B cannot see user A generation runs'
);

select results_eq(
  $$select count(*)::bigint from public.resume_suggestions$$,
  array[0::bigint],
  'user B cannot see user A suggestions'
);

select results_eq(
  $$select count(*)::bigint from public.resume_versions$$,
  array[0::bigint],
  'user B cannot see user A versions'
);

select results_eq(
  $$select count(*)::bigint from public.resume_version_items$$,
  array[0::bigint],
  'user B cannot see user A version items'
);

select throws_ok(
  $$
    select public.create_or_get_resume_generation(
      current_setting('test.resume_application_id')::uuid,
      repeat('d', 64), 'fake', 'fake-resume-v1'
    )
  $$,
  'P0002',
  'application-not-found',
  'user B cannot create a generation run for user A application'
);

select results_eq(
  $$select public.claim_resume_generation(current_setting('test.resume_run_id')::uuid)$$,
  array[false],
  'user B cannot claim user A generation run'
);

select * from finish();
rollback;
