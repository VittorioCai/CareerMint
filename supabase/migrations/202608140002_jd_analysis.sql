create table public.application_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null
    check (char_length(btrim(provider)) between 1 and 80),
  model text not null
    check (char_length(btrim(model)) between 1 and 160),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  result jsonb,
  error_code text check (
    error_code is null or char_length(btrim(error_code)) between 1 and 120
  ),
  error_message text check (
    error_message is null or char_length(btrim(error_message)) between 1 and 500
  ),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, application_id, input_hash)
);

create table public.application_requirements (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null
    references public.application_analysis_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'responsibility',
    'hard_requirement',
    'preferred',
    'skill',
    'language_work_authorization',
    'location_workplace',
    'compensation'
  )),
  requirement_text text not null
    check (char_length(btrim(requirement_text)) between 1 and 500),
  source_excerpt text not null
    check (char_length(btrim(source_excerpt)) between 12 and 1000),
  priority text not null check (priority in ('core', 'supporting')),
  match_status text not null check (
    match_status in ('evidence', 'partial', 'none', 'needs_user')
  ),
  match_reason text check (
    match_reason is null or char_length(btrim(match_reason)) between 1 and 700
  ),
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (application_id, sort_order)
);

create table public.application_requirement_evidence (
  requirement_id uuid not null
    references public.application_requirements(id) on delete cascade,
  career_fact_id uuid not null
    references public.career_facts(id) on delete restrict,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requirement_id, career_fact_id)
);

create index application_analysis_runs_application_created_idx
  on public.application_analysis_runs(application_id, created_at desc);

create index application_requirements_application_order_idx
  on public.application_requirements(application_id, sort_order);

create index application_requirement_evidence_fact_idx
  on public.application_requirement_evidence(career_fact_id);

alter table public.application_analysis_runs enable row level security;
alter table public.application_requirements enable row level security;
alter table public.application_requirement_evidence enable row level security;

create policy application_analysis_runs_owner_select
on public.application_analysis_runs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy application_requirements_owner_select
on public.application_requirements
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy application_requirement_evidence_owner_select
on public.application_requirement_evidence
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.application_analysis_runs from anon, authenticated;
revoke all on public.application_requirements from anon, authenticated;
revoke all on public.application_requirement_evidence from anon, authenticated;
grant select on public.application_analysis_runs to authenticated;
grant select on public.application_requirements to authenticated;
grant select on public.application_requirement_evidence to authenticated;

create function public.create_or_get_application_analysis(
  target_application_id uuid,
  target_input_hash text,
  target_provider text,
  target_model text
)
returns public.application_analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.application_analysis_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_input_hash !~ '^[0-9a-f]{64}$'
    or char_length(btrim(target_provider)) not between 1 and 80
    or char_length(btrim(target_model)) not between 1 and 160 then
    raise exception 'invalid-analysis-input' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.applications
    where id = target_application_id
      and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  insert into public.application_analysis_runs (
    application_id,
    user_id,
    input_hash,
    provider,
    model
  )
  values (
    target_application_id,
    current_user_id,
    target_input_hash,
    btrim(target_provider),
    btrim(target_model)
  )
  on conflict (user_id, application_id, input_hash) do nothing;

  select *
  into owned_run
  from public.application_analysis_runs
  where user_id = current_user_id
    and application_id = target_application_id
    and input_hash = target_input_hash;

  if owned_run.id is null
    or owned_run.provider <> btrim(target_provider)
    or owned_run.model <> btrim(target_model) then
    raise exception 'application-analysis-conflict' using errcode = '23505';
  end if;

  return owned_run;
end;
$$;

