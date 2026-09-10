-- `create_or_get_resume_jd_difference` also records the output language.
--
-- The column exists (202609100003); this is the writer. It is a new argument
-- list, so the old function has to go rather than be replaced — nothing but
-- this application calls it, and only `authenticated` ever had execute.
--
-- The language also joins the consistency check on an existing row. That check
-- can never actually fire on it, because `prompt_version` already names the
-- language and is checked one line above; it is there so that a future change
-- which decouples the two cannot quietly return a run in the wrong language.
--
-- What the column deliberately is *not* is part of the cache key. That is
-- `input_hash`'s job, and the language reaches it through `prompt_version`.

drop function if exists public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
);

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
  target_policy_version text,
  target_output_locale text
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
      or existing_run.output_locale <> target_output_locale
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
  end if;

  insert into public.resume_jd_difference_runs (
    application_id, user_id, source_asset_id, source_filename,
    source_sha256, jd_sha256, fact_fingerprint, input_hash,
    provider, model, schema_version, prompt_version, policy_version,
    output_locale
  ) values (
    target_application_id, current_user_id, target_source_asset_id,
    target_source_filename, target_source_sha256, target_jd_sha256,
    target_fact_fingerprint, target_input_hash, target_provider, target_model,
    target_schema_version, target_prompt_version, target_policy_version,
    target_output_locale
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
      or existing_run.output_locale <> target_output_locale
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
end;
$$;

revoke all on function public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
