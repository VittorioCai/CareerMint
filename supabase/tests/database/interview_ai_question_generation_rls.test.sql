begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

select has_table(
  'public', 'interview_question_generation_runs',
  'generation runs table exists'
);
select has_table(
  'public', 'interview_question_candidates',
  'generation candidates table exists'
);
select has_column(
  'public', 'application_interview_questions', 'source_excerpt',
  'application question links retain nullable JD evidence'
);
select results_eq(
  $$select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'public'
      and table_name = 'application_interview_questions'
      and column_name = 'source_excerpt'$$,
  array[true],
  'application question link evidence is nullable'
);
select has_function(
  'public', 'create_or_get_interview_question_generation',
  array['uuid', 'text', 'text', 'text', 'text'],
  'create-or-get generation RPC exists'
);
select has_function(
  'public', 'claim_interview_question_generation', array['uuid'],
  'claim generation RPC exists'
);
select has_function(
  'public', 'complete_interview_question_generation',
  array['uuid', 'jsonb', 'integer', 'jsonb', 'jsonb', 'text'],
  'complete generation RPC exists'
);
select has_function(
  'public', 'fail_interview_question_generation',
  array['uuid', 'text', 'text', 'text'],
  'fail generation RPC exists'
);
select has_function(
  'public', 'accept_interview_question_candidates',
  array['uuid', 'uuid[]'],
  'accept candidates RPC exists'
);
select has_function(
  'public', 'reject_interview_question_candidates',
  array['uuid', 'uuid[]'],
  'reject candidates RPC exists'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
    'generation-a@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Generation A"}', now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
    'generation-b@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Generation B"}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select set_config(
  'test.generation_app_id',
  (
    select id::text from public.create_application(
      'Generation A GmbH', 'Product Manager', 'Berlin', 'hybrid',
      'Company site', 'https://example.com/generation-a',
      'Lead product discovery and explain measurable customer outcomes. '
      'The product manager partners with engineering and design to prioritize roadmap work.'
    )
  ), true
);
select set_config(
  'test.other_generation_app_id',
  (
    select id::text from public.create_application(
      'Generation B GmbH', 'Product Manager', 'Munich', 'remote',
      'Company site', 'https://example.com/generation-b',
      'Lead product discovery and explain measurable customer outcomes for users.'
    )
  ), true
);

select set_config(
  'test.existing_question_id',
  (
    select id::text from public.add_interview_question(
      'How do you prioritize roadmap work?', 'function',
      current_setting('test.generation_app_id')::uuid,
      'The JD emphasizes roadmap prioritization.'
    )
  ), true
);

select results_eq(
  $$select count(*)::bigint from public.interview_question_generation_runs$$,
  array[0::bigint],
  'owner starts with no generation runs'
);

select set_config(
  'test.run_id',
  (
    select id::text from public.create_or_get_interview_question_generation(
      current_setting('test.generation_app_id')::uuid,
      repeat('a', 64), 'interview-questions-v1', 'fake', 'fake-v1'
    )
  ), true
);

select results_eq(
  $$
    select id::text from public.create_or_get_interview_question_generation(
      current_setting('test.generation_app_id')::uuid,
      repeat('a', 64), 'interview-questions-v1', 'fake', 'fake-v1'
    )
  $$,
  array[current_setting('test.run_id')],
  'create-or-get is idempotent for the complete input identity'
);

select results_eq(
  $$select status::text from public.interview_question_generation_runs$$,
  array['queued'::text],
  'new generation runs begin queued'
);

select results_eq(
  $$select public.claim_interview_question_generation(current_setting('test.run_id')::uuid)$$,
  array[true],
  'owner can claim a queued generation run'
);
select results_eq(
  $$select public.claim_interview_question_generation(current_setting('test.run_id')::uuid)$$,
  array[false],
  'running generation cannot be claimed twice'
);

