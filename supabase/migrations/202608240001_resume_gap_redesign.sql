alter table public.applications
  add column resume_source_asset_id uuid
    references public.source_assets(id) on delete set null;

create type public.resume_coverage as enum ('covered', 'partial', 'missing');

create function public.resume_gap_json_has_exact_keys(
  payload jsonb,
  expected_keys text[]
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(payload) = 'object'
    and (select count(*) from jsonb_object_keys(payload)) = cardinality(expected_keys)
    and not exists (
      select 1 from jsonb_object_keys(payload) as actual(key)
      where actual.key <> all(expected_keys)
    )
    and not exists (
      select 1 from unnest(expected_keys) as expected(key)
      where not payload ? expected.key
    );
$$;

create table public.resume_gap_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_run_id uuid not null
    references public.application_analysis_runs(id) on delete cascade,
  source_asset_id uuid references public.source_assets(id) on delete set null,
  source_filename text not null
    check (char_length(btrim(source_filename)) between 1 and 260),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null
    check (char_length(btrim(provider)) between 1 and 80),
  model text not null
    check (char_length(btrim(model)) between 1 and 160),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  result jsonb check (
    result is null
    or (
      jsonb_typeof(result) = 'object'
      and public.resume_gap_json_has_exact_keys(result, array['acceptedItemCount', 'coveredItemCount', 'partialItemCount', 'missingItemCount', 'ai', 'estimatedCost'])
      and result ? 'acceptedItemCount'
      and result ? 'coveredItemCount'
      and result ? 'partialItemCount'
      and result ? 'missingItemCount'
      and result ? 'ai'
      and result ? 'estimatedCost'
      and jsonb_typeof(result -> 'acceptedItemCount') = 'number'
      and jsonb_typeof(result -> 'coveredItemCount') = 'number'
      and jsonb_typeof(result -> 'partialItemCount') = 'number'
      and jsonb_typeof(result -> 'missingItemCount') = 'number'
      and (result ->> 'acceptedItemCount') ~ '^[0-9]+$'
      and (result ->> 'coveredItemCount') ~ '^[0-9]+$'
      and (result ->> 'partialItemCount') ~ '^[0-9]+$'
      and (result ->> 'missingItemCount') ~ '^[0-9]+$'
      and jsonb_typeof(result -> 'ai') = 'object'
      and public.resume_gap_json_has_exact_keys(result -> 'ai', array['provider', 'model', 'requestId', 'usage', 'priceScheduleVersion'])
      and result -> 'ai' ? 'provider'
      and result -> 'ai' ? 'model'
      and result -> 'ai' ? 'requestId'
      and result -> 'ai' ? 'usage'
      and result -> 'ai' ? 'priceScheduleVersion'
      and jsonb_typeof(result -> 'ai' -> 'provider') = 'string'
      and jsonb_typeof(result -> 'ai' -> 'model') = 'string'
      and char_length(btrim(result -> 'ai' ->> 'provider')) between 1 and 80
      and char_length(btrim(result -> 'ai' ->> 'model')) between 1 and 160
      and jsonb_typeof(result -> 'ai' -> 'requestId') in ('string', 'null')
      and jsonb_typeof(result -> 'ai' -> 'priceScheduleVersion') in ('string', 'null')
      and (result -> 'ai' -> 'requestId' = 'null'::jsonb or char_length(btrim(result -> 'ai' ->> 'requestId')) between 1 and 200)
      and (result -> 'ai' -> 'priceScheduleVersion' = 'null'::jsonb or char_length(btrim(result -> 'ai' ->> 'priceScheduleVersion')) between 1 and 80)
      and jsonb_typeof(result -> 'ai' -> 'usage') = 'object'
      and public.resume_gap_json_has_exact_keys(result -> 'ai' -> 'usage', array['inputCacheHitTokens', 'inputCacheMissTokens', 'outputTokens'])
      and result -> 'ai' -> 'usage' ? 'inputCacheHitTokens'
      and result -> 'ai' -> 'usage' ? 'inputCacheMissTokens'
      and result -> 'ai' -> 'usage' ? 'outputTokens'
      and (result -> 'ai' -> 'usage' ->> 'inputCacheHitTokens') ~ '^[0-9]+$'
      and (result -> 'ai' -> 'usage' ->> 'inputCacheMissTokens') ~ '^[0-9]+$'
      and (result -> 'ai' -> 'usage' ->> 'outputTokens') ~ '^[0-9]+$'
      and (result -> 'ai' -> 'usage' ->> 'inputCacheHitTokens')::numeric between 0 and 2147483647
      and (result -> 'ai' -> 'usage' ->> 'inputCacheMissTokens')::numeric between 0 and 2147483647
      and (result -> 'ai' -> 'usage' ->> 'outputTokens')::numeric between 0 and 2147483647
      and (
        result -> 'estimatedCost' = 'null'::jsonb
        or (
          jsonb_typeof(result -> 'estimatedCost') = 'object'
          and public.resume_gap_json_has_exact_keys(result -> 'estimatedCost', array['amount', 'currency', 'scheduleVersion', 'tier'])
          and result -> 'estimatedCost' ? 'amount'
          and result -> 'estimatedCost' ? 'currency'
          and result -> 'estimatedCost' ? 'scheduleVersion'
          and result -> 'estimatedCost' ? 'tier'
          and jsonb_typeof(result -> 'estimatedCost' -> 'amount') = 'number'
          and (result -> 'estimatedCost' ->> 'amount')::numeric >= 0
          and jsonb_typeof(result -> 'estimatedCost' -> 'currency') = 'string'
          and result -> 'estimatedCost' ->> 'currency' = 'USD'
          and jsonb_typeof(result -> 'estimatedCost' -> 'scheduleVersion') = 'string'
          and char_length(btrim(result -> 'estimatedCost' ->> 'scheduleVersion')) between 1 and 80
          and result -> 'estimatedCost' ->> 'scheduleVersion' ~ '^[A-Za-z0-9._:-]{1,80}$'
          and jsonb_typeof(result -> 'estimatedCost' -> 'tier') = 'string'
          and result -> 'estimatedCost' ->> 'tier' in ('default', 'peak')
        )
      )
    )
  ),
  error_code text check (
    error_code is null or char_length(btrim(error_code)) between 1 and 120
  ),
  error_message text check (
    error_message is null or char_length(btrim(error_message)) between 1 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, application_id, input_hash, provider, model),
  check ((error_code is null) = (error_message is null)),
  check (
    (status = 'queued' and attempt_count = 0 and started_at is null and finished_at is null and error_code is null and error_message is null and result is null)
    or (status = 'running' and attempt_count > 0 and started_at is not null and finished_at is null and error_code is null and error_message is null and result is null)
    or (status = 'succeeded' and attempt_count > 0 and finished_at is not null and error_code is null and error_message is null and result is not null)
    or (status = 'failed' and attempt_count > 0 and finished_at is not null and error_code is not null and error_message is not null and result is null)
  )
);

