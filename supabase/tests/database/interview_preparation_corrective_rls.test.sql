begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_function(
  'public',
  'save_interview_question_preparation',
  array['uuid', 'text', 'text', 'text', 'uuid[]'],
  'atomic interview preparation RPC exists'
);

select is(
  public.normalize_interview_question_prompt(' Ｆｕｌｌｗｉｄｔｈ　ROADMAP？　'),
  'fullwidth roadmap',
  'normalization applies NFKC, lowercase, Unicode whitespace, and punctuation'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
    'corrective-a@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Corrective A"}', now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
    'corrective-b@example.com', 'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Corrective B"}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select set_config(
  'test.corrective_question_id',
  (
    select id::text
    from public.add_interview_question(
      'How do you prioritize roadmap work?', 'common', null, null
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
    'story',
    '{"title":"Confirmed story","description":"A confirmed story."}',
    'A confirmed story.', 'confirmed', now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'story',
    '{"title":"Pending story","description":"A pending story."}',
    'A pending story.', 'pending', null
  );

select public.update_interview_question(
  current_setting('test.corrective_question_id')::uuid,
  'outlined',
  'Old outline',
  'Old notes'
);

select public.replace_interview_question_facts(
  current_setting('test.corrective_question_id')::uuid,
  array['11111111-1111-4111-8111-111111111111'::uuid]
);

select throws_ok(
  $$
    select public.save_interview_question_preparation(
      current_setting('test.corrective_question_id')::uuid,
      'ready', 'New outline', 'New notes',
      array['22222222-2222-4222-8222-222222222222'::uuid]
    )
  $$,
  '22023',
  'invalid-interview-fact',
  'an unconfirmed fact rejects the entire atomic save'
);

select results_eq(
  $$
    select preparation_status || ':' || answer_outline || ':' || notes
    from public.interview_questions
    where id = current_setting('test.corrective_question_id')::uuid
  $$,
  array['outlined:Old outline:Old notes'::text],
  'failed atomic save leaves question state unchanged'
);

select results_eq(
  $$
    select career_fact_id::text
    from public.interview_question_facts
    where question_id = current_setting('test.corrective_question_id')::uuid
  $$,
  array['11111111-1111-4111-8111-111111111111'::text],
  'failed atomic save leaves existing fact links unchanged'
);

select throws_ok(
  $$
    select public.save_interview_question_preparation(
      current_setting('test.corrective_question_id')::uuid,
      'ready', 'New outline', 'New notes',
      array['99999999-9999-4999-8999-999999999999'::uuid]
    )
  $$,
  '22023',
  'invalid-interview-fact',
  'a missing fact id rejects the entire atomic save'
);

select results_eq(
  $$
    select preparation_status || ':' || answer_outline || ':' || notes
    from public.interview_questions
    where id = current_setting('test.corrective_question_id')::uuid
  $$,
  array['outlined:Old outline:Old notes'::text],
  'missing fact id leaves question state unchanged'
);

select lives_ok(
  $$
    select public.save_interview_question_preparation(
      current_setting('test.corrective_question_id')::uuid,
      'ready', 'New outline', 'New notes',
      array['11111111-1111-4111-8111-111111111111'::uuid]
    )
  $$,
  'valid atomic save updates state and links together'
);

select results_eq(
  $$
    select preparation_status || ':' || answer_outline || ':' || notes
    from public.interview_questions
    where id = current_setting('test.corrective_question_id')::uuid
  $$,
  array['ready:New outline:New notes'::text],
  'valid atomic save updates question state'
);

update public.career_facts
set confirmation_status = 'pending', confirmed_at = null
where id = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_facts
    where question_id = current_setting('test.corrective_question_id')::uuid
  $$,
  array[0::bigint],
  'confirmed to pending removes stale fact links'
);

update public.career_facts
set confirmation_status = 'confirmed', confirmed_at = now()
where id = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_facts
    where question_id = current_setting('test.corrective_question_id')::uuid
  $$,
  array[0::bigint],
  'reconfirming a fact does not restore a removed link'
);

select public.replace_interview_question_facts(
  current_setting('test.corrective_question_id')::uuid,
  array['11111111-1111-4111-8111-111111111111'::uuid]
);

update public.career_facts
set confirmation_status = 'needs_detail', confirmed_at = null
where id = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_facts
    where question_id = current_setting('test.corrective_question_id')::uuid
  $$,
  array[0::bigint],
  'confirmed to needs_detail removes stale fact links'
);

update public.career_facts
set confirmation_status = 'confirmed', confirmed_at = now()
where id = '11111111-1111-4111-8111-111111111111';

select public.replace_interview_question_facts(
  current_setting('test.corrective_question_id')::uuid,
  array['11111111-1111-4111-8111-111111111111'::uuid]
);

select set_config(
  'test.normalized_question_id',
  (
    select id::text
    from public.add_interview_question(
      'PM roadmap planning', 'common', null, null
    )
  ),
  true
);

select lives_ok(
  $$
    select id
    from public.add_interview_question(
      ' ＰＭ　ＲＯＡＤＭＡＰ　ＰＬＡＮＮＩＮＧ？ ', 'common', null, null
    )
  $$,
  'NFKC-equivalent wording can be added safely'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_questions
    where canonical_key = 'pm roadmap planning'
  $$,
  array[1::bigint],
  'NFKC-equivalent wording reuses one canonical question'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_variants
    where question_id = current_setting('test.normalized_question_id')::uuid
  $$,
  array[1::bigint],
  'NFKC-equivalent wording is retained as one variant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select set_config(
  'test.other_question_id',
  (
    select id::text
    from public.add_interview_question(
      'How does the other user prioritize?', 'common', null, null
    )
  ),
  true
);

insert into public.career_facts (
  id, user_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
)
values (
  '33333333-3333-4333-8333-333333333333',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'story',
  '{"title":"Other story","description":"Another confirmed story."}',
  'Another confirmed story.', 'confirmed', now()
);

select public.replace_interview_question_facts(
  current_setting('test.other_question_id')::uuid,
  array['33333333-3333-4333-8333-333333333333'::uuid]
);

update public.career_facts
set confirmation_status = 'pending', confirmed_at = null
where id = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_facts
    where question_id = current_setting('test.other_question_id')::uuid
  $$,
  array[0::bigint],
  'one user transition only removes that user''s stale links'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select count(*)::bigint
    from public.interview_question_facts
    where question_id = current_setting('test.corrective_question_id')::uuid
  $$,
  array[1::bigint],
  'another user transition cannot remove the owner''s fact links'
);

reset role;

select * from finish();
rollback;
