create function public.jd_gap_v3_json_has_exact_keys(
  payload jsonb,
  expected_keys text[]
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(payload) = 'object'
    and (select count(*) from jsonb_object_keys(payload)) = cardinality(expected_keys)
    and not exists (
      select 1 from jsonb_object_keys(payload) as actual(key)
      where actual.key <> all(expected_keys)
    )
    and not exists (
      select 1 from unnest(expected_keys) as expected(key)
      where not payload ? expected.key
    ),
    false
  );
$$;

create function public.jd_gap_v3_valid_ai_metadata(
  payload jsonb,
  expected_provider text,
  expected_model text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    public.jd_gap_v3_json_has_exact_keys(
      payload,
      array['provider', 'model', 'requestId', 'usage', 'priceScheduleVersion']
    )
    and jsonb_typeof(payload -> 'provider') = 'string'
    and payload ->> 'provider' = expected_provider
    and jsonb_typeof(payload -> 'model') = 'string'
    and payload ->> 'model' = expected_model
    and jsonb_typeof(payload -> 'requestId') in ('string', 'null')
    and (
      payload -> 'requestId' = 'null'::jsonb
      or (
        char_length(btrim(payload ->> 'requestId')) between 1 and 200
        and payload ->> 'requestId' ~ '^[A-Za-z0-9._:-]{1,200}$'
      )
    )
    and jsonb_typeof(payload -> 'priceScheduleVersion') in ('string', 'null')
    and (
      payload -> 'priceScheduleVersion' = 'null'::jsonb
      or (
        char_length(btrim(payload ->> 'priceScheduleVersion')) between 1 and 80
        and payload ->> 'priceScheduleVersion' ~ '^[A-Za-z0-9._:-]{1,80}$'
      )
    )
    and public.jd_gap_v3_json_has_exact_keys(
      payload -> 'usage',
      array['inputCacheHitTokens', 'inputCacheMissTokens', 'outputTokens']
    )
    and jsonb_typeof(payload -> 'usage' -> 'inputCacheHitTokens') = 'number'
    and jsonb_typeof(payload -> 'usage' -> 'inputCacheMissTokens') = 'number'
    and jsonb_typeof(payload -> 'usage' -> 'outputTokens') = 'number'
    and (payload -> 'usage' ->> 'inputCacheHitTokens') ~ '^[0-9]+$'
    and (payload -> 'usage' ->> 'inputCacheMissTokens') ~ '^[0-9]+$'
    and (payload -> 'usage' ->> 'outputTokens') ~ '^[0-9]+$'
    and (payload -> 'usage' ->> 'inputCacheHitTokens')::numeric between 0 and 2147483647
    and (payload -> 'usage' ->> 'inputCacheMissTokens')::numeric between 0 and 2147483647
    and (payload -> 'usage' ->> 'outputTokens')::numeric between 0 and 2147483647,
    false
  );
$$;

create function public.jd_gap_v3_valid_estimated_cost(
  payload jsonb,
  ai_metadata jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when payload is null then true
    else coalesce(
      public.jd_gap_v3_json_has_exact_keys(
        payload,
        array['amount', 'currency', 'scheduleVersion', 'tier']
      )
      and jsonb_typeof(payload -> 'amount') = 'number'
      and (payload ->> 'amount')::numeric >= 0
      and jsonb_typeof(payload -> 'currency') = 'string'
      and payload ->> 'currency' = 'USD'
      and jsonb_typeof(payload -> 'scheduleVersion') = 'string'
      and char_length(btrim(payload ->> 'scheduleVersion')) between 1 and 80
      and payload ->> 'scheduleVersion' ~ '^[A-Za-z0-9._:-]{1,80}$'
      and jsonb_typeof(payload -> 'tier') = 'string'
      and payload ->> 'tier' in ('default', 'peak')
      and ai_metadata -> 'priceScheduleVersion' <> 'null'::jsonb
      and ai_metadata ->> 'priceScheduleVersion' = payload ->> 'scheduleVersion',
      false
    )
  end;
$$;

create table public.jd_structure_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  jd_sha256 text not null check (jd_sha256 ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  schema_version text not null check (
    char_length(btrim(schema_version)) between 1 and 80
    and schema_version ~ '^[A-Za-z0-9._:-]{1,80}$'
  ),
  prompt_version text not null check (
    char_length(btrim(prompt_version)) between 1 and 80
    and prompt_version ~ '^[A-Za-z0-9._:-]{1,80}$'
  ),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  jd_translation_zh text check (
    jd_translation_zh is null
    or char_length(btrim(jd_translation_zh)) between 1 and 100000
  ),
  result jsonb check (
    result is null
    or public.jd_gap_v3_json_has_exact_keys(
      result,
      array['requirementCount', 'criterionCount', 'translationAvailable', 'ai', 'estimatedCost']
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
    (status = 'queued' and attempt_count = 0 and started_at is null and finished_at is null and result is null and jd_translation_zh is null and error_code is null)
    or (status = 'running' and attempt_count > 0 and started_at is not null and finished_at is null and result is null and jd_translation_zh is null and error_code is null)
    or (status = 'succeeded' and attempt_count > 0 and finished_at is not null and result is not null and jd_translation_zh is not null and error_code is null)
    or (status = 'failed' and attempt_count > 0 and finished_at is not null and result is null and jd_translation_zh is null and error_code is not null)
  )
);

create table public.jd_structure_requirements (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'responsibility', 'hard_requirement', 'preferred', 'skill',
    'language_work_authorization', 'location_workplace', 'compensation'
  )),
  requirement_type text not null check (requirement_type in ('required', 'core', 'preferred')),
  original_text text not null check (char_length(btrim(original_text)) between 1 and 500),
  translation_zh text not null check (char_length(btrim(translation_zh)) between 1 and 1000),
  source_excerpt text not null check (char_length(btrim(source_excerpt)) between 12 and 1000),
  allows_equivalent boolean not null default false,
  explicit_gate boolean not null default false,
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (run_id, sort_order)
);

