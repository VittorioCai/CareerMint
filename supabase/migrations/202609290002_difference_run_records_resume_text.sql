-- A run records which text it analysed.
--
-- A resume whose file cannot be read — a scan, mostly — is analysed from text
-- the browser supplies: what local OCR recognised, or what the user pasted.
-- That text is not a function of the file, but the file's hash was all the
-- cache key and the row knew about. Two consequences:
--
--   1. A second, different text for the same file hashed the same, found the
--      first text's run, and came back with its analysis marked as reused.
--   2. A stored analysis quoted excerpts from a text that was recorded
--      nowhere. `source_sha256` named a file the excerpts were not in.
--
-- The application now puts the text's hash in `input_hash`. This is the
-- record: where the text came from, and its hash when it was not the file's.
--
-- Every existing row is the file's as far as anyone can now tell, which is
-- what the default says. Some were in fact made from recognised text; their
-- hash was never kept, so that cannot be recovered.

alter table public.resume_jd_difference_runs
  add column resume_text_source text not null default 'file'
    check (resume_text_source in ('file', 'ocr', 'paste')),
  add column resume_text_sha256 text
    check (
      resume_text_sha256 is null
      or resume_text_sha256 ~ '^[0-9a-f]{64}$'
    ),
  add constraint resume_jd_difference_runs_resume_text_pairing
    check ((resume_text_source = 'file') = (resume_text_sha256 is null));

-- A new argument list, so the old function goes rather than being replaced.
--
-- The two new arguments have defaults, and that is deliberate. With both
-- versions present a call with thirteen named arguments would be ambiguous,
-- so there can only be one; with defaults, the one that remains still answers
-- the thirteen-argument call the deployed code makes. Database first, then
-- code, stays safe across the gap.
--
-- Where the text came from is recorded and not compared: the same text by
-- OCR and by paste is the same input. Its hash is compared, like every other
-- part of what one `input_hash` may stand for.

drop function if exists public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text
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
  target_output_locale text,
  target_resume_text_source text default 'file',
  target_resume_text_sha256 text default null
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

  -- Said here rather than left to the column's checks, so the caller gets
  -- the same stable code for a bad argument as for a bad hash.
  if target_resume_text_source is null
    or target_resume_text_source not in ('file', 'ocr', 'paste')
    or (target_resume_text_source = 'file') <> (target_resume_text_sha256 is null)
    or (target_resume_text_sha256 is not null
      and target_resume_text_sha256 !~ '^[0-9a-f]{64}$')
  then
    raise exception 'invalid-resume-jd-difference-text-source' using errcode = '22023';
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
      or existing_run.resume_text_sha256 is distinct from target_resume_text_sha256
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
  end if;

  insert into public.resume_jd_difference_runs (
    application_id, user_id, source_asset_id, source_filename,
    source_sha256, jd_sha256, fact_fingerprint, input_hash,
    provider, model, schema_version, prompt_version, policy_version,
    output_locale, resume_text_source, resume_text_sha256
  ) values (
    target_application_id, current_user_id, target_source_asset_id,
    target_source_filename, target_source_sha256, target_jd_sha256,
    target_fact_fingerprint, target_input_hash, target_provider, target_model,
    target_schema_version, target_prompt_version, target_policy_version,
    target_output_locale, target_resume_text_source, target_resume_text_sha256
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
      or existing_run.resume_text_sha256 is distinct from target_resume_text_sha256
    then
      raise exception 'resume-jd-difference-conflict' using errcode = '23505';
    end if;
    return existing_run;
end;
$$;

revoke all on function public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.create_or_get_resume_jd_difference(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