select throws_ok(
  $$
    insert into public.interview_question_generation_runs (
      user_id, application_id, input_hash, schema_version, provider, model
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      current_setting('test.generation_app_id')::uuid,
      repeat('b', 64), 'interview-questions-v1', 'fake', 'direct'
    )
  $$,
  '42501', 'permission denied for table interview_question_generation_runs',
  'authenticated users cannot directly insert generation runs'
);
select throws_ok(
  $$
    insert into public.interview_question_candidates (
      run_id, application_id, user_id, sort_order, category, prompt,
      canonical_key, source_excerpt, relevance_reason
    ) values (
      current_setting('test.run_id')::uuid,
      current_setting('test.generation_app_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'function',
      'Direct candidate write', 'direct candidate write',
      'Lead product discovery', 'direct write'
    )
  $$,
  '42501', 'permission denied for table interview_question_candidates',
  'authenticated users cannot directly insert candidates'
);
select throws_ok(
  $$update public.interview_question_generation_runs
    set status = 'failed' where id = current_setting('test.run_id')::uuid$$,
  '42501', 'permission denied for table interview_question_generation_runs',
  'authenticated users cannot directly update generation runs'
);
select throws_ok(
  $$delete from public.interview_question_candidates
    where run_id = current_setting('test.run_id')::uuid$$,
  '42501', 'permission denied for table interview_question_candidates',
  'authenticated users cannot directly delete candidates'
);

select results_eq(
  $sql$
    select status::text
    from public.complete_interview_question_generation(
      current_setting('test.run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('category', 'function',
          'prompt', 'HOW do you prioritize roadmap work？',
          'sourceExcerpt', 'partners with engineering and design',
          'relevanceReason', 'The role owns roadmap decisions.'),
        jsonb_build_object('category', 'industry',
          'prompt', 'How would you explain product tradeoffs?',
          'sourceExcerpt', 'explain measurable customer outcomes',
          'relevanceReason', 'The role must communicate outcomes.'),
        jsonb_build_object('category', 'job_specific',
          'prompt', 'How do you lead product discovery?',
          'sourceExcerpt', 'Lead product discovery',
          'relevanceReason', 'Discovery is a central responsibility.'),
        jsonb_build_object('category', 'function',
          'prompt', 'How do you partner with design?',
          'sourceExcerpt', 'engineering and design',
          'relevanceReason', 'The role partners cross-functionally.'),
        jsonb_build_object('category', 'industry',
          'prompt', 'How do you measure customer outcomes?',
          'sourceExcerpt', 'measurable customer outcomes',
          'relevanceReason', 'The JD emphasizes measurable outcomes.'),
        jsonb_build_object('category', 'job_specific',
          'prompt', 'How would you prioritize product work?',
          'sourceExcerpt', 'prioritize roadmap work',
          'relevanceReason', 'Prioritization is expected in this role.')
      ),
      2,
      '{"provider":"fake","model":"fake-v1","requestId":"req-1","usage":{"inputCacheHitTokens":3,"inputCacheMissTokens":10,"outputTokens":20}}'::jsonb,
      '{"amount":0.004,"currency":"USD","priceScheduleVersion":"test-v1"}'::jsonb,
      'req-1'
    )
  $sql$,
  array['succeeded'::text],
  'completion succeeds and stores only review candidates'
);

select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates$$,
  array[6::bigint],
  'completion stores at most six pending candidates'
);
select results_eq(
  $$select count(*)::bigint from public.interview_questions where source = 'ai'$$,
  array[0::bigint],
  'completion does not write the question bank'
);
select results_eq(
  $$select count(*)::bigint from public.application_interview_questions where source_excerpt is not null$$,
  array[0::bigint],
  'completion does not write application question links'
);
select results_eq(
  $$
    select (result->>'acceptedCandidateCount') || ':' ||
      (result->>'rejectedCandidateCount') || ':' ||
      (result->>'pendingCandidateCount') || ':' ||
      (result->'ai'->>'provider') || ':' ||
      (result->'estimatedCost'->>'amount')
    from public.interview_question_generation_runs
    where id = current_setting('test.run_id')::uuid
  $$,
  array['0:2:6:fake:0.004'::text],
  'run result stores safe counts, AI metadata, and estimated cost'
);
select results_eq(
  $$select input_cache_hit_tokens || ':' || input_cache_miss_tokens || ':' || output_tokens
    from public.interview_question_generation_runs
    where id = current_setting('test.run_id')::uuid$$,
  array['3:10:20'::text],
  'run stores nested provider token usage metadata'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates where status = 'pending'$$,
  array[6::bigint],
  'all completed candidates are pending before review'
);
select set_config(
  'test.one_candidate_id',
  (select id::text from public.interview_question_candidates
    where run_id = current_setting('test.run_id')::uuid limit 1),
  true
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates where canonical_key = 'how do you prioritize roadmap work'$$,
  array[1::bigint],
  'the database computes a canonical key from the prompt'
);
select ok(
  not exists (
    select 1 from jsonb_object_keys(
      jsonb_build_object('category','function','prompt','x','sourceExcerpt','x','relevanceReason','x')
    ) as keys(key) where key = 'canonicalKey'
  ),
  'the target JSON contract has no client canonicalKey'
);