create table public.jd_structure_criteria (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_key text not null check (group_key ~ '^g[1-9][0-9]?$'),
  group_rule text not null check (group_rule in ('all', 'any')),
  kind text not null check (kind in (
    'degree_level', 'degree_field', 'years_experience', 'language',
    'work_authorization', 'certification', 'tool', 'responsibility',
    'industry', 'soft_skill', 'quantified_outcome', 'other'
  )),
  original_text text not null check (char_length(btrim(original_text)) between 1 and 500),
  translation_zh text not null check (char_length(btrim(translation_zh)) between 1 and 1000),
  constraint_payload jsonb not null check (
    public.jd_gap_v3_json_has_exact_keys(constraint_payload, array['operator', 'value', 'unit'])
    and jsonb_typeof(constraint_payload -> 'operator') = 'string'
    and constraint_payload ->> 'operator' in ('none', 'exact', 'gte', 'one_of', 'equivalent_allowed')
    and jsonb_typeof(constraint_payload -> 'value') in ('string', 'null')
    and jsonb_typeof(constraint_payload -> 'unit') in ('string', 'null')
  ),
  sort_order integer not null check (sort_order between 0 and 11),
  created_at timestamptz not null default now(),
  unique (requirement_id, sort_order)
);

create table public.jd_gap_v3_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  structure_run_id uuid not null references public.jd_structure_runs(id) on delete cascade,
  source_asset_id uuid references public.source_assets(id) on delete set null,
  source_filename text not null check (char_length(btrim(source_filename)) between 1 and 260),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  fact_fingerprint text not null check (fact_fingerprint ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  schema_version text not null check (
    char_length(btrim(schema_version)) between 1 and 80
    and schema_version ~ '^[A-Za-z0-9._:-]{1,80}$'
  ),
  prompt_version text not null check (
    char_length(btrim(prompt_version)) between 1 and 80
    and prompt_version ~ '^[A-Za-z0-9._:-]{1,80}$'
  ),
  policy_version text not null check (
    char_length(btrim(policy_version)) between 1 and 80
    and policy_version ~ '^[A-Za-z0-9._:-]{1,80}$'
  ),
  status public.processing_job_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  result jsonb check (
    result is null
    or public.jd_gap_v3_json_has_exact_keys(
      result,
      array['requirementCount', 'criterionCount', 'completeCount', 'partialCount', 'noneCount', 'needsConfirmationCount', 'ai', 'estimatedCost']
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
    (status = 'queued' and attempt_count = 0 and started_at is null and finished_at is null and result is null and error_code is null)
    or (status = 'running' and attempt_count > 0 and started_at is not null and finished_at is null and result is null and error_code is null)
    or (status = 'succeeded' and attempt_count > 0 and finished_at is not null and result is not null and error_code is null)
    or (status = 'failed' and attempt_count > 0 and finished_at is not null and result is null and error_code is not null)
  )
);

create table public.jd_gap_v3_requirement_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_gap_v3_runs(id) on delete cascade,
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coverage_status text not null check (coverage_status in ('complete', 'partial', 'none', 'needs_confirmation')),
  impact_level text not null check (impact_level in ('blocking', 'important', 'minor')),
  covered_criterion_count integer not null check (covered_criterion_count between 0 and 12),
  missing_criterion_count integer not null check (missing_criterion_count between 0 and 12),
  sort_order integer not null check (sort_order between 0 and 79),
  created_at timestamptz not null default now(),
  unique (run_id, requirement_id),
  unique (run_id, sort_order)
);

create table public.jd_gap_v3_criterion_assessments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jd_gap_v3_runs(id) on delete cascade,
  criterion_id uuid not null references public.jd_structure_criteria(id) on delete cascade,
  requirement_id uuid not null references public.jd_structure_requirements(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_evidence_status text not null check (
    resume_evidence_status in ('direct', 'partial_direct', 'none', 'needs_confirmation')
  ),
  verified_resume_excerpt text check (
    verified_resume_excerpt is null
    or char_length(btrim(verified_resume_excerpt)) between 1 and 1000
  ),
  profile_fact_ids uuid[] not null default '{}'::uuid[] check (cardinality(profile_fact_ids) <= 5),
  gap_type text not null check (gap_type in (
    'missing_from_resume', 'too_vague', 'missing_result_or_number',
    'no_supporting_fact', 'language_or_authorization_confirmation', 'none'
  )),
  reason_zh text not null check (char_length(btrim(reason_zh)) between 1 and 700),
  user_question_zh text check (
    user_question_zh is null
    or char_length(btrim(user_question_zh)) between 1 and 500
  ),
  created_at timestamptz not null default now(),
  unique (run_id, criterion_id),
  check (
    (resume_evidence_status in ('direct', 'partial_direct') and verified_resume_excerpt is not null)
    or (resume_evidence_status in ('none', 'needs_confirmation') and verified_resume_excerpt is null)
  )
);

create index jd_structure_runs_application_created_idx
  on public.jd_structure_runs(application_id, created_at desc);
create index jd_structure_requirements_run_order_idx
  on public.jd_structure_requirements(run_id, sort_order);
create index jd_structure_criteria_run_idx
  on public.jd_structure_criteria(run_id);
create index jd_gap_v3_runs_application_created_idx
  on public.jd_gap_v3_runs(application_id, created_at desc);
create index jd_gap_v3_requirement_results_requirement_idx
  on public.jd_gap_v3_requirement_results(requirement_id);
create index jd_gap_v3_criterion_assessments_requirement_idx
  on public.jd_gap_v3_criterion_assessments(requirement_id);

alter table public.jd_structure_runs enable row level security;
alter table public.jd_structure_requirements enable row level security;
alter table public.jd_structure_criteria enable row level security;
alter table public.jd_gap_v3_runs enable row level security;
alter table public.jd_gap_v3_requirement_results enable row level security;
alter table public.jd_gap_v3_criterion_assessments enable row level security;

