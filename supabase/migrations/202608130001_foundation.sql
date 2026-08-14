create type public.fact_confirmation_status as enum (
  'pending',
  'confirmed',
  'needs_detail'
);

create type public.source_asset_status as enum (
  'uploaded',
  'extracting',
  'ready',
  'failed'
);

create type public.processing_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed'
);

create type public.processing_job_kind as enum ('resume_extract');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  interface_locale text not null default 'zh-CN'
    check (interface_locale in ('zh-CN', 'en')),
  timezone text not null default 'UTC',
  target_role text,
  target_countries text[] not null default '{}',
  job_search_language text not null default 'en',
  ai_processing_consent_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null,
  content_type text not null check (
    content_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null,
  status public.source_asset_status not null default 'uploaded',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id uuid references public.source_assets(id) on delete set null,
  fact_type text not null check (
    fact_type in (
      'summary',
      'work_experience',
      'education',
      'project',
      'skill',
      'certification',
      'language',
      'achievement',
      'story'
    )
  ),
  data jsonb not null,
  source_excerpt text,
  confirmation_status public.fact_confirmation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (confirmation_status <> 'confirmed' or confirmed_at is not null)
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.processing_job_kind not null,
  entity_id uuid not null,
  idempotency_key text not null,
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0,
  error_code text,
  error_message text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, kind, idempotency_key)
);

create index source_assets_user_created_idx
  on public.source_assets(user_id, created_at desc);

create index career_facts_user_status_idx
  on public.career_facts(user_id, confirmation_status);

create index processing_jobs_user_created_idx
  on public.processing_jobs(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.source_assets enable row level security;
alter table public.career_facts enable row level security;
alter table public.processing_jobs enable row level security;

create policy profiles_owner_all
on public.profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy source_assets_owner_all
on public.source_assets
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy career_facts_owner_all
on public.career_facts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy processing_jobs_owner_select
on public.processing_jobs
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.source_assets to authenticated;
grant select, insert, update, delete on public.career_facts to authenticated;
grant select on public.processing_jobs to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'resume-sources',
  'resume-sources',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy resume_sources_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resume-sources'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy resume_sources_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resume-sources'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy resume_sources_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resume-sources'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.create_or_get_resume_job(
  target_asset_id uuid,
  target_key text
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_job public.processing_jobs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.source_assets
    where id = target_asset_id
      and user_id = current_user_id
  ) then
    raise exception 'source-asset-not-found' using errcode = 'P0002';
  end if;

  insert into public.processing_jobs (
    user_id,
    kind,
    entity_id,
    idempotency_key
  )
  values (
    current_user_id,
    'resume_extract',
    target_asset_id,
    target_key
  )
  on conflict (user_id, kind, idempotency_key) do nothing;

  select *
  into owned_job
  from public.processing_jobs
  where user_id = current_user_id
    and kind = 'resume_extract'
    and idempotency_key = target_key;

  if owned_job.id is null or owned_job.entity_id <> target_asset_id then
    raise exception 'resume-job-conflict' using errcode = '23505';
  end if;

  return owned_job;
end;
$$;

create function public.claim_processing_job(target_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  changed_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  update public.processing_jobs
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    error_code = null,
    error_message = null,
    result = null,
    started_at = now(),
    finished_at = null
  where id = target_job_id
    and user_id = current_user_id
    and status in ('queued', 'failed');

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_resume_extraction(
  target_job_id uuid,
  target_asset_id uuid,
  accepted_facts jsonb,
  accepted_count integer,
  rejected_count integer,
  ai_usage jsonb,
  estimated_cost jsonb
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  completed_job public.processing_jobs%rowtype;
  candidate jsonb;
  candidate_type text;
  detail_reason text;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if jsonb_typeof(accepted_facts) <> 'array'
    or jsonb_array_length(accepted_facts) <> accepted_count
    or accepted_count < 0
    or rejected_count < 0 then
    raise exception 'invalid-resume-extraction-result' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.processing_jobs
    where id = target_job_id
      and user_id = current_user_id
      and entity_id = target_asset_id
      and kind = 'resume_extract'
      and status = 'running'
  ) or not exists (
    select 1
    from public.source_assets
    where id = target_asset_id
      and user_id = current_user_id
  ) then
    raise exception 'resume-job-not-running' using errcode = 'P0002';
  end if;

  for candidate in select value from jsonb_array_elements(accepted_facts)
  loop
    candidate_type := candidate ->> 'factType';
    detail_reason := nullif(btrim(candidate ->> 'needsDetailReason'), '');

    if candidate_type is null or candidate_type not in (
      'summary',
      'work_experience',
      'education',
      'project',
      'skill',
      'certification',
      'language',
      'achievement',
      'story'
    ) then
      raise exception 'unsupported-career-fact-type' using errcode = '22023';
    end if;

    insert into public.career_facts (
      user_id,
      source_asset_id,
      fact_type,
      data,
      source_excerpt,
      confirmation_status
    )
    values (
      current_user_id,
      target_asset_id,
      candidate_type,
      candidate -> 'data',
      candidate ->> 'sourceExcerpt',
      case
        when detail_reason is null then 'pending'::public.fact_confirmation_status
        else 'needs_detail'::public.fact_confirmation_status
      end
    );
  end loop;

  update public.source_assets
  set status = 'ready', error_code = null, updated_at = now()
  where id = target_asset_id
    and user_id = current_user_id;

  update public.processing_jobs
  set
    status = 'succeeded',
    result = jsonb_build_object(
      'acceptedCount', accepted_count,
      'rejectedCount', rejected_count,
      'ai', coalesce(ai_usage, '{}'::jsonb),
      'estimatedCost', estimated_cost
    ),
    error_code = null,
    error_message = null,
    finished_at = now()
  where id = target_job_id
    and user_id = current_user_id
  returning * into completed_job;

  return completed_job;
end;
$$;

create function public.fail_resume_extraction(
  target_job_id uuid,
  target_asset_id uuid,
  target_error_code text,
  target_error_message text
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_job public.processing_jobs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  update public.source_assets
  set status = 'failed', error_code = target_error_code, updated_at = now()
  where id = target_asset_id
    and user_id = current_user_id;

  update public.processing_jobs
  set
    status = 'failed',
    error_code = target_error_code,
    error_message = target_error_message,
    result = null,
    finished_at = now()
  where id = target_job_id
    and user_id = current_user_id
    and entity_id = target_asset_id
    and kind = 'resume_extract'
  returning * into failed_job;

  if failed_job.id is null then
    raise exception 'resume-job-not-found' using errcode = 'P0002';
  end if;

  return failed_job;
end;
$$;

revoke all on function public.create_or_get_resume_job(uuid, text) from public;
revoke all on function public.claim_processing_job(uuid) from public;
revoke all on function public.complete_resume_extraction(uuid, uuid, jsonb, integer, integer, jsonb, jsonb) from public;
revoke all on function public.fail_resume_extraction(uuid, uuid, text, text) from public;

grant execute on function public.create_or_get_resume_job(uuid, text) to authenticated;
grant execute on function public.claim_processing_job(uuid) to authenticated;
grant execute on function public.complete_resume_extraction(uuid, uuid, jsonb, integer, integer, jsonb, jsonb) to authenticated;
grant execute on function public.fail_resume_extraction(uuid, uuid, text, text) to authenticated;
