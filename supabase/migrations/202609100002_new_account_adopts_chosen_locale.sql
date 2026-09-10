-- A new account keeps the language its owner chose at the door.
--
-- The switch on the signed-out pages writes a cookie, which is all a visitor
-- without an account can have. Sign-up passes that choice through
-- `raw_user_meta_data`, and this trigger — which already runs at exactly the
-- right moment, before any session exists — applies it to the new profile.
--
-- Two things it deliberately does not do:
--
-- It does not trust the value. `raw_user_meta_data` is written by the client,
-- so anything outside the two shipped languages is ignored rather than passed
-- to a column whose check constraint would then abort the sign-up.
--
-- It does not repeat the default. The insert leaves the column alone and a
-- valid request updates it afterwards, so `alter column ... set default` in
-- 202609100001 stays the single place that decides what a new account gets
-- when nobody has asked for anything.
--
-- Signing in to an *existing* account never consults the cookie: that
-- account's stored language is its own, and a cookie left on a shared machine
-- must not flip it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'interface_locale';
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;

  if requested in ('en', 'zh-CN') then
    update public.profiles
      set interface_locale = requested
      where user_id = new.id;
  end if;

  perform public.seed_interview_common_questions(new.id);
  return new;
end;
$$;
