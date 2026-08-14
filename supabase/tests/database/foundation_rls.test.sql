begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'source_assets', 'source_assets table exists');
select has_table('public', 'career_facts', 'career_facts table exists');
select has_table('public', 'processing_jobs', 'processing_jobs table exists');

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
    'user-a@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"User A"}',
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'user-b@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"User B"}',
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

insert into public.source_assets (
  id,
  user_id,
  original_name,
  content_type,
  storage_path,
  size_bytes,
  sha256
)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'resume.pdf',
  'application/pdf',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resume.pdf',
  1024,
  repeat('a', 64)
);

insert into public.career_facts (
  id,
  user_id,
  source_asset_id,
  fact_type,
  data,
  source_excerpt
)
values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'work_experience',
  '{"company":"Example GmbH","title":"Product Manager"}',
  'Product Manager at Example GmbH'
);

select results_eq(
  'select count(*)::bigint from public.source_assets',
  array[1::bigint],
  'user A can see their source asset'
);

select results_eq(
  'select count(*)::bigint from public.career_facts',
  array[1::bigint],
  'user A can see their career fact'
);

select results_eq(
  $$
    select status::text
    from public.create_or_get_resume_job(
      '11111111-1111-4111-8111-111111111111',
      'source-asset:11111111-1111-4111-8111-111111111111:resume-extract:v1'
    )
  $$,
  array['queued'::text],
  'user A can create a resume extraction job for their asset'
);

select set_config(
  'test.resume_job_id',
  (
    select id::text
    from public.create_or_get_resume_job(
      '11111111-1111-4111-8111-111111111111',
      'source-asset:11111111-1111-4111-8111-111111111111:resume-extract:v1'
    )
  ),
  true
);

select results_eq(
  $$
    select id::text
    from public.create_or_get_resume_job(
      '11111111-1111-4111-8111-111111111111',
      'source-asset:11111111-1111-4111-8111-111111111111:resume-extract:v1'
    )
  $$,
  array[current_setting('test.resume_job_id')],
  'repeating the create call returns the existing idempotent job'
);

select results_eq(
  $$select public.claim_processing_job(current_setting('test.resume_job_id')::uuid)$$,
  array[true],
  'user A can atomically claim their queued job'
);

select results_eq(
  $$select public.claim_processing_job(current_setting('test.resume_job_id')::uuid)$$,
  array[false],
  'the same running job cannot be claimed twice'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select results_eq(
  $query$
    select (
      (select count(*) from public.source_assets)
      + (select count(*) from public.career_facts)
    )::bigint
  $query$,
  array[0::bigint],
  'user B cannot see user A data'
);

select results_eq(
  $$select public.claim_processing_job(current_setting('test.resume_job_id')::uuid)$$,
  array[false],
  'user B cannot claim user A job'
);

select throws_ok(
  $$
    insert into public.processing_jobs (
      user_id,
      kind,
      entity_id,
      idempotency_key
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'resume_extract',
      gen_random_uuid(),
      'direct-insert'
    )
  $$,
  '42501',
  'permission denied for table processing_jobs',
  'authenticated users cannot directly insert processing jobs'
);

select throws_ok(
  $$update public.processing_jobs set status = 'failed'$$,
  '42501',
  'permission denied for table processing_jobs',
  'authenticated users cannot directly update processing jobs'
);

reset role;

select results_eq(
  $$select public from storage.buckets where id = 'resume-sources'$$,
  array[false],
  'resume-sources bucket is private'
);

select * from finish();
rollback;