create policy jd_structure_runs_owner_select on public.jd_structure_runs
for select to authenticated using ((select auth.uid()) = user_id);
create policy jd_structure_requirements_owner_select on public.jd_structure_requirements
for select to authenticated using ((select auth.uid()) = user_id);
create policy jd_structure_criteria_owner_select on public.jd_structure_criteria
for select to authenticated using ((select auth.uid()) = user_id);
create policy jd_gap_v3_runs_owner_select on public.jd_gap_v3_runs
for select to authenticated using ((select auth.uid()) = user_id);
create policy jd_gap_v3_requirement_results_owner_select on public.jd_gap_v3_requirement_results
for select to authenticated using ((select auth.uid()) = user_id);
create policy jd_gap_v3_criterion_assessments_owner_select on public.jd_gap_v3_criterion_assessments
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.jd_structure_runs from anon, authenticated;
revoke all on public.jd_structure_requirements from anon, authenticated;
revoke all on public.jd_structure_criteria from anon, authenticated;
revoke all on public.jd_gap_v3_runs from anon, authenticated;
revoke all on public.jd_gap_v3_requirement_results from anon, authenticated;
revoke all on public.jd_gap_v3_criterion_assessments from anon, authenticated;
grant select on public.jd_structure_runs to authenticated;
grant select on public.jd_structure_requirements to authenticated;
grant select on public.jd_structure_criteria to authenticated;
grant select on public.jd_gap_v3_runs to authenticated;
grant select on public.jd_gap_v3_requirement_results to authenticated;
grant select on public.jd_gap_v3_criterion_assessments to authenticated;

create function public.touch_jd_gap_v3_run_updated_at()
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

create trigger jd_structure_runs_touch_updated_at
before update on public.jd_structure_runs
for each row execute function public.touch_jd_gap_v3_run_updated_at();
create trigger jd_gap_v3_runs_touch_updated_at
before update on public.jd_gap_v3_runs
for each row execute function public.touch_jd_gap_v3_run_updated_at();

create function public.create_or_get_jd_structure(
  target_application_id uuid,
  target_jd_sha256 text,
  target_input_hash text,
  target_provider text,
  target_model text,
  target_schema_version text,
  target_prompt_version text
)
returns public.jd_structure_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_application public.applications%rowtype;
  owned_run public.jd_structure_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_jd_sha256 is null or target_jd_sha256 !~ '^[0-9a-f]{64}$'
    or target_input_hash is null or target_input_hash !~ '^[0-9a-f]{64}$'
    or target_provider is null or char_length(btrim(target_provider)) not between 1 and 80
    or target_model is null or char_length(btrim(target_model)) not between 1 and 160
    or target_schema_version is null or target_schema_version !~ '^[A-Za-z0-9._:-]{1,80}$'
    or target_prompt_version is null or target_prompt_version !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'invalid-jd-structure-input' using errcode = '22023';
  end if;

  select * into owned_application from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;
  if owned_application.id is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  insert into public.jd_structure_runs (
    application_id, user_id, jd_sha256, input_hash, provider, model,
    schema_version, prompt_version
  ) values (
    owned_application.id, current_user_id, lower(target_jd_sha256),
    lower(target_input_hash), btrim(target_provider), btrim(target_model),
    btrim(target_schema_version), btrim(target_prompt_version)
  ) on conflict (user_id, application_id, input_hash, provider, model) do nothing;

  select * into owned_run from public.jd_structure_runs
  where user_id = current_user_id
    and application_id = owned_application.id
    and input_hash = lower(target_input_hash)
    and provider = btrim(target_provider)
    and model = btrim(target_model);
  if owned_run.id is null
    or owned_run.jd_sha256 <> lower(target_jd_sha256)
    or owned_run.schema_version <> btrim(target_schema_version)
    or owned_run.prompt_version <> btrim(target_prompt_version) then
    raise exception 'jd-structure-conflict' using errcode = '23505';
  end if;
  return owned_run;
end;
$$;