create table public.resume_gap_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.resume_gap_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_id uuid references public.application_requirements(id) on delete set null,
  requirement_text text not null
    check (char_length(btrim(requirement_text)) between 1 and 500),
  category text not null check (category in (
    'responsibility', 'hard_requirement', 'preferred', 'skill',
    'language_work_authorization', 'location_workplace', 'compensation'
  )),
  priority text not null check (priority in ('core', 'supporting')),
  jd_source_excerpt text not null
    check (char_length(btrim(jd_source_excerpt)) between 1 and 1000),
  resume_coverage public.resume_coverage not null,
  verified_resume_excerpt text check (
    verified_resume_excerpt is null
    or char_length(btrim(verified_resume_excerpt)) between 1 and 1000
  ),
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (run_id, sort_order),
  check (
    (resume_coverage = 'missing' and verified_resume_excerpt is null)
    or (resume_coverage in ('covered', 'partial') and verified_resume_excerpt is not null)
  )
);

create index applications_resume_source_asset_idx
  on public.applications(resume_source_asset_id);
create index resume_gap_runs_application_created_idx
  on public.resume_gap_runs(application_id, created_at desc);
create index resume_gap_runs_application_updated_idx
  on public.resume_gap_runs(application_id, updated_at desc);
create index resume_gap_items_run_order_idx
  on public.resume_gap_items(run_id, sort_order);

alter table public.resume_gap_runs enable row level security;
alter table public.resume_gap_items enable row level security;

create policy resume_gap_runs_owner_select
on public.resume_gap_runs for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_gap_items_owner_select
on public.resume_gap_items for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.resume_gap_runs from anon, authenticated;
revoke all on public.resume_gap_items from anon, authenticated;
grant select on public.resume_gap_runs to authenticated;
grant select on public.resume_gap_items to authenticated;

create function public.touch_resume_gap_run_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Preserve an explicitly backdated lease in administrative recovery/tests;
  -- ordinary updates that leave it unchanged are touched automatically.
  if new.updated_at = old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger resume_gap_runs_touch_updated_at
