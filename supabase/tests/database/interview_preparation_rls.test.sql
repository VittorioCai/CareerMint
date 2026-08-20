begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select has_table('public', 'interview_questions', 'interview questions table exists');
select has_table('public', 'interview_question_variants', 'question variants table exists');
select has_table('public', 'application_interview_questions', 'application question links table exists');
select has_table('public', 'interview_question_facts', 'question fact links table exists');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
    'interview-a@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Interview A"}', now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
    'interview-b@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Interview B"}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::bigint from public.interview_questions where source = 'builtin'$$,
  array[5::bigint],
  'new users receive one reusable common question set'
);

select set_config(
  'test.interview_application_id',
  (
    select id::text
    from public.create_application(
      'Acme GmbH', 'Product Manager', 'Berlin, Germany', 'hybrid',
      'Company site', 'https://example.com/jobs/product-manager',
      'Lead product discovery and explain product tradeoffs with measurable customer outcomes.'
    )
  ),
  true
);

select set_config(
  'test.question_id',
  (
    select id::text
    from public.add_interview_question(
      'How would you prioritize this product roadmap?',
      'job_specific',
      current_setting('test.interview_application_id')::uuid,
      'The role owns roadmap prioritization.'
    )
  ),
  true
);

select results_eq(
  $$select prompt from public.interview_questions where id = current_setting('test.question_id')::uuid$$,
  array['How would you prioritize this product roadmap?'::text],
  'owner can add a manual canonical question'
);

select results_eq(
  $$select count(*)::bigint from public.application_interview_questions where question_id = current_setting('test.question_id')::uuid$$,
  array[1::bigint],
  'job-specific question is linked to its application'
);

select lives_ok(
  $$
    select id
    from public.add_interview_question(
      '  HOW would you prioritize this product roadmap？  ',
      'job_specific',
      current_setting('test.interview_application_id')::uuid,
      null
    )
  $$,
  'cosmetic wording differences safely reuse the canonical question'
);

select results_eq(
  $$select count(*)::bigint from public.interview_questions where category = 'job_specific'$$,
  array[1::bigint],
  'canonical normalization prevents duplicate core questions'
);

select results_eq(
  $$select count(*)::bigint from public.interview_question_variants where question_id = current_setting('test.question_id')::uuid$$,
  array[1::bigint],
  'alternate wording is retained as a variant'
);

select results_eq(
  $$
    select preparation_status || ':' || answer_outline
    from public.save_interview_question_preparation(
      current_setting('test.question_id')::uuid,
      'outlined',
      'Situation, action, and measurable result.',
      'Practice this before the interview.',
      array[]::uuid[]
    )
  $$,
  array['outlined:Situation, action, and measurable result.'::text],
  'owner can save reusable preparation state and outline'
);

insert into public.career_facts (
  id, user_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'story',
    '{"title":"Roadmap tradeoff","organization":"Acme","startDate":null,"endDate":null,"description":"Prioritized a roadmap using customer evidence.","skills":["Prioritization"]}',
    'Prioritized a roadmap using customer evidence.', 'confirmed', now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'story',
    '{"title":"Pending story","organization":null,"startDate":null,"endDate":null,"description":"Pending evidence.","skills":[]}',
    'Pending evidence.', 'pending', null
  );

select results_eq(
  $$
    select (public.save_interview_question_preparation(
      current_setting('test.question_id')::uuid,
      'outlined',
      'Situation, action, and measurable result.',
      'Practice this before the interview.',
      array['11111111-1111-4111-8111-111111111111'::uuid]
    )).id
  $$,
  array[current_setting('test.question_id')::uuid],
  'owner can link confirmed career evidence'
);

select results_eq(
  $$select career_fact_id::text from public.interview_question_facts where question_id = current_setting('test.question_id')::uuid$$,
  array['11111111-1111-4111-8111-111111111111'::text],
  'linked evidence is stored once'
);

select throws_ok(
  $$
    select public.save_interview_question_preparation(
      current_setting('test.question_id')::uuid,
      'outlined',
      'Situation, action, and measurable result.',
      'Practice this before the interview.',
      array['22222222-2222-4222-8222-222222222222'::uuid]
    )
  $$,
  '22023',
  'invalid-interview-fact',
  'unconfirmed evidence cannot be linked'
);

select throws_ok(
  $$insert into public.interview_questions (user_id, category, canonical_key, prompt, source) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'common', 'forged', 'Forged question?', 'manual')$$,
  '42501',
  'permission denied for table interview_questions',
  'authenticated users cannot directly forge questions'
);

select throws_ok(
  $$insert into public.interview_question_variants (question_id, user_id, wording) values (current_setting('test.question_id')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged wording?')$$,
  '42501',
  'permission denied for table interview_question_variants',
  'authenticated users cannot directly forge variants'
);

select throws_ok(
  $$insert into public.application_interview_questions (application_id, question_id, user_id) values (current_setting('test.interview_application_id')::uuid, current_setting('test.question_id')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501',
  'permission denied for table application_interview_questions',
  'authenticated users cannot directly forge application links'
);

select throws_ok(
  $$insert into public.interview_question_facts (question_id, career_fact_id, user_id) values (current_setting('test.question_id')::uuid, '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501',
  'permission denied for table interview_question_facts',
  'authenticated users cannot directly forge fact links'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::bigint from public.interview_questions$$,
  array[5::bigint],
  'another user sees only their common bank'
);

select results_eq(
  $$select count(*)::bigint from public.application_interview_questions$$,
  array[0::bigint],
  'another user cannot see application question links'
);

select results_eq(
  $$select count(*)::bigint from public.interview_question_facts$$,
  array[0::bigint],
  'another user cannot see question evidence'
);

select throws_ok(
  $$select id from public.save_interview_question_preparation(current_setting('test.question_id')::uuid, 'ready', null, null, array[]::uuid[])$$,
  'P0002',
  'interview-question-not-found',
  'another user cannot update the owner question'
);

select throws_ok(
  $$select id from public.add_interview_question('What is your leadership style?', 'job_specific', current_setting('test.interview_application_id')::uuid, null)$$,
  'P0002',
  'application-not-found',
  'another user cannot add questions to the owner application'
);

reset role;

select results_eq(
  $$select count(*)::bigint from public.interview_questions$$,
  array[11::bigint],
  'failed cross-owner operations did not create extra questions'
);

select * from finish();
rollback;