create function public.claim_jd_structure(
  target_run_id uuid,
  expected_attempt_count integer,
  expected_status text,
  target_lease_seconds integer
)
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
  if not exists (
    select 1 from public.jd_structure_runs
    where id = target_run_id and user_id = current_user_id
  ) then
    raise exception 'jd-structure-run-not-found' using errcode = 'P0002';
  end if;
  if expected_attempt_count is null or expected_attempt_count not between 0 and 1000
    or expected_status is null or expected_status not in ('queued', 'running', 'failed')
    or target_lease_seconds is null or target_lease_seconds not between 1 and 86400 then
    raise exception 'invalid-jd-structure-claim' using errcode = '22023';
  end if;

  update public.jd_structure_runs
  set status = 'running', attempt_count = attempt_count + 1,
      result = null, jd_translation_zh = null,
      error_code = null, error_message = null,
      started_at = now(), finished_at = null, updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and attempt_count = expected_attempt_count
    and status = expected_status::public.processing_job_status
    and (
      expected_status in ('queued', 'failed')
      or (expected_status = 'running'
        and updated_at < now() - make_interval(secs => target_lease_seconds))
    );
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_jd_structure(
  target_run_id uuid,
  target_attempt_count integer,
  target_jd_translation_zh text,
  target_requirements jsonb,
  target_ai_metadata jsonb,
  target_estimated_cost jsonb
)
returns public.jd_structure_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.jd_structure_runs%rowtype;
  owned_application public.applications%rowtype;
  completed_run public.jd_structure_runs%rowtype;
  requirement_payload jsonb;
  criterion_payload jsonb;
  constraint_payload jsonb;
  requirement_id uuid;
  requirement_count integer;
  criterion_count integer := 0;
  safe_ai jsonb;
  safe_cost jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_jd_translation_zh is null
    or char_length(btrim(target_jd_translation_zh)) not between 1 and 100000
    or target_requirements is null or jsonb_typeof(target_requirements) <> 'array'
    or jsonb_array_length(target_requirements) not between 1 and 80 then
    raise exception 'invalid-jd-structure-result' using errcode = '22023';
  end if;

  select * into owned_run from public.jd_structure_runs
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  for update;
  if owned_run.id is null then
    raise exception 'jd-structure-not-running' using errcode = 'P0002';
  end if;
  select * into owned_application from public.applications
  where id = owned_run.application_id and user_id = current_user_id
  for update;
  if owned_application.id is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;
  if not public.jd_gap_v3_valid_ai_metadata(
    target_ai_metadata, owned_run.provider, owned_run.model
  ) then
    raise exception 'invalid-jd-structure-usage' using errcode = '22023';
  end if;
  if not public.jd_gap_v3_valid_estimated_cost(
    target_estimated_cost, target_ai_metadata
  ) then
    raise exception 'invalid-jd-structure-cost' using errcode = '22023';
  end if;

  for requirement_payload in select value from jsonb_array_elements(target_requirements)
  loop
    if not public.jd_gap_v3_json_has_exact_keys(
      requirement_payload,
      array['category', 'requirementType', 'originalText', 'translationZh', 'sourceExcerpt', 'allowsEquivalent', 'explicitGate', 'sortOrder', 'criteria']
    )
      or jsonb_typeof(requirement_payload -> 'category') <> 'string'
      or requirement_payload ->> 'category' not in (
        'responsibility', 'hard_requirement', 'preferred', 'skill',
        'language_work_authorization', 'location_workplace', 'compensation'
      )
      or jsonb_typeof(requirement_payload -> 'requirementType') <> 'string'
      or requirement_payload ->> 'requirementType' not in ('required', 'core', 'preferred')
      or jsonb_typeof(requirement_payload -> 'originalText') <> 'string'
      or char_length(btrim(requirement_payload ->> 'originalText')) not between 1 and 500
      or jsonb_typeof(requirement_payload -> 'translationZh') <> 'string'
      or char_length(btrim(requirement_payload ->> 'translationZh')) not between 1 and 1000
      or jsonb_typeof(requirement_payload -> 'sourceExcerpt') <> 'string'
      or char_length(btrim(requirement_payload ->> 'sourceExcerpt')) not between 12 and 1000
      or strpos(
        lower(regexp_replace(owned_application.jd_text, '[[:space:]]+', ' ', 'g')),
        lower(regexp_replace(btrim(requirement_payload ->> 'sourceExcerpt'), '[[:space:]]+', ' ', 'g'))
      ) = 0
      or jsonb_typeof(requirement_payload -> 'allowsEquivalent') <> 'boolean'
      or jsonb_typeof(requirement_payload -> 'explicitGate') <> 'boolean'
      or jsonb_typeof(requirement_payload -> 'sortOrder') <> 'number'
      or (requirement_payload ->> 'sortOrder') !~ '^[0-9]+$'
      or (requirement_payload ->> 'sortOrder')::integer not between 0 and 79
      or jsonb_typeof(requirement_payload -> 'criteria') <> 'array'
      or jsonb_array_length(requirement_payload -> 'criteria') not between 1 and 12 then
      raise exception 'invalid-jd-structure-requirement' using errcode = '22023';
    end if;

    insert into public.jd_structure_requirements (
      run_id, application_id, user_id, category, requirement_type,
      original_text, translation_zh, source_excerpt, allows_equivalent,
      explicit_gate, sort_order
    ) values (
      owned_run.id, owned_run.application_id, current_user_id,
      requirement_payload ->> 'category', requirement_payload ->> 'requirementType',
      btrim(requirement_payload ->> 'originalText'),
      btrim(requirement_payload ->> 'translationZh'),
      btrim(requirement_payload ->> 'sourceExcerpt'),
      (requirement_payload ->> 'allowsEquivalent')::boolean,
      (requirement_payload ->> 'explicitGate')::boolean,
      (requirement_payload ->> 'sortOrder')::integer
    ) returning id into requirement_id;

    for criterion_payload in
      select value from jsonb_array_elements(requirement_payload -> 'criteria')
    loop
      constraint_payload := criterion_payload -> 'constraint';
      if not public.jd_gap_v3_json_has_exact_keys(
        criterion_payload,
        array['groupKey', 'groupRule', 'kind', 'originalText', 'translationZh', 'constraint', 'sortOrder']
      )
        or jsonb_typeof(criterion_payload -> 'groupKey') <> 'string'
        or criterion_payload ->> 'groupKey' !~ '^g[1-9][0-9]?$'
        or jsonb_typeof(criterion_payload -> 'groupRule') <> 'string'
        or criterion_payload ->> 'groupRule' not in ('all', 'any')
        or jsonb_typeof(criterion_payload -> 'kind') <> 'string'
        or criterion_payload ->> 'kind' not in (
          'degree_level', 'degree_field', 'years_experience', 'language',
          'work_authorization', 'certification', 'tool', 'responsibility',
          'industry', 'soft_skill', 'quantified_outcome', 'other'
        )
        or jsonb_typeof(criterion_payload -> 'originalText') <> 'string'
        or char_length(btrim(criterion_payload ->> 'originalText')) not between 1 and 500
        or jsonb_typeof(criterion_payload -> 'translationZh') <> 'string'
        or char_length(btrim(criterion_payload ->> 'translationZh')) not between 1 and 1000
        or jsonb_typeof(criterion_payload -> 'sortOrder') <> 'number'
        or (criterion_payload ->> 'sortOrder') !~ '^[0-9]+$'
        or (criterion_payload ->> 'sortOrder')::integer not between 0 and 11
        or not public.jd_gap_v3_json_has_exact_keys(
          constraint_payload, array['operator', 'value', 'unit']
        )
        or jsonb_typeof(constraint_payload -> 'operator') <> 'string'
        or constraint_payload ->> 'operator' not in ('none', 'exact', 'gte', 'one_of', 'equivalent_allowed')
        or jsonb_typeof(constraint_payload -> 'value') not in ('string', 'null')
        or jsonb_typeof(constraint_payload -> 'unit') not in ('string', 'null')
        or (jsonb_typeof(constraint_payload -> 'value') = 'string'
          and char_length(btrim(constraint_payload ->> 'value')) not between 1 and 160)
        or (jsonb_typeof(constraint_payload -> 'unit') = 'string'
          and char_length(btrim(constraint_payload ->> 'unit')) not between 1 and 40) then
        raise exception 'invalid-jd-structure-criterion' using errcode = '22023';
      end if;

      insert into public.jd_structure_criteria (
        requirement_id, run_id, application_id, user_id, group_key,
        group_rule, kind, original_text, translation_zh,
        constraint_payload, sort_order
      ) values (
        requirement_id, owned_run.id, owned_run.application_id, current_user_id,
        criterion_payload ->> 'groupKey', criterion_payload ->> 'groupRule',
        criterion_payload ->> 'kind', btrim(criterion_payload ->> 'originalText'),
        btrim(criterion_payload ->> 'translationZh'), constraint_payload,
        (criterion_payload ->> 'sortOrder')::integer
      );
      criterion_count := criterion_count + 1;
    end loop;
  end loop;

  if exists (
    select 1 from public.jd_structure_criteria stored_criterion
    where stored_criterion.run_id = owned_run.id
    group by stored_criterion.requirement_id, stored_criterion.group_key
    having count(distinct stored_criterion.group_rule) <> 1
  ) then
    raise exception 'invalid-jd-structure-groups' using errcode = '22023';
  end if;
  select count(*) into requirement_count from public.jd_structure_requirements
  where run_id = owned_run.id;
  if requirement_count <> jsonb_array_length(target_requirements)
    or criterion_count < requirement_count then
    raise exception 'invalid-jd-structure-result' using errcode = '22023';
  end if;

  safe_ai := jsonb_build_object(
    'provider', owned_run.provider,
    'model', owned_run.model,
    'requestId', target_ai_metadata -> 'requestId',
    'usage', jsonb_build_object(
      'inputCacheHitTokens', (target_ai_metadata -> 'usage' ->> 'inputCacheHitTokens')::integer,
      'inputCacheMissTokens', (target_ai_metadata -> 'usage' ->> 'inputCacheMissTokens')::integer,
      'outputTokens', (target_ai_metadata -> 'usage' ->> 'outputTokens')::integer
    ),
    'priceScheduleVersion', target_ai_metadata -> 'priceScheduleVersion'
  );
  safe_cost := case when target_estimated_cost is null then null else jsonb_build_object(
    'amount', (target_estimated_cost ->> 'amount')::numeric,
    'currency', 'USD',
    'scheduleVersion', target_estimated_cost ->> 'scheduleVersion',
    'tier', target_estimated_cost ->> 'tier'
  ) end;

  update public.jd_structure_runs
  set status = 'succeeded', jd_translation_zh = btrim(target_jd_translation_zh),
      result = jsonb_build_object(
        'requirementCount', requirement_count,
        'criterionCount', criterion_count,
        'translationAvailable', true,
        'ai', safe_ai,
        'estimatedCost', safe_cost
      ), error_code = null, error_message = null,
      finished_at = now(), updated_at = now()
  where id = owned_run.id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into completed_run;
  if completed_run.id is null then
    raise exception 'jd-structure-not-running' using errcode = 'P0002';
  end if;
  return completed_run;