before update on public.resume_gap_runs
for each row execute function public.touch_resume_gap_run_updated_at();

create function public.set_application_resume_source(
  target_application_id uuid,
  target_source_asset_id uuid
)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_application public.applications%rowtype;
  selected_application public.applications%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  select * into owned_application
  from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;

  if owned_application.id is null then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  if target_source_asset_id is not null and not exists (
    select 1 from public.source_assets
    where id = target_source_asset_id and user_id = current_user_id
  ) then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  update public.applications
  set resume_source_asset_id = target_source_asset_id
  where id = owned_application.id
  returning * into selected_application;
  return selected_application;
end;
$$;

create function public.create_or_get_resume_gap(
  target_application_id uuid,
  target_analysis_run_id uuid,
  target_source_asset_id uuid,
  target_input_hash text,
  target_provider text,
  target_model text
)
returns public.resume_gap_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_application public.applications%rowtype;
  owned_asset public.source_assets%rowtype;
  owned_analysis public.application_analysis_runs%rowtype;
  owned_run public.resume_gap_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_input_hash is null or target_input_hash !~ '^[0-9a-f]{64}$'
    or target_provider is null or char_length(btrim(target_provider)) not between 1 and 80
    or target_model is null or char_length(btrim(target_model)) not between 1 and 160 then
    raise exception 'invalid-resume-gap-input' using errcode = '22023';
  end if;

  select * into owned_application
  from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;
  if owned_application.id is null then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  select * into owned_asset from public.source_assets
  where id = target_source_asset_id and user_id = current_user_id
  for update;
  select * into owned_analysis from public.application_analysis_runs
  where id = target_analysis_run_id
    and application_id = target_application_id
    and user_id = current_user_id
  for update;
  if owned_asset.id is null or owned_analysis.id is null
    or owned_analysis.status <> 'succeeded'
    or owned_application.resume_source_asset_id is distinct from owned_asset.id
    or not exists (
      select 1 from public.application_requirements
      where analysis_run_id = owned_analysis.id
        and application_id = target_application_id
        and user_id = current_user_id
    ) then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.application_analysis_runs newer
    where newer.application_id = target_application_id
      and newer.user_id = current_user_id
      and newer.status = 'succeeded'
      and newer.created_at > owned_analysis.created_at
  ) then
    raise exception 'invalid-resume-gap-input' using errcode = '22023';
  end if;

  insert into public.resume_gap_runs (
    application_id, user_id, analysis_run_id, source_asset_id,
    source_filename, source_sha256, input_hash, provider, model
  ) values (
    target_application_id, current_user_id, target_analysis_run_id, target_source_asset_id,
    btrim(owned_asset.original_name), lower(owned_asset.sha256), target_input_hash,
    btrim(target_provider), btrim(target_model)
  ) on conflict (user_id, application_id, input_hash, provider, model) do nothing;

  select * into owned_run from public.resume_gap_runs
  where user_id = current_user_id
    and application_id = target_application_id
    and input_hash = target_input_hash
    and provider = btrim(target_provider)
    and model = btrim(target_model);
  if owned_run.id is null then
    raise exception 'resume-gap-conflict' using errcode = '23505';
  end if;
  if owned_run.analysis_run_id <> owned_analysis.id
    or owned_run.source_asset_id is distinct from owned_asset.id
    or owned_run.source_filename <> btrim(owned_asset.original_name)
    or owned_run.source_sha256 <> lower(owned_asset.sha256) then
    raise exception 'resume-gap-conflict' using errcode = '23505';
  end if;
  return owned_run;
end;
$$;