create function public.claim_application_analysis(target_run_id uuid)
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
    and status in ('queued', 'failed');

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_application_analysis(
  target_run_id uuid,
  accepted_requirements jsonb,
  rejected_requirement_count integer,
  rejected_evidence_count integer,
  ai_usage jsonb,
  estimated_cost jsonb
)
returns public.application_analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.application_analysis_runs%rowtype;
  completed_run public.application_analysis_runs%rowtype;
  jd_source text;
  candidate jsonb;
  candidate_category text;
  candidate_text text;
  candidate_excerpt text;
  candidate_priority text;
  candidate_match_status text;
  candidate_match_reason text;
  candidate_fact_ids jsonb;
  evidence_fact_id uuid;
  created_requirement_id uuid;
  requirement_index integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if jsonb_typeof(accepted_requirements) <> 'array'
    or jsonb_array_length(accepted_requirements) > 80
    or rejected_requirement_count < 0
    or rejected_evidence_count < 0 then
    raise exception 'invalid-analysis-result' using errcode = '22023';
  end if;

  select *
  into owned_run
  from public.application_analysis_runs
  where id = target_run_id
    and user_id = current_user_id
    and status = 'running'
  for update;

  if owned_run.id is null then
    raise exception 'application-analysis-not-running' using errcode = 'P0002';
  end if;

  select jd_text
  into jd_source
  from public.applications
  where id = owned_run.application_id
    and user_id = current_user_id;

  if jd_source is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  delete from public.application_requirements
  where application_id = owned_run.application_id
    and user_id = current_user_id;

  for candidate in select value from jsonb_array_elements(accepted_requirements)
  loop
    candidate_category := candidate ->> 'category';
    candidate_text := btrim(candidate ->> 'text');
    candidate_excerpt := btrim(candidate ->> 'sourceExcerpt');
    candidate_priority := candidate ->> 'priority';
    candidate_match_status := candidate ->> 'matchStatus';
    candidate_match_reason := nullif(btrim(candidate ->> 'matchReason'), '');
    candidate_fact_ids := candidate -> 'matchedFactIds';

    if candidate_category not in (
      'responsibility',
      'hard_requirement',
      'preferred',
      'skill',
      'language_work_authorization',
      'location_workplace',
      'compensation'
    )
      or char_length(candidate_text) not between 1 and 500
      or char_length(candidate_excerpt) not between 12 and 1000
      or candidate_priority not in ('core', 'supporting')
      or candidate_match_status not in (
        'evidence', 'partial', 'none', 'needs_user'
      )
      or (
        candidate_match_reason is not null
        and char_length(candidate_match_reason) > 700
      )
      or jsonb_typeof(candidate_fact_ids) <> 'array'
      or jsonb_array_length(candidate_fact_ids) > 5
      or strpos(
        regexp_replace(lower(jd_source), '[[:space:]]+', ' ', 'g'),
        regexp_replace(lower(candidate_excerpt), '[[:space:]]+', ' ', 'g')
      ) = 0
      or (
        candidate_match_status in ('evidence', 'partial')
        and jsonb_array_length(candidate_fact_ids) = 0
      )
      or (
        candidate_match_status in ('none', 'needs_user')
        and jsonb_array_length(candidate_fact_ids) <> 0
      ) then
      raise exception 'invalid-analysis-requirement' using errcode = '22023';
    end if;

    insert into public.application_requirements (
      analysis_run_id,
      application_id,
      user_id,
      category,
      requirement_text,
      source_excerpt,
      priority,
      match_status,
      match_reason,
      sort_order
    )
    values (
      owned_run.id,
      owned_run.application_id,
      current_user_id,
      candidate_category,
      candidate_text,
      candidate_excerpt,
      candidate_priority,
      candidate_match_status,
      candidate_match_reason,
      requirement_index
    )
    returning id into created_requirement_id;

    for evidence_fact_id in
      select value::uuid
      from jsonb_array_elements_text(candidate_fact_ids)
    loop
      if not exists (
        select 1
        from public.career_facts
        where id = evidence_fact_id
          and user_id = current_user_id
          and confirmation_status = 'confirmed'
      ) then
        raise exception 'invalid-analysis-evidence' using errcode = '22023';
      end if;

      insert into public.application_requirement_evidence (
        requirement_id,
        career_fact_id,
        application_id,
        user_id
      )
      values (
        created_requirement_id,
        evidence_fact_id,
        owned_run.application_id,
        current_user_id
      );
    end loop;

    requirement_index := requirement_index + 1;
  end loop;

  update public.application_analysis_runs
  set
    status = 'succeeded',
    result = jsonb_build_object(
      'acceptedRequirementCount', jsonb_array_length(accepted_requirements),
      'rejectedRequirementCount', rejected_requirement_count,
      'rejectedEvidenceCount', rejected_evidence_count,
      'ai', coalesce(ai_usage, '{}'::jsonb),
      'estimatedCost', estimated_cost
    ),
    error_code = null,
    error_message = null,
    finished_at = now()
  where id = owned_run.id
    and user_id = current_user_id
  returning * into completed_run;

  return completed_run;
end;
$$;

create function public.fail_application_analysis(
  target_run_id uuid,
  target_error_code text,
  target_error_message text
)
returns public.application_analysis_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.application_analysis_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  update public.application_analysis_runs
  set
    status = 'failed',
    result = null,
    error_code = btrim(target_error_code),
    error_message = btrim(target_error_message),
    finished_at = now()
  where id = target_run_id
    and user_id = current_user_id
    and status = 'running'
  returning * into failed_run;

  if failed_run.id is null then
    raise exception 'application-analysis-not-running' using errcode = 'P0002';
  end if;

  return failed_run;
end;
$$;

revoke all on function public.create_or_get_application_analysis(
  uuid, text, text, text
) from public;
revoke all on function public.claim_application_analysis(uuid) from public;
revoke all on function public.complete_application_analysis(
  uuid, jsonb, integer, integer, jsonb, jsonb
) from public;
revoke all on function public.fail_application_analysis(
  uuid, text, text
) from public;

grant execute on function public.create_or_get_application_analysis(
  uuid, text, text, text
) to authenticated;
grant execute on function public.claim_application_analysis(uuid)
  to authenticated;
grant execute on function public.complete_application_analysis(
  uuid, jsonb, integer, integer, jsonb, jsonb
) to authenticated;
grant execute on function public.fail_application_analysis(
  uuid, text, text
) to authenticated;
