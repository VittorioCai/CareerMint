create or replace function public.create_or_get_jd_gap_v3(
  target_application_id uuid,
  target_structure_run_id uuid,
  target_source_asset_id uuid,
  target_fact_fingerprint text,
  target_input_hash text,
  target_provider text,
  target_model text,
  target_schema_version text,
  target_prompt_version text,
  target_policy_version text
)
returns public.jd_gap_v3_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_structure public.jd_structure_runs%rowtype;
  owned_asset public.source_assets%rowtype;
  owned_application public.applications%rowtype;
  owned_run public.jd_gap_v3_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_fact_fingerprint is null or target_fact_fingerprint !~ '^[0-9a-f]{64}$'
    or target_input_hash is null or target_input_hash !~ '^[0-9a-f]{64}$'
    or target_provider is null or char_length(btrim(target_provider)) not between 1 and 80
    or target_model is null or char_length(btrim(target_model)) not between 1 and 160
    or target_schema_version is null or target_schema_version !~ '^[A-Za-z0-9._:-]{1,80}$'
    or target_prompt_version is null or target_prompt_version !~ '^[A-Za-z0-9._:-]{1,80}$'
    or target_policy_version is null or target_policy_version !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'invalid-jd-gap-input' using errcode = '22023';
  end if;

  select * into owned_structure from public.jd_structure_runs
  where id = target_structure_run_id and user_id = current_user_id
  for update;
  select * into owned_asset from public.source_assets
  where id = target_source_asset_id and user_id = current_user_id
  for update;
  select * into owned_application from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;
  if owned_structure.id is null or owned_structure.status <> 'succeeded'
    or owned_structure.application_id <> target_application_id
    or owned_asset.id is null or owned_asset.status not in ('uploaded', 'ready')
    or owned_application.id is null
    or owned_application.resume_source_asset_id is distinct from owned_asset.id then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;

  insert into public.jd_gap_v3_runs (
    application_id, user_id, structure_run_id, source_asset_id,
    source_filename, source_sha256, fact_fingerprint, input_hash,
    provider, model, schema_version, prompt_version, policy_version
  ) values (
    owned_application.id, current_user_id, owned_structure.id, owned_asset.id,
    btrim(owned_asset.original_name), lower(owned_asset.sha256),
    lower(target_fact_fingerprint), lower(target_input_hash),
    btrim(target_provider), btrim(target_model), btrim(target_schema_version),
    btrim(target_prompt_version), btrim(target_policy_version)
  ) on conflict (user_id, application_id, input_hash, provider, model) do nothing;

  select * into owned_run from public.jd_gap_v3_runs
  where user_id = current_user_id
    and application_id = owned_application.id
    and input_hash = lower(target_input_hash)
    and provider = btrim(target_provider)
    and model = btrim(target_model);
  if owned_run.id is null
    or owned_run.structure_run_id <> owned_structure.id
    or owned_run.source_asset_id is distinct from owned_asset.id
    or owned_run.source_filename <> btrim(owned_asset.original_name)
    or owned_run.source_sha256 <> lower(owned_asset.sha256)
    or owned_run.fact_fingerprint <> lower(target_fact_fingerprint)
    or owned_run.schema_version <> btrim(target_schema_version)
    or owned_run.prompt_version <> btrim(target_prompt_version)
    or owned_run.policy_version <> btrim(target_policy_version) then
    raise exception 'jd-gap-conflict' using errcode = '23505';
  end if;
  return owned_run;
end;
$$;

do $migration$
declare
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.complete_jd_gap_v3(uuid,integer,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) into current_definition;
  updated_definition := replace(
    current_definition,
    'owned_asset.status <> ''ready''',
    'owned_asset.status not in (''uploaded'', ''ready'')'
  );
  if updated_definition = current_definition then
    raise exception 'complete_jd_gap_v3 status predicate was not found';
  end if;
  execute updated_definition;
end;
$migration$;