create function public.claim_resume_gap(target_run_id uuid, target_lease_seconds integer)
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
  if target_lease_seconds is null or target_lease_seconds not between 1 and 86400 then
    raise exception 'invalid-resume-gap-lease' using errcode = '22023';
  end if;

  update public.resume_gap_runs
  set status = 'running', attempt_count = attempt_count + 1,
      result = null, error_code = null, error_message = null,
      started_at = now(), finished_at = null, updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and (
      status in ('queued', 'failed')
      or (status = 'running' and updated_at < now() - make_interval(secs => target_lease_seconds))
    );
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_resume_gap(
  target_run_id uuid,
  target_attempt_count integer,
  target_items jsonb,
  target_ai_usage jsonb,
  target_estimated_cost jsonb
)
returns public.resume_gap_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_application public.applications%rowtype;
  locked_asset public.source_assets%rowtype;
  locked_analysis public.application_analysis_runs%rowtype;
  owned_run public.resume_gap_runs%rowtype;
  completed_run public.resume_gap_runs%rowtype;
  candidate jsonb;
  candidate_requirement_id uuid;
  candidate_coverage public.resume_coverage;
  candidate_excerpt text;
  candidate_index integer := 0;
  locked_requirement public.application_requirements%rowtype;
  expected_count integer;
  inserted_count integer;
  covered_count integer := 0;
  partial_count integer := 0;
  missing_count integer := 0;
  safe_ai_usage jsonb;
  safe_estimated_cost jsonb;
  usage_payload jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_items is null or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) > 80 then
    raise exception 'invalid-resume-gap-result' using errcode = '22023';
  end if;

  -- Lock the application, selected source, analysis run, and its requirement
  -- rows in this order. This serializes selection/JD replacement with output.
  select * into locked_application from public.applications
  where id = (select application_id from public.resume_gap_runs where id = target_run_id)
    and user_id = current_user_id
  for update;
  select * into locked_asset from public.source_assets
  where id = locked_application.resume_source_asset_id
    and user_id = current_user_id
  for update;
  select * into locked_analysis from public.application_analysis_runs
  where id = (select analysis_run_id from public.resume_gap_runs where id = target_run_id)
    and application_id = locked_application.id
    and user_id = current_user_id
  for update;
  select * into owned_run from public.resume_gap_runs
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  for update;
  if owned_run.id is null then
    raise exception 'resume-gap-not-running' using errcode = 'P0002';
  end if;

  -- Re-check the live selection and source snapshot while the run is locked.
  -- This prevents completion after an application switches resumes or a source
  -- asset is deleted/replaced during processing.
  if locked_application.id is null or locked_asset.id is null
    or locked_analysis.id is null
    or locked_analysis.status <> 'succeeded'
    or locked_analysis.id <> owned_run.analysis_run_id
    or exists (
      select 1 from public.application_analysis_runs newer
      where newer.application_id = owned_run.application_id
        and newer.user_id = current_user_id
        and newer.status = 'succeeded'
        and newer.created_at > locked_analysis.created_at
    )
    or locked_analysis.application_id <> owned_run.application_id
    or locked_analysis.user_id <> current_user_id
    or locked_application.resume_source_asset_id is distinct from owned_run.source_asset_id
    or locked_asset.original_name <> owned_run.source_filename
    or lower(locked_asset.sha256) <> owned_run.source_sha256 then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  expected_count := 0;
  for locked_requirement in
    select * from public.application_requirements
    where analysis_run_id = owned_run.analysis_run_id
      and application_id = owned_run.application_id
      and user_id = current_user_id
    order by id
    for update
  loop
    expected_count := expected_count + 1;
  end loop;
  if expected_count < 1 or expected_count <> jsonb_array_length(target_items) then
    raise exception 'invalid-resume-gap-requirements' using errcode = '22023';
  end if;

  for candidate in select value from jsonb_array_elements(target_items)
  loop
    if jsonb_typeof(candidate) <> 'object'
      or (select count(*) from jsonb_object_keys(candidate) as k(key)
          where k.key not in ('requirementId', 'resumeCoverage', 'resumeExcerpt')) <> 0
      or (select count(*) from jsonb_object_keys(candidate)) <> 3
      or not candidate ? 'requirementId'
      or not candidate ? 'resumeCoverage'
      or not candidate ? 'resumeExcerpt'
      or jsonb_typeof(candidate -> 'requirementId') <> 'string'
      or jsonb_typeof(candidate -> 'resumeCoverage') <> 'string'
      or (jsonb_typeof(candidate -> 'resumeExcerpt') not in ('string', 'null')) then
      raise exception 'invalid-resume-gap-item' using errcode = '22023';
    end if;

    candidate_requirement_id := (candidate ->> 'requirementId')::uuid;
    candidate_coverage := (candidate ->> 'resumeCoverage')::public.resume_coverage;
    candidate_excerpt := nullif(btrim(candidate ->> 'resumeExcerpt'), '');
    if not exists (
      select 1 from public.application_requirements
      where id = candidate_requirement_id
        and analysis_run_id = owned_run.analysis_run_id
        and application_id = owned_run.application_id
        and user_id = current_user_id
    ) then
      raise exception 'invalid-resume-gap-requirements' using errcode = '22023';
    end if;
    if candidate_coverage = 'missing' and candidate_excerpt is not null
      or candidate_coverage in ('covered', 'partial')
        and (candidate_excerpt is null or char_length(candidate_excerpt) not between 1 and 1000) then
      raise exception 'invalid-resume-gap-item' using errcode = '22023';
    end if;
    if candidate_coverage = 'covered' then covered_count := covered_count + 1;
    elsif candidate_coverage = 'partial' then partial_count := partial_count + 1;
    else missing_count := missing_count + 1;
    end if;
  end loop;

  if exists (
    select elem ->> 'requirementId'
    from jsonb_array_elements(target_items) as values(elem)
    group by elem ->> 'requirementId' having count(*) > 1
  ) then
    raise exception 'invalid-resume-gap-requirements' using errcode = '22023';
  end if;

  if target_ai_usage is not null and jsonb_typeof(target_ai_usage) = 'object'
    and public.resume_gap_json_has_exact_keys(target_ai_usage, array['provider', 'model', 'requestId', 'usage', 'priceScheduleVersion'])
    and target_ai_usage ? 'provider'
    and target_ai_usage ? 'model'
    and target_ai_usage ? 'requestId'
    and target_ai_usage ? 'usage'
    and target_ai_usage ? 'priceScheduleVersion'
    and jsonb_typeof(target_ai_usage -> 'provider') = 'string'
    and jsonb_typeof(target_ai_usage -> 'model') = 'string'
    and target_ai_usage ->> 'provider' = owned_run.provider
    and target_ai_usage ->> 'model' = owned_run.model
    and jsonb_typeof(target_ai_usage -> 'requestId') in ('string', 'null')
    and jsonb_typeof(target_ai_usage -> 'priceScheduleVersion') in ('string', 'null')
    and (
      target_ai_usage -> 'requestId' = 'null'::jsonb
      or (char_length(btrim(target_ai_usage ->> 'requestId')) between 1 and 200
        and target_ai_usage ->> 'requestId' ~ '^[A-Za-z0-9._:-]{1,200}$')
    )
    and (
      target_ai_usage -> 'priceScheduleVersion' = 'null'::jsonb
      or char_length(btrim(target_ai_usage ->> 'priceScheduleVersion')) between 1 and 80
    )
    and jsonb_typeof(target_ai_usage -> 'usage') = 'object'
    and public.resume_gap_json_has_exact_keys(target_ai_usage -> 'usage', array['inputCacheHitTokens', 'inputCacheMissTokens', 'outputTokens'])
    and target_ai_usage -> 'usage' ? 'inputCacheHitTokens'
    and target_ai_usage -> 'usage' ? 'inputCacheMissTokens'
    and target_ai_usage -> 'usage' ? 'outputTokens'
    and jsonb_typeof(target_ai_usage -> 'usage' -> 'inputCacheHitTokens') = 'number'
    and jsonb_typeof(target_ai_usage -> 'usage' -> 'inputCacheMissTokens') = 'number'
    and jsonb_typeof(target_ai_usage -> 'usage' -> 'outputTokens') = 'number'
    and (target_ai_usage -> 'usage' ->> 'inputCacheHitTokens') ~ '^[0-9]+$'
    and (target_ai_usage -> 'usage' ->> 'inputCacheMissTokens') ~ '^[0-9]+$'
    and (target_ai_usage -> 'usage' ->> 'outputTokens') ~ '^[0-9]+$' then
    usage_payload := target_ai_usage -> 'usage';
    safe_ai_usage := jsonb_build_object(
      'provider', owned_run.provider,
      'model', owned_run.model,
      'requestId', target_ai_usage -> 'requestId',
      'usage', jsonb_build_object(
        'inputCacheHitTokens', (usage_payload ->> 'inputCacheHitTokens')::integer,
        'inputCacheMissTokens', (usage_payload ->> 'inputCacheMissTokens')::integer,
        'outputTokens', (usage_payload ->> 'outputTokens')::integer
      ),
      'priceScheduleVersion', target_ai_usage -> 'priceScheduleVersion'
    );
  else
    raise exception 'invalid-resume-gap-usage' using errcode = '22023';
  end if;

  if target_estimated_cost is not null
    and (
      jsonb_typeof(target_estimated_cost) <> 'object'
      or not public.resume_gap_json_has_exact_keys(target_estimated_cost, array['amount', 'currency', 'scheduleVersion', 'tier'])
      or not target_estimated_cost ? 'amount'
      or not target_estimated_cost ? 'currency'
      or not target_estimated_cost ? 'scheduleVersion'
      or not target_estimated_cost ? 'tier'
      or jsonb_typeof(target_estimated_cost -> 'amount') <> 'number'
      or (target_estimated_cost ->> 'amount')::numeric < 0
      or jsonb_typeof(target_estimated_cost -> 'currency') <> 'string'
      or target_estimated_cost ->> 'currency' <> 'USD'
      or jsonb_typeof(target_estimated_cost -> 'scheduleVersion') <> 'string'
      or char_length(btrim(target_estimated_cost ->> 'scheduleVersion')) not between 1 and 80
      or jsonb_typeof(target_estimated_cost -> 'tier') <> 'string'
      or target_estimated_cost ->> 'tier' not in ('default', 'peak')
    ) then
    raise exception 'invalid-resume-gap-cost' using errcode = '22023';
  end if;
  safe_estimated_cost := case when target_estimated_cost is null then null else jsonb_build_object(
    'amount', (target_estimated_cost ->> 'amount')::numeric,
    'currency', 'USD',
    'scheduleVersion', target_estimated_cost ->> 'scheduleVersion',
    'tier', target_estimated_cost ->> 'tier'
  ) end;

  for candidate in select value from jsonb_array_elements(target_items)
  loop
    candidate_index := candidate_index + 1;
    candidate_requirement_id := (candidate ->> 'requirementId')::uuid;
    candidate_coverage := (candidate ->> 'resumeCoverage')::public.resume_coverage;
    candidate_excerpt := nullif(btrim(candidate ->> 'resumeExcerpt'), '');
    insert into public.resume_gap_items (
      run_id, application_id, user_id, requirement_id, requirement_text,
      category, priority, jd_source_excerpt, resume_coverage,
      verified_resume_excerpt, sort_order
    )
    select owned_run.id, owned_run.application_id, current_user_id, r.id,
      r.requirement_text, r.category, r.priority, r.source_excerpt,
      candidate_coverage, candidate_excerpt, candidate_index - 1
    from public.application_requirements r
    where r.id = candidate_requirement_id;
  end loop;

  select count(*) into inserted_count
  from public.resume_gap_items
  where run_id = owned_run.id and user_id = current_user_id;
  if inserted_count <> expected_count then
    raise exception 'invalid-resume-gap-requirements' using errcode = '22023';
  end if;

  update public.resume_gap_runs
  set status = 'succeeded', result = jsonb_build_object(
        'acceptedItemCount', expected_count,
        'coveredItemCount', covered_count,
        'partialItemCount', partial_count,
        'missingItemCount', missing_count,
        'ai', safe_ai_usage,
        'estimatedCost', safe_estimated_cost
      ), error_code = null, error_message = null,
      finished_at = now(), updated_at = now()
  where id = owned_run.id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into completed_run;
  return completed_run;
