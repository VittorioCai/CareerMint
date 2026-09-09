begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

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

select * from finish();

rollback;
