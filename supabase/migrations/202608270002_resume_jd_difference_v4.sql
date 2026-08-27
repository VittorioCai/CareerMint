create function public.resume_jd_difference_json_has_exact_keys(
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
    and payload ?& expected_keys;
$$;

create table public.resume_jd_difference_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id uuid
    references public.source_assets(id) on delete set null,
  source_filename text not null
    check (char_length(btrim(source_filename)) between 1 and 260),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  jd_sha256 text not null check (jd_sha256 ~ '^[0-9a-f]{64}$'),
  fact_fingerprint text not null
    check (fact_fingerprint ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null
    check (char_length(btrim(provider)) between 1 and 80),
  model text not null
    check (char_length(btrim(model)) between 1 and 160),
  schema_version text not null
    check (char_length(btrim(schema_version)) between 1 and 80),
  prompt_version text not null
    check (char_length(btrim(prompt_version)) between 1 and 80),
  policy_version text not null
    check (char_length(btrim(policy_version)) between 1 and 80),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0
    check (attempt_count between 0 and 1000),
  result jsonb check (
    result is null
    or (
      public.resume_jd_difference_json_has_exact_keys(
        result,
        array['jobCore', 'overallDifference', 'issues', 'matched', 'directions']
      )
      and jsonb_typeof(result -> 'jobCore') = 'object'
      and jsonb_typeof(result -> 'overallDifference') = 'object'
      and jsonb_typeof(result -> 'issues') = 'array'
      and jsonb_typeof(result -> 'matched') = 'array'
      and jsonb_typeof(result -> 'directions') = 'array'
    )
  ),
  ai_usage jsonb check (
    ai_usage is null or jsonb_typeof(ai_usage) = 'object'
  ),
  estimated_cost_usd numeric check (
    estimated_cost_usd is null or estimated_cost_usd >= 0
  ),
  error_code text check (
    error_code is null
    or char_length(btrim(error_code)) between 1 and 120
  ),
  error_message text check (
    error_message is null
    or char_length(btrim(error_message)) between 1 and 1000
  ),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, input_hash),
  check (
    (status = 'queued' and result is null and error_code is null and error_message is null and completed_at is null)
    or (status = 'running' and result is null and error_code is null and error_message is null and completed_at is null and started_at is not null)
    or (status = 'succeeded' and result is not null and error_code is null and error_message is null and completed_at is not null)
    or (status = 'failed' and result is null and error_code is not null and error_message is not null and completed_at is not null)
  )
);

create index resume_jd_difference_runs_application_created_idx
  on public.resume_jd_difference_runs(user_id, application_id, created_at desc);

alter table public.resume_jd_difference_runs enable row level security;

create policy resume_jd_difference_runs_owner_select
on public.resume_jd_difference_runs for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.resume_jd_difference_runs from anon, authenticated;
grant select on public.resume_jd_difference_runs to authenticated;

create function public.touch_resume_jd_difference_run_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at = old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger resume_jd_difference_runs_touch_updated_at
before update on public.resume_jd_difference_runs
for each row execute function public.touch_resume_jd_difference_run_updated_at();

create function public.create_or_get_resume_jd_difference(
  target_application_id uuid,
  target_source_asset_id uuid,
  target_source_filename text,
  target_source_sha256 text,
  target_jd_sha256 text,
  target_fact_fingerprint text,
  target_input_hash text,
  target_provider text,
  target_model text,
  target_schema_version text,
  target_prompt_version text,
  target_policy_version text
)
returns public.resume_jd_difference_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_asset public.source_assets%rowtype;
  owned_application public.applications%rowtype;
  existing_run public.resume_jd_difference_runs%rowtype;
  created_run public.resume_jd_difference_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_source_sha256 !~ '^[0-9a-f]{64}$'
    or target_jd_sha256 !~ '^[0-9a-f]{64}$'
    or target_fact_fingerprint !~ '^[0-9a-f]{64}$'
    or target_input_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid-resume-jd-difference-hash' using errcode = '22023';
  end if;

  select * into owned_asset
  from public.source_assets
  where id = target_source_asset_id and user_id = current_user_id
  for update;

  if owned_asset.id is null then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  select * into owned_application
  from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;

  if owned_application.id is null
    or owned_application.resume_source_asset_id is distinct from target_source_asset_id
  then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  if owned_asset.sha256 <> target_source_sha256
    or owned_asset.original_name <> target_source_filename
  then
    raise exception 'resume-source-metadata-mismatch' using errcode = '22023';
  end if;

  select * into existing_run
  from public.resume_jd_difference_runs
  where user_id = current_user_id and input_hash = target_input_hash
  for update;

  if existing_run.id is not null then
    if existing_run.application_id <> target_application_id
      or (existing_run.source_asset_id is not null and existing_run.source_asset_id <> target_source_asset_id)
      or existing_run.source_sha256 <> target_source_sha256
      or existing_run.jd_sha256 <> target_jd_sha256
      or existing_run.fact_fingerprint <> target_fact_fingerprint
      or existing_run.provider <> target_provider
      or existing_run.model <> target_model
      or existing_run.schema_version <> target_schema_version
      or existing_run.prompt_version <> target_prompt_version
      or existing_run.policy_version <> target_policy_version
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
  end if;

  insert into public.resume_jd_difference_runs (
    application_id, user_id, source_asset_id, source_filename,
    source_sha256, jd_sha256, fact_fingerprint, input_hash,
    provider, model, schema_version, prompt_version, policy_version
  ) values (
    target_application_id, current_user_id, target_source_asset_id,
    target_source_filename, target_source_sha256, target_jd_sha256,
    target_fact_fingerprint, target_input_hash, target_provider, target_model,
    target_schema_version, target_prompt_version, target_policy_version
  )
  returning * into created_run;

  return created_run;