end;
$$;

create function public.fail_resume_gap(
  target_run_id uuid,
  target_attempt_count integer,
  target_error_code text,
  target_error_message text
)
returns public.resume_gap_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.resume_gap_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_error_code is null or target_error_code not in (
      'resume-text-too-short',
      'resume-text-too-long',
      'unsupported-content-type',
      'source-download-failed',
      'resume-gap-invalid-output',
      'ai-provider-rate-limited',
      'ai-provider-request-failed',
      'ai-provider-timeout',
      'resume-gap-unavailable',
      'resume-gap-failed'
    )
    then
    raise exception 'invalid-resume-gap-error' using errcode = '22023';
  end if;

  update public.resume_gap_runs
  set status = 'failed', result = null,
      error_code = btrim(target_error_code),
      error_message = 'Resume comparison failed.',
      finished_at = now(), updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into failed_run;
  if failed_run.id is null then
    raise exception 'resume-gap-not-running' using errcode = 'P0002';
  end if;
  return failed_run;
end;
$$;

revoke all on function public.set_application_resume_source(uuid, uuid) from public;
revoke all on function public.create_or_get_resume_gap(uuid, uuid, uuid, text, text, text) from public;
revoke all on function public.claim_resume_gap(uuid, integer) from public;
revoke all on function public.complete_resume_gap(uuid, integer, jsonb, jsonb, jsonb) from public;
revoke all on function public.fail_resume_gap(uuid, integer, text, text) from public;

grant execute on function public.set_application_resume_source(uuid, uuid) to authenticated;
grant execute on function public.create_or_get_resume_gap(uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.claim_resume_gap(uuid, integer) to authenticated;
grant execute on function public.complete_resume_gap(uuid, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.fail_resume_gap(uuid, integer, text, text) to authenticated;
