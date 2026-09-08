-- Recover work abandoned mid-flight.
--
-- These three functions claim a row by moving it to 'running', and only accept
-- rows in 'queued' or 'failed'. Nothing else moves a row out of 'running', so
-- when the serverless function dies between the claim and the completion — a
-- deploy, a crash, or the route's 60s maxDuration — the row stays 'running'
-- forever and the user can never retry. Resume extraction is the first thing a
-- new user does, which makes this a way to render the product unusable with no
-- way out.
--
-- Difference analysis (stale_after_seconds) and interview question generation
-- (updated_at older than two minutes) already recover this way. These three now
-- do too, keyed on started_at, which each function already sets on claim.
--
-- Two minutes is safe without attempt fencing: every route caps at
-- maxDuration = 60, so an invocation that claimed the row is guaranteed to be
-- gone well before its row becomes reclaimable, and cannot come back to
-- complete work that has been handed to a newer attempt.

create or replace function public.claim_processing_job(target_job_id uuid)
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
    and (
      status in ('queued', 'failed')
      or (status = 'running' and started_at < now() - interval '2 minutes')
    );

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.claim_application_analysis(target_run_id uuid)
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

  update public.application_analysis_runs
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    result = null,
    error_code = null,
    error_message = null,
    started_at = now(),
    finished_at = null
  where id = target_run_id
    and user_id = current_user_id
    and (
      status in ('queued', 'failed')
      or (status = 'running' and started_at < now() - interval '2 minutes')
    );

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.claim_resume_generation(target_run_id uuid)
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

  update public.resume_generation_runs
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    result = null,
    error_code = null,
    error_message = null,
    started_at = now(),
    finished_at = null
  where id = target_run_id
    and user_id = current_user_id
    and (
      status in ('queued', 'failed')
      or (status = 'running' and started_at < now() - interval '2 minutes')
    );

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;