select throws_ok(
  $$
    select public.complete_interview_question_generation(
      current_setting('test.run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('category','function','prompt','Seventh candidate prompt',
          'sourceExcerpt','Lead product discovery','relevanceReason','Too many')
      ), 0, '{}'::jsonb, '{}'::jsonb, 'req-2'
    )
  $$,
  'P0002', 'interview-question-generation-not-running',
  'a completed run cannot be completed again'
);

-- Invalid completion attempts are exercised on a fresh claimed run and must roll back.
select set_config(
  'test.invalid_run_id',
  (
    select id::text from public.create_or_get_interview_question_generation(
      current_setting('test.generation_app_id')::uuid,
      repeat('c', 64), 'interview-questions-v1', 'fake', 'fake-v1'
    )
  ), true
);
select public.claim_interview_question_generation(current_setting('test.invalid_run_id')::uuid);
select throws_ok(
  $$
    select public.complete_interview_question_generation(
      current_setting('test.invalid_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('category','function','prompt','Forged excerpt prompt',
          'sourceExcerpt','This text is not in the job description','relevanceReason','Forged')
      ), 0, '{}'::jsonb, '{}'::jsonb, 'req-forged'
    )
  $$,
  '22023', 'invalid-interview-question-generation-candidate',
  'a forged source excerpt rejects completion'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates where run_id = current_setting('test.invalid_run_id')::uuid$$,
  array[0::bigint],
  'forged source excerpt rolls back candidate inserts'
);