exception
  when unique_violation then
    raise exception 'invalid-jd-structure-result' using errcode = '22023';
end;
$$;

create function public.fail_jd_structure(
  target_run_id uuid,
  target_attempt_count integer,
  target_error_code text,
  target_error_message text
)
returns public.jd_structure_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.jd_structure_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_error_message is not null then null; end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_error_code not in (
      'jd-structure-invalid-output', 'ai-provider-authentication-failed',
      'ai-provider-rate-limited', 'ai-provider-request-failed',
      'ai-provider-timeout', 'jd-structure-failed'
    ) then
    raise exception 'invalid-jd-structure-error' using errcode = '22023';
  end if;
  update public.jd_structure_runs
  set status = 'failed', result = null, jd_translation_zh = null,
      error_code = btrim(target_error_code),
      error_message = 'JD structure analysis failed.',
      finished_at = now(), updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into failed_run;
  if failed_run.id is null then
    raise exception 'jd-structure-not-running' using errcode = 'P0002';
  end if;
  return failed_run;
end;
$$;

create function public.create_or_get_jd_gap_v3(
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
    or owned_asset.id is null or owned_asset.status <> 'ready'
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

create function public.claim_jd_gap_v3(
  target_run_id uuid,
  expected_attempt_count integer,
  expected_status text,
  target_lease_seconds integer
)
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
  if not exists (
    select 1 from public.jd_gap_v3_runs
    where id = target_run_id and user_id = current_user_id
  ) then
    raise exception 'jd-gap-run-not-found' using errcode = 'P0002';
  end if;
  if expected_attempt_count is null or expected_attempt_count not between 0 and 1000
    or expected_status is null or expected_status not in ('queued', 'running', 'failed')
    or target_lease_seconds is null or target_lease_seconds not between 1 and 86400 then
    raise exception 'invalid-jd-gap-claim' using errcode = '22023';
  end if;
  update public.jd_gap_v3_runs
  set status = 'running', attempt_count = attempt_count + 1,
      result = null, error_code = null, error_message = null,
      started_at = now(), finished_at = null, updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and attempt_count = expected_attempt_count
    and status = expected_status::public.processing_job_status
    and (
      expected_status in ('queued', 'failed')
      or (expected_status = 'running'
        and updated_at < now() - make_interval(secs => target_lease_seconds))
    );
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_jd_gap_v3(
  target_run_id uuid,
  target_attempt_count integer,
  target_requirement_results jsonb,
  target_criterion_assessments jsonb,
  target_ai_metadata jsonb,
  target_estimated_cost jsonb
)
returns public.jd_gap_v3_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.jd_gap_v3_runs%rowtype;
  owned_structure public.jd_structure_runs%rowtype;
  owned_application public.applications%rowtype;
  owned_asset public.source_assets%rowtype;
  completed_run public.jd_gap_v3_runs%rowtype;
  result_payload jsonb;
  assessment_payload jsonb;
  fact_payload jsonb;
  candidate_requirement_id uuid;
  candidate_criterion_id uuid;
  candidate_fact_id uuid;
  candidate_fact_ids uuid[];
  expected_requirement_count integer;
  expected_criterion_count integer;
  direct_count integer;
  group_count integer;
  complete_group_count integer;
  has_resume_evidence boolean;
  has_confirmation boolean;
  expected_coverage text;
  expected_impact text;
  requirement_row public.jd_structure_requirements%rowtype;
  stored_result public.jd_gap_v3_requirement_results%rowtype;
  complete_count integer;
  partial_count integer;
  none_count integer;
  confirmation_count integer;
  safe_ai jsonb;
  safe_cost jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_requirement_results is null or jsonb_typeof(target_requirement_results) <> 'array'
    or jsonb_array_length(target_requirement_results) > 80
    or target_criterion_assessments is null or jsonb_typeof(target_criterion_assessments) <> 'array'
    or jsonb_array_length(target_criterion_assessments) > 960 then
    raise exception 'invalid-jd-gap-result' using errcode = '22023';
  end if;

  select * into owned_run from public.jd_gap_v3_runs
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  for update;
  if owned_run.id is null then
    raise exception 'jd-gap-not-running' using errcode = 'P0002';
  end if;
  select * into owned_structure from public.jd_structure_runs
  where id = owned_run.structure_run_id and user_id = current_user_id
  for update;
  select * into owned_asset from public.source_assets
  where id = owned_run.source_asset_id and user_id = current_user_id
  for update;
  select * into owned_application from public.applications
  where id = owned_run.application_id and user_id = current_user_id
  for update;
  if owned_structure.id is null or owned_structure.status <> 'succeeded'
    or owned_structure.application_id <> owned_run.application_id
    or owned_asset.id is null or owned_asset.status <> 'ready'
    or btrim(owned_asset.original_name) <> owned_run.source_filename
    or lower(owned_asset.sha256) <> owned_run.source_sha256
    or owned_application.id is null
    or owned_application.resume_source_asset_id is distinct from owned_asset.id then
    raise exception 'application-or-resume-not-found' using errcode = 'P0002';
  end if;
  if not public.jd_gap_v3_valid_ai_metadata(
    target_ai_metadata, owned_run.provider, owned_run.model
  ) then
    raise exception 'invalid-jd-gap-usage' using errcode = '22023';
  end if;
  if not public.jd_gap_v3_valid_estimated_cost(
    target_estimated_cost, target_ai_metadata
  ) then
    raise exception 'invalid-jd-gap-cost' using errcode = '22023';
  end if;

  select count(*) into expected_requirement_count
  from public.jd_structure_requirements
  where run_id = owned_structure.id and application_id = owned_run.application_id
    and user_id = current_user_id;
  select count(*) into expected_criterion_count
  from public.jd_structure_criteria
  where run_id = owned_structure.id and application_id = owned_run.application_id
    and user_id = current_user_id;
  if expected_requirement_count < 1
    or jsonb_array_length(target_requirement_results) <> expected_requirement_count
    or jsonb_array_length(target_criterion_assessments) <> expected_criterion_count then
    raise exception 'invalid-jd-gap-completeness' using errcode = '22023';
  end if;

  for result_payload in select value from jsonb_array_elements(target_requirement_results)
  loop
    if not public.jd_gap_v3_json_has_exact_keys(
      result_payload,
      array['requirementId', 'coverageStatus', 'impactLevel', 'coveredCriterionCount', 'missingCriterionCount', 'sortOrder']
    )
      or jsonb_typeof(result_payload -> 'requirementId') <> 'string'
      or result_payload ->> 'requirementId' !~ '^[0-9a-fA-F-]{36}$'
      or jsonb_typeof(result_payload -> 'coverageStatus') <> 'string'
      or result_payload ->> 'coverageStatus' not in ('complete', 'partial', 'none', 'needs_confirmation')
      or jsonb_typeof(result_payload -> 'impactLevel') <> 'string'
      or result_payload ->> 'impactLevel' not in ('blocking', 'important', 'minor')
      or jsonb_typeof(result_payload -> 'coveredCriterionCount') <> 'number'
      or (result_payload ->> 'coveredCriterionCount') !~ '^[0-9]+$'
      or (result_payload ->> 'coveredCriterionCount')::integer not between 0 and 12
      or jsonb_typeof(result_payload -> 'missingCriterionCount') <> 'number'
      or (result_payload ->> 'missingCriterionCount') !~ '^[0-9]+$'
      or (result_payload ->> 'missingCriterionCount')::integer not between 0 and 12
      or jsonb_typeof(result_payload -> 'sortOrder') <> 'number'
      or (result_payload ->> 'sortOrder') !~ '^[0-9]+$'
      or (result_payload ->> 'sortOrder')::integer not between 0 and 79 then
      raise exception 'invalid-jd-gap-requirements' using errcode = '22023';
    end if;
    begin
      candidate_requirement_id := (result_payload ->> 'requirementId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid-jd-gap-requirements' using errcode = '22023';
    end;
    if not exists (
      select 1 from public.jd_structure_requirements
      where id = candidate_requirement_id and run_id = owned_structure.id
        and application_id = owned_run.application_id and user_id = current_user_id
    ) then
      raise exception 'invalid-jd-gap-requirements' using errcode = '22023';
    end if;
    insert into public.jd_gap_v3_requirement_results (
      run_id, requirement_id, application_id, user_id, coverage_status,
      impact_level, covered_criterion_count, missing_criterion_count, sort_order
    ) values (
      owned_run.id, candidate_requirement_id, owned_run.application_id,
      current_user_id, result_payload ->> 'coverageStatus',
      result_payload ->> 'impactLevel',
      (result_payload ->> 'coveredCriterionCount')::integer,
      (result_payload ->> 'missingCriterionCount')::integer,
      (result_payload ->> 'sortOrder')::integer
    );
  end loop;

  for assessment_payload in select value from jsonb_array_elements(target_criterion_assessments)
  loop
    if not public.jd_gap_v3_json_has_exact_keys(
      assessment_payload,
      array['criterionId', 'requirementId', 'resumeEvidenceStatus', 'verifiedResumeExcerpt', 'profileFactIds', 'gapType', 'reasonZh', 'userQuestionZh']
    )
      or jsonb_typeof(assessment_payload -> 'criterionId') <> 'string'
      or assessment_payload ->> 'criterionId' !~ '^[0-9a-fA-F-]{36}$'
      or jsonb_typeof(assessment_payload -> 'requirementId') <> 'string'
      or assessment_payload ->> 'requirementId' !~ '^[0-9a-fA-F-]{36}$'
      or jsonb_typeof(assessment_payload -> 'resumeEvidenceStatus') <> 'string'
      or assessment_payload ->> 'resumeEvidenceStatus' not in ('direct', 'partial_direct', 'none', 'needs_confirmation')
      or jsonb_typeof(assessment_payload -> 'verifiedResumeExcerpt') not in ('string', 'null')
      or (
        assessment_payload ->> 'resumeEvidenceStatus' in ('direct', 'partial_direct')
        and (
          jsonb_typeof(assessment_payload -> 'verifiedResumeExcerpt') <> 'string'
          or char_length(btrim(assessment_payload ->> 'verifiedResumeExcerpt')) not between 1 and 1000
        )
      )
      or (
        assessment_payload ->> 'resumeEvidenceStatus' in ('none', 'needs_confirmation')
        and jsonb_typeof(assessment_payload -> 'verifiedResumeExcerpt') <> 'null'
      )
      or jsonb_typeof(assessment_payload -> 'profileFactIds') <> 'array'
      or jsonb_array_length(assessment_payload -> 'profileFactIds') > 5
      or jsonb_typeof(assessment_payload -> 'gapType') <> 'string'
      or assessment_payload ->> 'gapType' not in (
        'missing_from_resume', 'too_vague', 'missing_result_or_number',
        'no_supporting_fact', 'language_or_authorization_confirmation', 'none'
      )
      or jsonb_typeof(assessment_payload -> 'reasonZh') <> 'string'
      or char_length(btrim(assessment_payload ->> 'reasonZh')) not between 1 and 700
      or jsonb_typeof(assessment_payload -> 'userQuestionZh') not in ('string', 'null')
      or (jsonb_typeof(assessment_payload -> 'userQuestionZh') = 'string'
        and char_length(btrim(assessment_payload ->> 'userQuestionZh')) not between 1 and 500) then
      raise exception 'invalid-jd-gap-assessment' using errcode = '22023';
    end if;
    begin
      candidate_criterion_id := (assessment_payload ->> 'criterionId')::uuid;
      candidate_requirement_id := (assessment_payload ->> 'requirementId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid-jd-gap-assessment' using errcode = '22023';
    end;
    if not exists (
      select 1 from public.jd_structure_criteria
      where id = candidate_criterion_id and requirement_id = candidate_requirement_id
        and run_id = owned_structure.id and application_id = owned_run.application_id
        and user_id = current_user_id
    ) then
      raise exception 'invalid-jd-gap-criteria' using errcode = '22023';
    end if;

    candidate_fact_ids := '{}'::uuid[];
    for fact_payload in select value from jsonb_array_elements(assessment_payload -> 'profileFactIds')
    loop
      if jsonb_typeof(fact_payload) <> 'string'
        or trim(both '"' from fact_payload::text) !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'invalid-jd-gap-facts' using errcode = '22023';
      end if;
      begin
        candidate_fact_id := trim(both '"' from fact_payload::text)::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid-jd-gap-facts' using errcode = '22023';
      end;
      if not exists (
        select 1 from public.career_facts
        where id = candidate_fact_id and user_id = current_user_id
          and confirmation_status = 'confirmed' and confirmed_at is not null
      ) then
        raise exception 'invalid-jd-gap-facts' using errcode = '22023';
      end if;
      if candidate_fact_id = any(candidate_fact_ids) then
        raise exception 'invalid-jd-gap-facts' using errcode = '22023';
      end if;
      candidate_fact_ids := array_append(candidate_fact_ids, candidate_fact_id);
    end loop;

    insert into public.jd_gap_v3_criterion_assessments (
      run_id, criterion_id, requirement_id, application_id, user_id,
      resume_evidence_status, verified_resume_excerpt, profile_fact_ids,
      gap_type, reason_zh, user_question_zh
    ) values (
      owned_run.id, candidate_criterion_id, candidate_requirement_id,
      owned_run.application_id, current_user_id,
      assessment_payload ->> 'resumeEvidenceStatus',
      nullif(btrim(assessment_payload ->> 'verifiedResumeExcerpt'), ''),
      candidate_fact_ids, assessment_payload ->> 'gapType',
      btrim(assessment_payload ->> 'reasonZh'),
      nullif(btrim(assessment_payload ->> 'userQuestionZh'), '')
    );
  end loop;

  for requirement_row in
    select * from public.jd_structure_requirements
    where run_id = owned_structure.id and application_id = owned_run.application_id
      and user_id = current_user_id
    order by sort_order
  loop
    select * into stored_result from public.jd_gap_v3_requirement_results
    where run_id = owned_run.id and requirement_id = requirement_row.id
      and user_id = current_user_id;
    if stored_result.id is null then
      raise exception 'invalid-jd-gap-completeness' using errcode = '22023';
    end if;

    select count(*) filter (where a.resume_evidence_status = 'direct'),
      bool_or(a.resume_evidence_status in ('direct', 'partial_direct')),
      bool_or(a.resume_evidence_status = 'needs_confirmation')
    into direct_count, has_resume_evidence, has_confirmation
    from public.jd_structure_criteria c
    join public.jd_gap_v3_criterion_assessments a
      on a.criterion_id = c.id and a.run_id = owned_run.id
    where c.requirement_id = requirement_row.id and c.run_id = owned_structure.id;

    select count(*), count(*) filter (where group_complete)
    into group_count, complete_group_count
    from (
      select c.group_key,
        case when min(c.group_rule) = 'all'
          then bool_and(a.resume_evidence_status = 'direct')
          else bool_or(a.resume_evidence_status = 'direct')
        end as group_complete
      from public.jd_structure_criteria c
      join public.jd_gap_v3_criterion_assessments a
        on a.criterion_id = c.id and a.run_id = owned_run.id
      where c.requirement_id = requirement_row.id and c.run_id = owned_structure.id
      group by c.group_key
    ) grouped;

    expected_coverage := case
      when group_count > 0 and group_count = complete_group_count then 'complete'
      when coalesce(has_resume_evidence, false) then 'partial'
      when coalesce(has_confirmation, false) then 'needs_confirmation'
      else 'none'
    end;
    expected_impact := case
      when requirement_row.requirement_type = 'preferred' then 'minor'
      when requirement_row.explicit_gate then 'blocking'
      else 'important'
    end;
    if stored_result.coverage_status <> expected_coverage
      or stored_result.impact_level <> expected_impact
      or stored_result.covered_criterion_count <> direct_count
      or stored_result.missing_criterion_count <> (
        select count(*) from public.jd_structure_criteria
        where requirement_id = requirement_row.id and run_id = owned_structure.id
      ) - direct_count then
      raise exception 'invalid-jd-gap-aggregation' using errcode = '22023';
    end if;
  end loop;

  select count(*) filter (where coverage_status = 'complete'),
    count(*) filter (where coverage_status = 'partial'),
    count(*) filter (where coverage_status = 'none'),
    count(*) filter (where coverage_status = 'needs_confirmation')
  into complete_count, partial_count, none_count, confirmation_count
  from public.jd_gap_v3_requirement_results
  where run_id = owned_run.id and user_id = current_user_id;

  safe_ai := jsonb_build_object(
    'provider', owned_run.provider,
    'model', owned_run.model,
    'requestId', target_ai_metadata -> 'requestId',
    'usage', jsonb_build_object(
      'inputCacheHitTokens', (target_ai_metadata -> 'usage' ->> 'inputCacheHitTokens')::integer,
      'inputCacheMissTokens', (target_ai_metadata -> 'usage' ->> 'inputCacheMissTokens')::integer,
      'outputTokens', (target_ai_metadata -> 'usage' ->> 'outputTokens')::integer
    ),
    'priceScheduleVersion', target_ai_metadata -> 'priceScheduleVersion'
  );
  safe_cost := case when target_estimated_cost is null then null else jsonb_build_object(
    'amount', (target_estimated_cost ->> 'amount')::numeric,
    'currency', 'USD',
    'scheduleVersion', target_estimated_cost ->> 'scheduleVersion',
    'tier', target_estimated_cost ->> 'tier'
  ) end;

  update public.jd_gap_v3_runs
  set status = 'succeeded', result = jsonb_build_object(
        'requirementCount', expected_requirement_count,
        'criterionCount', expected_criterion_count,
        'completeCount', complete_count,
        'partialCount', partial_count,
        'noneCount', none_count,
        'needsConfirmationCount', confirmation_count,
        'ai', safe_ai,
        'estimatedCost', safe_cost
      ), error_code = null, error_message = null,
      finished_at = now(), updated_at = now()
  where id = owned_run.id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into completed_run;
  if completed_run.id is null then
    raise exception 'jd-gap-not-running' using errcode = 'P0002';
  end if;
  return completed_run;
exception
  when unique_violation then
    raise exception 'invalid-jd-gap-completeness' using errcode = '22023';
end;
$$;

create function public.fail_jd_gap_v3(
  target_run_id uuid,
  target_attempt_count integer,
  target_error_code text,
  target_error_message text
)
returns public.jd_gap_v3_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.jd_gap_v3_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_error_message is not null then null; end if;
  if target_attempt_count is null or target_attempt_count < 1
    or target_error_code not in (
      'resume-text-too-short', 'resume-text-too-long',
      'unsupported-content-type', 'source-download-failed',
      'jd-gap-invalid-output', 'ai-provider-authentication-failed',
      'ai-provider-rate-limited', 'ai-provider-request-failed',
      'ai-provider-timeout', 'jd-gap-failed'
    ) then
    raise exception 'invalid-jd-gap-error' using errcode = '22023';
  end if;
  update public.jd_gap_v3_runs
  set status = 'failed', result = null,
      error_code = btrim(target_error_code),
      error_message = 'JD gap analysis failed.',
      finished_at = now(), updated_at = now()
  where id = target_run_id and user_id = current_user_id
    and status = 'running' and attempt_count = target_attempt_count
  returning * into failed_run;
  if failed_run.id is null then
    raise exception 'jd-gap-not-running' using errcode = 'P0002';
  end if;
  return failed_run;
end;
$$;

revoke all on function public.jd_gap_v3_json_has_exact_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.jd_gap_v3_valid_ai_metadata(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.jd_gap_v3_valid_estimated_cost(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_or_get_jd_structure(uuid, text, text, text, text, text, text) from public;
revoke all on function public.claim_jd_structure(uuid, integer, text, integer) from public;
revoke all on function public.complete_jd_structure(uuid, integer, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.fail_jd_structure(uuid, integer, text, text) from public;
revoke all on function public.create_or_get_jd_gap_v3(uuid, uuid, uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.claim_jd_gap_v3(uuid, integer, text, integer) from public;
revoke all on function public.complete_jd_gap_v3(uuid, integer, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.fail_jd_gap_v3(uuid, integer, text, text) from public;

grant execute on function public.create_or_get_jd_structure(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.claim_jd_structure(uuid, integer, text, integer) to authenticated;
grant execute on function public.complete_jd_structure(uuid, integer, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.fail_jd_structure(uuid, integer, text, text) to authenticated;
grant execute on function public.create_or_get_jd_gap_v3(uuid, uuid, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.claim_jd_gap_v3(uuid, integer, text, integer) to authenticated;
grant execute on function public.complete_jd_gap_v3(uuid, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.fail_jd_gap_v3(uuid, integer, text, text) to authenticated;
