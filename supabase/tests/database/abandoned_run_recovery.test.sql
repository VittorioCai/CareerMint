begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- A run is marked 'running' the moment it is claimed. If the serverless
-- function then dies (route maxDuration is 60s, so a deploy, crash or timeout
-- all end it), nothing moves the row out of 'running' and the user can never
-- retry. Difference analysis and interview generation already recover from
-- this; extraction, JD analysis and resume generation did not.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'recovery@example.com',
  'test-password-hash', now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Recovery"}', now(), now()
);

set local role postgres;

insert into public.applications (id, user_id, company_name, role_title, jd_text)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Recovery GmbH', 'Product Analyst',
  'We need a product analyst who can build funnel reports and explain them to business stakeholders.'
);

insert into public.processing_jobs (id, user_id, kind, entity_id, idempotency_key)
values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'resume_extract', gen_random_uuid(), 'recovery-job'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

-- resume extraction
select results_eq(
  $$select public.claim_processing_job('22222222-2222-4222-8222-222222222222')$$,
  array[true], 'queued extraction can be claimed'
);
select results_eq(
  $$select public.claim_processing_job('22222222-2222-4222-8222-222222222222')$$,
  array[false], 'extraction running right now cannot be claimed twice'
);
set local role postgres;
update public.processing_jobs set started_at = now() - interval '5 minutes'
where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select results_eq(
  $$select public.claim_processing_job('22222222-2222-4222-8222-222222222222')$$,
  array[true], 'abandoned extraction can be reclaimed'
);
select results_eq(
  $$select attempt_count::text from public.processing_jobs
    where id = '22222222-2222-4222-8222-222222222222'$$,
  array['2'], 'reclaiming an abandoned extraction counts as a new attempt'
);

select * from finish();

rollback;
