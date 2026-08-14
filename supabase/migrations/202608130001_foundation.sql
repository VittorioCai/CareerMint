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
