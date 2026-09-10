-- Drops the schema of three pipelines the product no longer has.
--
-- `b93d240` deleted the JD-analysis, resume-gap and resume-generation
-- features. Their tables stayed behind, and nothing has written to any of them
-- since. The only reader left was the account data export, which was exporting
-- eighteen tables' worth of rows that can no longer be produced.
--
-- This is deliberately destructive and was asked for. Anyone who used those
-- features loses that history; the difference analysis, the career profile,
-- the applications and the interview preparation are untouched.
--
-- What the dead schema was costing while it stayed:
--   * 2,135 of 5,028 lines of the pgTAP suite, testing RLS on tables nothing
--     writes;
--   * ~260 lines of the export builder and its route;
--   * 18 tables of policies, constraints and triggers, plus 28 functions,
--     that every future migration had to reason about.
--
-- Order matters. `delete_owned_application` deletes from `resume_versions`
-- before letting the application cascade, because `resume_versions
-- .source_run_id` is RESTRICT. plpgsql resolves table names at call time, so
-- dropping the table without touching the function would leave a bomb: the
-- next application deletion would fail at runtime, not here. The function is
-- rewritten first, and the reason for that step disappears with the table.

create or replace function public.delete_owned_application(
  target_application_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_application_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  select id
  into owned_application_id
  from public.applications
  where id = target_application_id
    and user_id = current_user_id
  for update;

  if owned_application_id is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  -- Everything that hangs off an application now cascades. The manual
  -- `resume_versions` delete this used to carry existed only because that
  -- table's `source_run_id` was RESTRICT, and the table goes below.
  delete from public.applications
  where id = owned_application_id
    and user_id = current_user_id;

  return true;
end;
$$;

-- The pipelines' own RPCs. Removed by exact signature rather than by cascade,
-- so a rename or a new overload cannot silently survive this migration. The signatures are as
-- `pg_get_function_identity_arguments` reports them; the parameter names are
-- ignored by `drop function` and kept because they say what each argument was.

-- JD analysis (v1)
drop function if exists public.create_or_get_application_analysis(target_application_id uuid, target_input_hash text, target_provider text, target_model text);
drop function if exists public.claim_application_analysis(target_run_id uuid);
drop function if exists public.complete_application_analysis(target_run_id uuid, accepted_requirements jsonb, jd_translation_zh text, rejected_requirement_count integer, rejected_evidence_count integer, ai_usage jsonb, estimated_cost jsonb);
drop function if exists public.fail_application_analysis(target_run_id uuid, target_error_code text, target_error_message text);

-- JD structure
drop function if exists public.create_or_get_jd_structure(target_application_id uuid, target_jd_sha256 text, target_input_hash text, target_provider text, target_model text, target_schema_version text, target_prompt_version text);
drop function if exists public.claim_jd_structure(target_run_id uuid, expected_attempt_count integer, expected_status text, target_lease_seconds integer);
drop function if exists public.complete_jd_structure(target_run_id uuid, target_attempt_count integer, target_jd_translation_zh text, target_requirements jsonb, target_ai_metadata jsonb, target_estimated_cost jsonb);
drop function if exists public.fail_jd_structure(target_run_id uuid, target_attempt_count integer, target_error_code text, target_error_message text);

-- JD gap analysis (v3)
drop function if exists public.create_or_get_jd_gap_v3(target_application_id uuid, target_structure_run_id uuid, target_source_asset_id uuid, target_fact_fingerprint text, target_input_hash text, target_provider text, target_model text, target_schema_version text, target_prompt_version text, target_policy_version text);
drop function if exists public.claim_jd_gap_v3(target_run_id uuid, expected_attempt_count integer, expected_status text, target_lease_seconds integer);
drop function if exists public.complete_jd_gap_v3(target_run_id uuid, target_attempt_count integer, target_requirement_results jsonb, target_criterion_assessments jsonb, target_ai_metadata jsonb, target_estimated_cost jsonb);
drop function if exists public.fail_jd_gap_v3(target_run_id uuid, target_attempt_count integer, target_error_code text, target_error_message text);

-- Resume gap
drop function if exists public.create_or_get_resume_gap(target_application_id uuid, target_analysis_run_id uuid, target_source_asset_id uuid, target_input_hash text, target_provider text, target_model text);
drop function if exists public.claim_resume_gap(target_run_id uuid, expected_attempt_count integer, expected_status text, target_lease_seconds integer);
drop function if exists public.complete_resume_gap(target_run_id uuid, target_attempt_count integer, target_items jsonb, target_ai_usage jsonb, target_estimated_cost jsonb);
drop function if exists public.fail_resume_gap(target_run_id uuid, target_attempt_count integer, target_error_code text, target_error_message text);

-- Resume generation
drop function if exists public.create_or_get_resume_generation(target_application_id uuid, target_input_hash text, target_provider text, target_model text);
drop function if exists public.claim_resume_generation(target_run_id uuid);
drop function if exists public.complete_resume_generation(target_run_id uuid, accepted_suggestions jsonb, rejected_suggestion_count integer, rejected_reference_count integer, ai_usage jsonb, estimated_cost jsonb);
drop function if exists public.fail_resume_generation(target_run_id uuid, target_error_code text, target_error_message text);
drop function if exists public.create_resume_version(target_application_id uuid, target_source_run_id uuid, target_template text);
drop function if exists public.review_resume_suggestion(target_suggestion_id uuid, target_decision text, target_reviewed_content text);

-- Children before parents, following the foreign keys. No live table
-- references any of these, so nothing outside this list is affected.
drop table if exists public.resume_version_item_evidence;
drop table if exists public.resume_version_items;
drop table if exists public.resume_versions;
drop table if exists public.resume_suggestion_facts;
drop table if exists public.resume_suggestion_requirements;
drop table if exists public.resume_suggestions;
drop table if exists public.resume_generation_runs;

drop table if exists public.resume_gap_items;
drop table if exists public.resume_gap_runs;

drop table if exists public.jd_gap_v3_criterion_assessments;
drop table if exists public.jd_gap_v3_requirement_results;
drop table if exists public.jd_gap_v3_runs;

drop table if exists public.jd_structure_criteria;
drop table if exists public.jd_structure_requirements;
drop table if exists public.jd_structure_runs;

drop table if exists public.application_requirement_evidence;
drop table if exists public.application_requirements;
drop table if exists public.application_analysis_runs;

-- Last, because until the tables are gone these are still depended on: the
-- `touch_*` functions by the tables' own update triggers, and the validators
-- by their CHECK constraints. Dropping them before the tables fails outright,
-- which is the right way round — it would mean a table still needed them.
drop function if exists public.touch_jd_gap_v3_run_updated_at();
drop function if exists public.jd_gap_v3_json_has_exact_keys(payload jsonb, expected_keys text[]);
drop function if exists public.jd_gap_v3_valid_ai_metadata(payload jsonb, expected_provider text, expected_model text);
drop function if exists public.jd_gap_v3_valid_estimated_cost(payload jsonb, ai_metadata jsonb);
drop function if exists public.touch_resume_gap_run_updated_at();
drop function if exists public.resume_gap_json_has_exact_keys(payload jsonb, expected_keys text[]);