exception
  when unique_violation then
    select * into existing_run
    from public.resume_jd_difference_runs
    where user_id = current_user_id and input_hash = target_input_hash;
    if existing_run.id is null then raise; end if;
    if existing_run.application_id <> target_application_id
      or existing_run.source_sha256 <> target_source_sha256
      or existing_run.jd_sha256 <> target_jd_sha256
      or existing_run.fact_fingerprint <> target_fact_fingerprint
      or existing_run.provider <> target_provider
      or existing_run.model <> target_model
      or existing_run.schema_version <> target_schema_version
      or existing_run.prompt_version <> target_prompt_version
      or existing_run.policy_version <> target_policy_version
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
end;
$$;

create function public.claim_resume_jd_difference(
  target_run_id uuid,
  expected_attempt_count integer,
  expected_status text,
  stale_after_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  claimed_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if expected_status not in ('queued', 'running', 'failed')
    or expected_attempt_count < 0
    or stale_after_seconds < 1
  then
    raise exception 'invalid-resume-jd-difference-claim' using errcode = '22023';
  end if;

  update public.resume_jd_difference_runs
  set status = 'running',
      attempt_count = attempt_count + 1,
      started_at = now(),
      completed_at = null,
      error_code = null,
      error_message = null
  where id = target_run_id
    and user_id = current_user_id
    and attempt_count = expected_attempt_count
    and status::text = expected_status
    and (
      status <> 'running'
      or updated_at < now() - make_interval(secs => stale_after_seconds)
    );
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

create function public.complete_resume_jd_difference(
  target_run_id uuid,
  expected_attempt_count integer,
  target_result jsonb,
  target_ai_usage jsonb,
  target_estimated_cost_usd numeric default null
)
returns public.resume_jd_difference_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.resume_jd_difference_runs%rowtype;
  completed_run public.resume_jd_difference_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  select * into owned_run
  from public.resume_jd_difference_runs
  where id = target_run_id and user_id = current_user_id
  for update;

  if owned_run.id is null
    or owned_run.status <> 'running'
    or owned_run.attempt_count <> expected_attempt_count
  then
    raise exception 'resume-jd-difference-run-not-claimable' using errcode = 'P0002';
  end if;

  if not public.resume_jd_difference_json_has_exact_keys(
      target_result,
      array['jobCore', 'overallDifference', 'issues', 'matched', 'directions']
    )
    or jsonb_typeof(target_result -> 'jobCore') <> 'object'
    or jsonb_typeof(target_result -> 'overallDifference') <> 'object'
    or jsonb_typeof(target_result -> 'issues') <> 'array'
    or jsonb_typeof(target_result -> 'matched') <> 'array'
    or jsonb_typeof(target_result -> 'directions') <> 'array'
    or jsonb_typeof(target_ai_usage) <> 'object'
    or target_estimated_cost_usd < 0
  then
    raise exception 'invalid-resume-jd-difference-result' using errcode = '22023';
  end if;

  update public.resume_jd_difference_runs
  set status = 'succeeded',
      result = target_result,
      ai_usage = target_ai_usage,
      estimated_cost_usd = target_estimated_cost_usd,
      error_code = null,
      error_message = null,
      completed_at = now()
  where id = target_run_id
  returning * into completed_run;

  return completed_run;
end;
$$;

create function public.fail_resume_jd_difference(
  target_run_id uuid,
  expected_attempt_count integer,
  target_error_code text,
  target_error_message text
)
returns public.resume_jd_difference_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.resume_jd_difference_runs%rowtype;
  failed_run public.resume_jd_difference_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  select * into owned_run
  from public.resume_jd_difference_runs
  where id = target_run_id and user_id = current_user_id
  for update;

  if owned_run.id is null
    or owned_run.status <> 'running'
    or owned_run.attempt_count <> expected_attempt_count
  then
    raise exception 'resume-jd-difference-run-not-claimable' using errcode = 'P0002';
  end if;
  if char_length(btrim(target_error_code)) not between 1 and 120
    or char_length(btrim(target_error_message)) not between 1 and 1000
  then
    raise exception 'invalid-resume-jd-difference-error' using errcode = '22023';
  end if;

  update public.resume_jd_difference_runs
  set status = 'failed',
      result = null,
      ai_usage = null,
      estimated_cost_usd = null,
      error_code = target_error_code,
      error_message = target_error_message,
      completed_at = now()
  where id = target_run_id
  returning * into failed_run;

  return failed_run;
end;
$$;

revoke all on function public.resume_jd_difference_json_has_exact_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.create_or_get_resume_jd_difference(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.claim_resume_jd_difference(uuid, integer, text, integer) from public, anon;
revoke all on function public.complete_resume_jd_difference(uuid, integer, jsonb, jsonb, numeric) from public, anon;
revoke all on function public.fail_resume_jd_difference(uuid, integer, text, text) from public, anon;

grant execute on function public.create_or_get_resume_jd_difference(uuid, uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.claim_resume_jd_difference(uuid, integer, text, integer) to authenticated;
grant execute on function public.complete_resume_jd_difference(uuid, integer, jsonb, jsonb, numeric) to authenticated;
grant execute on function public.fail_resume_jd_difference(uuid, integer, text, text) to authenticated;
