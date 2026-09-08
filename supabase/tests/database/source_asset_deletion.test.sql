begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Deleting an uploaded resume removes the file and nothing else. Confirmed
-- career facts, past difference analyses and the applications that used it all
-- survive; they simply lose the pointer back to the file. The one thing that
-- has to be cleared first is the duplicate self-reference, which is RESTRICT.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'owner@example.com',
    'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Owner"}', now(), now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'stranger@example.com',
    'test-password-hash', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Stranger"}', now(), now()
  );

set local role postgres;

insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256
)
values
  (
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'resume.pdf', 'application/pdf',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222/source.pdf',
    1024, repeat('a', 64)
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'other.pdf', 'application/pdf',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/44444444-4444-4444-8444-444444444444/source.pdf',
    1024, repeat('b', 64)
  );

-- The canonical uniqueness index only covers rows with a null duplicate_of_id,
-- so a duplicate has to arrive already pointing at its canonical row.
insert into public.source_assets (
  id, user_id, original_name, content_type, storage_path, size_bytes, sha256,
  duplicate_of_id
)
values (
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'resume-copy.pdf', 'application/pdf',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/33333333-3333-4333-8333-333333333333/source.pdf',
  1024, repeat('a', 64),
  '22222222-2222-4222-8222-222222222222'
);

insert into public.career_facts (
  id, user_id, source_asset_id, fact_type, data, source_excerpt,
  confirmation_status, confirmed_at
)
values (
  '55555555-5555-4555-8555-555555555555',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'work_experience',
  '{"title":"Product Analyst","organization":"Northstar","description":"Built funnel reports.","skills":["SQL"]}'::jsonb,
  'Built funnel reports.',
  'confirmed', now()
);

insert into public.applications (
  id, user_id, company_name, role_title, jd_text, resume_source_asset_id
)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Northstar GmbH', 'Product Analyst',
  'We need a product analyst who can build funnel reports and explain them to business stakeholders.',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.resume_jd_difference_runs (
  id, application_id, user_id, source_asset_id, source_filename,
  source_sha256, jd_sha256, fact_fingerprint, input_hash,
  provider, model, schema_version, prompt_version, policy_version, status
)
values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'resume.pdf',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
  'deepseek', 'deepseek-v4-flash',
  'resume-jd-difference-v4', 'resume-jd-difference-p1-v5.0',
  'resume-jd-difference-policy-v4.0', 'queued'
);

-- Shape of the function itself.

select has_function(
  'public', 'delete_owned_source_asset', array['uuid'],
  'delete_owned_source_asset(uuid) exists'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_owned_source_asset'
  ),
  true,
  'runs as security definer so it can clear restricting children'
);

select is(
  (
    select 'search_path=""' = any(p.proconfig)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_owned_source_asset'
  ),
  true,
  'pins an empty search_path'
);

select function_privs_are(
  'public', 'delete_owned_source_asset', array['uuid'],
  'authenticated', array['EXECUTE'],
  'signed-in users may delete their own uploads'
);

select function_privs_are(
  'public', 'delete_owned_source_asset', array['uuid'],
  'anon', array[]::text[],
  'anonymous callers may not'
);

-- Behaviour, as the owner.

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.delete_owned_source_asset('22222222-2222-4222-8222-222222222222')$$,
  'the owner can delete an asset that has a duplicate pointing at it'
);

select is_empty(
  $$select 1 from public.source_assets
    where id in (
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333'
    )$$,
  'the canonical asset and its duplicates are both gone'
);

select is(
  (
    select confirmation_status::text from public.career_facts
    where id = '55555555-5555-4555-8555-555555555555'
  ),
  'confirmed',
  'a confirmed career fact survives and stays confirmed'
);

select is(
  (
    select source_asset_id from public.career_facts
    where id = '55555555-5555-4555-8555-555555555555'
  ),
  null,
  'the career fact only loses its pointer to the file'
);

select is(
  (
    select source_filename from public.resume_jd_difference_runs
    where id = '66666666-6666-4666-8666-666666666666'
  ),
  'resume.pdf',
  'a past difference analysis keeps the filename it was run against'
);

select is(
  (
    select source_asset_id from public.resume_jd_difference_runs
    where id = '66666666-6666-4666-8666-666666666666'
  ),
  null,
  'the difference run only loses its pointer to the file'
);

select is(
  (
    select resume_source_asset_id from public.applications
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  null,
  'the application falls back to having no baseline'
);

select throws_ok(
  $$select public.delete_owned_source_asset('22222222-2222-4222-8222-222222222222')$$,
  'P0002',
  'source-asset-not-found',
  'deleting the same asset twice reports not-found rather than succeeding'
);

select throws_ok(
  $$select public.delete_owned_source_asset('44444444-4444-4444-8444-444444444444')$$,
  'P0002',
  'source-asset-not-found',
  'another user''s asset is indistinguishable from a missing one'
);

select * from finish();

rollback;
