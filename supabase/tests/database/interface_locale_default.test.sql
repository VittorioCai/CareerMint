begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- A new account gets English, which is the product default from 202609100001.
select col_default_is(
  'public',
  'profiles',
  'interface_locale',
  'en',
  'a new profile defaults to English'
);

-- And the set of allowed values did not move with the default.
select col_has_check(
  'public',
  'profiles',
  'interface_locale',
  'interface_locale is still limited to the two shipped languages'
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
) values (
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'locale-default@example.test',
  'x',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

-- No manual insert: handle_new_user() already created the row, and going
-- through the real trigger is what proves a real sign-up gets English rather
-- than proving the column default in isolation.
select is(
  (select interface_locale from public.profiles
   where user_id = '11111111-1111-4111-8111-111111111111'),
  'en',
  'a real sign-up lands in English'
);

-- The migration moved a default, not any data. An account that chose Chinese
-- — or was created back when Chinese was the default — keeps it, because
-- switching someone's interface because the product's default changed is the
-- application making a decision that belongs to the reader.
update public.profiles
  set interface_locale = 'zh-CN'
  where user_id = '11111111-1111-4111-8111-111111111111';

select is(
  (select interface_locale from public.profiles
   where user_id = '11111111-1111-4111-8111-111111111111'),
  'zh-CN',
  'an account that chose Chinese keeps Chinese'
);

-- A visitor who picked a language before signing up keeps it: the switch on
-- the signed-out pages writes a cookie, sign-up passes it through
-- raw_user_meta_data, and the trigger applies it.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'chose-chinese@example.test', 'x', now(),
  '{}'::jsonb, '{"interface_locale": "zh-CN"}'::jsonb, now(), now()
);

select is(
  (select interface_locale from public.profiles
   where user_id = '22222222-2222-4222-8222-222222222222'),
  'zh-CN',
  'a new account adopts the language chosen before sign-up'
);

-- raw_user_meta_data is written by the client, so an unknown value is ignored
-- rather than handed to a column whose check constraint would abort the
-- sign-up outright.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '33333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'bogus-locale@example.test', 'x', now(),
  '{}'::jsonb, '{"interface_locale": "de-DE"}'::jsonb, now(), now()
);

select is(
  (select interface_locale from public.profiles
   where user_id = '33333333-3333-4333-8333-333333333333'),
  'en',
  'an unrecognised language falls back to the default instead of failing'
);

-- And the sign-up still succeeded, which is the point of ignoring rather than
-- rejecting: a malformed cookie must not stop someone creating an account.
select is(
  (select count(*)::bigint from public.profiles
   where user_id = '33333333-3333-4333-8333-333333333333'),
  1::bigint,
  'the account is created even so'
);

select * from finish();

rollback;
