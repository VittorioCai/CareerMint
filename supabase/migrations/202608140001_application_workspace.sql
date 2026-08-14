create type public.application_stage as enum (
  'preparing',
  'applied',
  'hr',
  'interview',
  'offer',
  'rejected',
  'withdrawn'
);

create type public.workplace_mode as enum (
  'unspecified',
  'onsite',
  'hybrid',
  'remote'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null
    check (char_length(btrim(company_name)) between 1 and 160),
  role_title text not null
    check (char_length(btrim(role_title)) between 1 and 160),
  location text check (
    location is null or char_length(btrim(location)) between 1 and 240
  ),
  workplace_mode public.workplace_mode not null default 'unspecified',
  source text check (
    source is null or char_length(btrim(source)) between 1 and 120
  ),
  job_url text check (
    job_url is null
    or (
      char_length(job_url) <= 2048
      and job_url ~* '^https?://'
    )
  ),
  jd_text text not null
    check (char_length(btrim(jd_text)) between 40 and 100000),
  stage public.application_stage not null default 'preparing',
  stage_changed_at timestamptz not null default now(),
  applied_at timestamptz,
  next_action text check (
    next_action is null or char_length(btrim(next_action)) between 1 and 500
  ),
  next_action_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_stage_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_stage public.application_stage,
  to_stage public.application_stage not null,
  occurred_at timestamptz not null,
  note text check (
    note is null or char_length(btrim(note)) between 1 and 2000
  ),
  created_at timestamptz not null default now(),
  check (from_stage is null or from_stage <> to_stage)
);

create index applications_user_updated_idx
  on public.applications(user_id, updated_at desc);

create index applications_user_stage_idx
  on public.applications(user_id, stage, stage_changed_at desc);

create index application_stage_events_application_occurred_idx
  on public.application_stage_events(application_id, occurred_at desc);

alter table public.applications enable row level security;
alter table public.application_stage_events enable row level security;

create policy applications_owner_select
on public.applications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy application_stage_events_owner_select
on public.application_stage_events
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.applications from anon, authenticated;
revoke all on public.application_stage_events from anon, authenticated;
grant select on public.applications to authenticated;
grant select on public.application_stage_events to authenticated;

create function public.touch_application_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_touch_updated_at
before update on public.applications
for each row execute function public.touch_application_updated_at();

create function public.create_application(
  target_company_name text,
  target_role_title text,
  target_location text,
  target_workplace_mode public.workplace_mode,
  target_source text,
  target_job_url text,
  target_jd_text text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_application public.applications%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  insert into public.applications (
    user_id,
    company_name,
    role_title,
    location,
    workplace_mode,
    source,
    job_url,
    jd_text
  )
  values (
    current_user_id,
    btrim(target_company_name),
    btrim(target_role_title),
    nullif(btrim(target_location), ''),
    coalesce(target_workplace_mode, 'unspecified'),
    nullif(btrim(target_source), ''),
    nullif(btrim(target_job_url), ''),
    btrim(target_jd_text)
  )
  returning * into created_application;

  insert into public.application_stage_events (
    application_id,
    user_id,
    from_stage,
    to_stage,
    occurred_at
  )
  values (
    created_application.id,
    current_user_id,
    null,
    created_application.stage,
    created_application.stage_changed_at
  );

  return created_application;
end;
$$;

create function public.change_application_stage(
  target_application_id uuid,
  target_stage public.application_stage,
  target_occurred_at timestamptz,
  target_note text
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_application public.applications%rowtype;
  changed_application public.applications%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_stage is null
    or target_occurred_at is null
    or target_occurred_at >= date_trunc('day', now()) + interval '1 day' then
    raise exception 'invalid-stage-change' using errcode = '22023';
  end if;

  select *
  into owned_application
  from public.applications
  where id = target_application_id
    and user_id = current_user_id
  for update;

  if owned_application.id is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  if owned_application.stage = target_stage then
    raise exception 'application-stage-unchanged' using errcode = 'P0001';
  end if;

  update public.applications
  set
    stage = target_stage,
    stage_changed_at = target_occurred_at,
    applied_at = case
      when applied_at is null and target_stage <> 'preparing'
        then target_occurred_at
      else applied_at
    end
  where id = owned_application.id
  returning * into changed_application;

  insert into public.application_stage_events (
    application_id,
    user_id,
    from_stage,
    to_stage,
    occurred_at,
    note
  )
  values (
    changed_application.id,
    current_user_id,
    owned_application.stage,
    changed_application.stage,
    target_occurred_at,
    nullif(btrim(target_note), '')
  );

  return changed_application;
end;
$$;

revoke all on function public.create_application(
  text,
  text,
  text,
  public.workplace_mode,
  text,
  text,
  text
) from public;

revoke all on function public.change_application_stage(
  uuid,
  public.application_stage,
  timestamptz,
  text
) from public;

grant execute on function public.create_application(
  text,
  text,
  text,
  public.workplace_mode,
  text,
  text,
  text
) to authenticated;

grant execute on function public.change_application_stage(
  uuid,
  public.application_stage,
  timestamptz,
  text
) to authenticated;