select set_config(
  'test.forged_key_run_id',
  (
    select id::text from public.create_or_get_interview_question_generation(
      current_setting('test.generation_app_id')::uuid,
      repeat('d', 64), 'interview-questions-v1', 'fake', 'fake-v1'
    )
  ), true
);
select public.claim_interview_question_generation(current_setting('test.forged_key_run_id')::uuid);
select throws_ok(
  $$
    select public.complete_interview_question_generation(
      current_setting('test.forged_key_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('category','function','prompt','Forged key prompt',
          'canonicalKey','forged by client',
          'sourceExcerpt','Lead product discovery','relevanceReason','Forged')
      ), 0, '{}'::jsonb, '{}'::jsonb, 'req-forged-key'
    )
  $$,
  '22023', 'invalid-interview-question-generation-candidate',
  'a client canonicalKey rejects completion'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates where run_id = current_setting('test.forged_key_run_id')::uuid$$,
  array[0::bigint],
  'forged canonical key rolls back candidate inserts'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.interview_question_generation_runs),
  0,
  'cross-user RLS hides another owner''s generation run'
);
select throws_ok(
  $$select public.claim_interview_question_generation(current_setting('test.run_id')::uuid)$$,
  'P0002', 'interview-question-generation-not-found',
  'cross-user claim is denied'
);
select throws_ok(
  $$select public.reject_interview_question_candidates(current_setting('test.run_id')::uuid, array[current_setting('test.one_candidate_id')::uuid])$$,
  'P0002', 'interview-question-generation-not-found',
  'cross-user review is denied'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select results_eq(
  $sql$
    select accepted.disposition
    from public.accept_interview_question_candidates(
      current_setting('test.generation_app_id')::uuid,
      array(
        select id from public.interview_question_candidates
        where run_id = current_setting('test.run_id')::uuid
          and sort_order between 1 and 3
        order by sort_order
      )
    ) accepted
    join public.interview_question_candidates selected
      on selected.id = accepted.candidate_id
    order by selected.sort_order
  $sql$,
  array['reused'::text, 'new'::text, 'new'::text],
  'accept returns reuse and new-question dispositions'
);
select results_eq(
  $$select count(*)::bigint from public.interview_questions
    where source = 'ai' and prompt in (
      'How would you explain product tradeoffs?',
      'How do you lead product discovery?'
    )$$,
  array[2::bigint],
  'accept creates both new AI questions'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_variants where question_id = current_setting('test.existing_question_id')::uuid$$,
  array[1::bigint],
  'canonical reuse records a wording variant'
);
select results_eq(
  $$select count(*)::bigint from public.application_interview_questions where source_excerpt is not null$$,
  array[3::bigint],
  'new accepted questions receive predicted source-backed links'
);
select is(
  (select source_excerpt from public.application_interview_questions link
    join public.interview_questions question on question.id = link.question_id
    where link.application_id = current_setting('test.generation_app_id')::uuid
      and question.prompt = 'How do you lead product discovery?'),
  'Lead product discovery',
  'accepted generated links retain the candidate source excerpt'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates where run_id = current_setting('test.run_id')::uuid and status = 'accepted'$$,
  array[3::bigint],
  'accepted candidates move atomically to accepted'
);
select results_eq(
  $$select result->>'acceptedCandidateCount' from public.interview_question_generation_runs where id = current_setting('test.run_id')::uuid$$,
  array['3'::text],
  'accept updates the run accepted count atomically'
);

select results_eq(
  $$select public.reject_interview_question_candidates(
    current_setting('test.run_id')::uuid,
    array(select id from public.interview_question_candidates where run_id = current_setting('test.run_id')::uuid and status = 'pending' order by id limit 2)
  )$$,
  array[2],
  'owner can explicitly reject selected pending candidates'
);
select results_eq(
  $$select result->>'rejectedCandidateCount' from public.interview_question_generation_runs where id = current_setting('test.run_id')::uuid$$,
  array['4'::text],
  'reject updates the run rejected count atomically'
);

select throws_ok(
  $$
    select public.accept_interview_question_candidates(
      current_setting('test.generation_app_id')::uuid,
      array['99999999-9999-4999-8999-999999999999'::uuid]
    )
  $$,
  '22023', 'invalid-interview-question-candidate-selection',
  'an invalid selected set rolls back review'
);
select results_eq(
  $$select count(*)::bigint from public.interview_questions where source = 'ai'$$,
  array[2::bigint],
  'invalid review selection leaves prior question writes unchanged'
);

select set_config('test.overflow_run_id', (
  select id::text from public.create_or_get_interview_question_generation(
    current_setting('test.generation_app_id')::uuid,
    repeat('e', 64), 'interview-questions-v1', 'fake', 'fake-v1'
  )
), true);
select public.claim_interview_question_generation(current_setting('test.overflow_run_id')::uuid);
select throws_ok(
  $sql$
    select public.complete_interview_question_generation(
      current_setting('test.overflow_run_id')::uuid,
      jsonb_build_array(
        jsonb_build_object('category','function','prompt','Overflow prompt one',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt two',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt three',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt four',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt five',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt six',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow'),
        jsonb_build_object('category','function','prompt','Overflow prompt seven',
          'sourceExcerpt','Lead product discovery','relevanceReason','Overflow')
      ),
      0, '{}'::jsonb, '{}'::jsonb, 'req-overflow'
    )
  $sql$,
  '22023', 'invalid-interview-question-generation-result',
  'a seventh candidate is rejected before any insert'
);
select results_eq(
  $$select count(*)::bigint from public.interview_question_candidates
    where run_id = current_setting('test.overflow_run_id')::uuid$$,
  array[0::bigint],
  'seventh-candidate rejection is atomic'
);

select set_config('test.common_run_id', (
  select id::text from public.create_or_get_interview_question_generation(
    current_setting('test.generation_app_id')::uuid,
    repeat('f', 64), 'interview-questions-v1', 'fake', 'fake-v1'
  )
), true);
select public.claim_interview_question_generation(current_setting('test.common_run_id')::uuid);
select public.complete_interview_question_generation(
  current_setting('test.common_run_id')::uuid,
  jsonb_build_array(jsonb_build_object(
    'category','function', 'prompt','Tell me about yourself?',
    'sourceExcerpt','Lead product discovery',
    'relevanceReason','A common duplicate must not be copied.'
  )), 0, '{}'::jsonb, '{}'::jsonb, 'req-common'
);
select results_eq(
  $sql$
    select disposition from public.accept_interview_question_candidates(
      current_setting('test.generation_app_id')::uuid,
      array(select id from public.interview_question_candidates where run_id = current_setting('test.common_run_id')::uuid)
    )
  $sql$,
  array['duplicate-common'::text],
  'common canonical duplicates are rejected without copying'
);
select results_eq(
  $$select count(*)::bigint from public.application_interview_questions where application_id = current_setting('test.generation_app_id')::uuid and question_id in (select id from public.interview_questions where category = 'common') and source_excerpt is not null$$,
  array[0::bigint],
  'common duplicate review creates no generated link'
);

select results_eq(
  $$select result->>'pendingCandidateCount' from public.interview_question_generation_runs where id = current_setting('test.run_id')::uuid$$,
  array['1'::text],
  'review updates the pending count atomically'
);

reset role;
select * from finish();
rollback;
