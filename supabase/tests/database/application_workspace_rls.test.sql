begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_table('public', 'applications', 'applications table exists');
select has_table(
  'public',
  'application_stage_events',
  'application stage events table exists'
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
    'application-user-a@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Application User A"}',
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'application-user-b@example.com',
    'test-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Application User B"}',
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
  'test.application_id',
  (
    select id::text
    from public.create_application(
      'Acme GmbH',
      'Product Manager',
      'Berlin, Germany',
      'hybrid',
      'Company site',
      'https://example.com/jobs/product-manager',
      repeat('A complete product manager job description. ', 3)
    )
  ),
  true
);

select results_eq(
  $$select stage::text from public.applications$$,
  array['preparing'::text],
  'new application starts in preparing'
);

select results_eq(
  $$select company_name from public.applications$$,
  array['Acme GmbH'::text],
  'user A can read their application'
);

select results_eq(
  $$select count(*)::bigint from public.application_stage_events$$,
  array[1::bigint],
  'creation writes one initial stage event'
);

select results_eq(
  $$
    select stage::text
    from public.change_application_stage(
      current_setting('test.application_id')::uuid,
      'applied',
      '2026-08-13T12:00:00Z'::timestamptz,
      'Submitted through company site'
    )
  $$,
  array['applied'::text],
  'owner can change application stage'
);

select results_eq(
  $$select applied_at::text from public.applications$$,
  array['2026-08-13 12:00:00+00'::text],
  'first post-preparing transition records applied time'
);

select results_eq(
  $$select count(*)::bigint from public.application_stage_events$$,
  array[2::bigint],
  'stage change appends one event'
);

select results_eq(
  $$
    select note
    from public.application_stage_events
    where from_stage = 'preparing' and to_stage = 'applied'
  $$,
  array['Submitted through company site'::text],
  'stage event keeps the user note'
);

select throws_ok(
  $$
    select public.change_application_stage(
      current_setting('test.application_id')::uuid,
      'applied',
      '2026-08-13T12:00:00Z'::timestamptz,
      null
    )
  $$,
  'P0001',
  'application-stage-unchanged',
  'same-stage updates are rejected'
);

select throws_ok(
  $$
    insert into public.applications (
      user_id,
      company_name,
      role_title,
      jd_text
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Direct insert',
      'Blocked role',
      repeat('This direct insert must not be permitted. ', 3)
    )
  $$,
  '42501',
  'permission denied for table applications',
  'authenticated users cannot directly insert applications'
);

select throws_ok(
  $$update public.applications set stage = 'offer'$$,
  '42501',
  'permission denied for table applications',
  'authenticated users cannot directly update applications'
);

select throws_ok(
  $$
    insert into public.application_stage_events (
      application_id,
      user_id,
      to_stage,
      occurred_at
    ) values (
      current_setting('test.application_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'offer',
      now()
    )
  $$,
  '42501',
  'permission denied for table application_stage_events',
  'authenticated users cannot forge stage events'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::bigint from public.applications$$,
  array[0::bigint],
  'user B cannot see user A application'
);

select results_eq(
  $$select count(*)::bigint from public.application_stage_events$$,
  array[0::bigint],
  'user B cannot see user A stage events'
);

select throws_ok(
  $$
    select public.change_application_stage(
      current_setting('test.application_id')::uuid,
      'interview',
      '2026-08-13T13:00:00Z'::timestamptz,
      null
    )
  $$,
  'P0002',
  'application-not-found',
  'user B cannot change user A application'
);

reset role;

select results_eq(
  $$
    select count(*)::bigint
    from public.application_stage_events
    where application_id = current_setting('test.application_id')::uuid
  $$,
  array[2::bigint],
  'failed cross-owner change did not append an event'
);

select * from finish();
rollback;
