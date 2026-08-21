alter table public.application_interview_questions
  add column source_excerpt text;

alter table public.application_interview_questions
  add constraint application_interview_questions_source_excerpt_check
  check (
    source_excerpt is null
    or char_length(btrim(source_excerpt)) between 1 and 240
  );

create table public.interview_question_generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  input_hash text not null check (char_length(input_hash) = 64),
  schema_version text not null
    check (char_length(btrim(schema_version)) between 1 and 80),
  provider text not null
    check (char_length(btrim(provider)) between 1 and 80),
  model text not null
    check (char_length(btrim(model)) between 1 and 160),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  result jsonb,
  error_code text check (
    error_code is null or char_length(btrim(error_code)) between 1 and 120
  ),
  error_message text check (
    error_message is null or char_length(btrim(error_message)) between 1 and 500
  ),
  request_id text check (
    request_id is null or char_length(btrim(request_id)) between 1 and 200
  ),
  input_cache_hit_tokens integer not null default 0
    check (input_cache_hit_tokens >= 0),
  input_cache_miss_tokens integer not null default 0
    check (input_cache_miss_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, application_id, input_hash, provider, model)
);

create table public.interview_question_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.interview_question_generation_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null check (sort_order between 1 and 6),
  category text not null check (
    category in ('function', 'industry', 'job_specific')
  ),
  prompt text not null
    check (char_length(btrim(prompt)) between 8 and 500),
  canonical_key text not null
    check (char_length(btrim(canonical_key)) between 1 and 500),
  source_excerpt text not null
    check (char_length(btrim(source_excerpt)) between 1 and 240),
  relevance_reason text not null
    check (char_length(btrim(relevance_reason)) between 1 and 700),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  question_id uuid references public.interview_questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, sort_order)
);

create index interview_question_generation_runs_application_created_idx
  on public.interview_question_generation_runs(application_id, created_at desc);
create index interview_question_generation_runs_user_created_idx
  on public.interview_question_generation_runs(user_id, created_at desc);
create index interview_question_candidates_run_order_idx
  on public.interview_question_candidates(run_id, sort_order);
create index interview_question_candidates_application_status_idx
  on public.interview_question_candidates(application_id, status, created_at desc);
create index interview_question_candidates_user_idx
  on public.interview_question_candidates(user_id, created_at desc);

alter table public.interview_question_generation_runs enable row level security;
alter table public.interview_question_candidates enable row level security;

create policy interview_question_generation_runs_owner_select
on public.interview_question_generation_runs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy interview_question_candidates_owner_select
on public.interview_question_candidates
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.interview_question_generation_runs from anon, authenticated;
revoke all on public.interview_question_candidates from anon, authenticated;
grant select on public.interview_question_generation_runs to authenticated;
grant select on public.interview_question_candidates to authenticated;

create function public.normalize_interview_question_generation_text(target_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      btrim(normalize(coalesce(target_text, ''), NFKC)),
      '[[:space:]]+', ' ', 'g'
    )
  );
$$;

create function public.create_or_get_interview_question_generation(
  target_application_id uuid,
  target_input_hash text,
  target_schema_version text,
  target_provider text,
  target_model text
)
returns public.interview_question_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.interview_question_generation_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_application_id is null
    or target_input_hash is null
    or target_input_hash !~ '^[0-9a-f]{64}$'
    or target_schema_version is null
    or char_length(btrim(target_schema_version)) not between 1 and 80
    or target_provider is null
    or char_length(btrim(target_provider)) not between 1 and 80
    or target_model is null
    or char_length(btrim(target_model)) not between 1 and 160 then
    raise exception 'invalid-interview-question-generation-input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.applications
    where id = target_application_id and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  insert into public.interview_question_generation_runs (
    user_id, application_id, input_hash, schema_version, provider, model
  ) values (
    current_user_id, target_application_id, target_input_hash,
    btrim(target_schema_version), btrim(target_provider), btrim(target_model)
  )
  on conflict (user_id, application_id, input_hash, provider, model) do nothing;

  select * into owned_run
  from public.interview_question_generation_runs
  where user_id = current_user_id
    and application_id = target_application_id
    and input_hash = target_input_hash
    and provider = btrim(target_provider)
    and model = btrim(target_model);

  if owned_run.id is null then
    raise exception 'interview-question-generation-conflict' using errcode = '23505';
  end if;

  if owned_run.schema_version <> btrim(target_schema_version) then
    raise exception 'interview-question-generation-conflict' using errcode = '23505';
  end if;

  return owned_run;
end;
$$;

create function public.claim_interview_question_generation(target_run_id uuid)
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
  if target_run_id is null then
    raise exception 'invalid-interview-question-generation-input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.interview_question_generation_runs
    where id = target_run_id and user_id = current_user_id
  ) then
    raise exception 'interview-question-generation-not-found' using errcode = 'P0002';
  end if;

  update public.interview_question_generation_runs
  set status = 'running',
      attempt_count = attempt_count + 1,
      result = null,
      error_code = null,
      error_message = null,
      request_id = null,
      input_cache_hit_tokens = 0,
      input_cache_miss_tokens = 0,
      output_tokens = 0,
      estimated_cost = null,
      updated_at = now(),
      completed_at = null
  where id = target_run_id
    and user_id = current_user_id
    and status in ('queued', 'failed');

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_interview_question_generation(
  target_run_id uuid,
  target_candidates jsonb,
  target_rejected_candidate_count integer,
  target_ai_usage jsonb,
  target_estimated_cost jsonb,
  target_request_id text
)
returns public.interview_question_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.interview_question_generation_runs%rowtype;
  completed_run public.interview_question_generation_runs%rowtype;
  candidate jsonb;
  candidate_category text;
  candidate_prompt text;
  candidate_excerpt text;
  candidate_reason text;
  candidate_canonical text;
  candidate_index integer := 0;
  candidate_canonicals text[] := '{}';
  jd_folded text;
  input_cache_hit integer := 0;
  input_cache_miss integer := 0;
  output_token_count integer := 0;
  safe_ai_usage jsonb;
  safe_estimated_cost jsonb;
  safe_request_id text;
  usage_payload jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_run_id is null
    or target_candidates is null
    or target_rejected_candidate_count is null
    or target_rejected_candidate_count < 0
    or (
      target_request_id is not null
      and char_length(btrim(target_request_id)) not between 1 and 200
    )
    or (
      target_request_id is not null
      and btrim(target_request_id) !~ '^[A-Za-z0-9._:-]{1,200}$'
    ) then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;
  if jsonb_typeof(target_candidates) <> 'array' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;
  if jsonb_array_length(target_candidates) > 6 then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;

  select * into owned_run
  from public.interview_question_generation_runs
  where id = target_run_id
    and user_id = current_user_id
    and status = 'running'
  for update;

  if owned_run.id is null then
    raise exception 'interview-question-generation-not-running'
      using errcode = 'P0002';
  end if;

  if target_ai_usage is null
    or jsonb_typeof(target_ai_usage) <> 'object' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;

  if not target_ai_usage ? 'usage'
    or (select count(*) from jsonb_object_keys(target_ai_usage)) <> 1 then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;

  usage_payload := target_ai_usage -> 'usage';
  if jsonb_typeof(usage_payload) <> 'object' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(usage_payload)) <> 3
    or exists (
      select 1 from jsonb_object_keys(usage_payload) as keys(key)
      where key not in (
        'inputCacheHitTokens', 'inputCacheMissTokens', 'outputTokens'
      )
    )
    or not usage_payload ? 'inputCacheHitTokens'
    or not usage_payload ? 'inputCacheMissTokens'
    or not usage_payload ? 'outputTokens' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;

  if jsonb_typeof(usage_payload -> 'inputCacheHitTokens') <> 'number'
    or jsonb_typeof(usage_payload -> 'inputCacheMissTokens') <> 'number'
    or jsonb_typeof(usage_payload -> 'outputTokens') <> 'number' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;
  if (usage_payload ->> 'inputCacheHitTokens') !~ '^[0-9]+$'
    or (usage_payload ->> 'inputCacheMissTokens') !~ '^[0-9]+$'
    or (usage_payload ->> 'outputTokens') !~ '^[0-9]+$' then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;
  if (usage_payload ->> 'inputCacheHitTokens')::numeric not between 0 and 2147483647
    or (usage_payload ->> 'inputCacheMissTokens')::numeric not between 0 and 2147483647
    or (usage_payload ->> 'outputTokens')::numeric not between 0 and 2147483647 then
    raise exception 'invalid-interview-question-generation-result'
      using errcode = '22023';
  end if;

  if target_estimated_cost is not null then
    if jsonb_typeof(target_estimated_cost) <> 'object' then
      raise exception 'invalid-interview-question-generation-result'
        using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(target_estimated_cost)) <> 4
      or exists (
        select 1 from jsonb_object_keys(target_estimated_cost) as keys(key)
        where key not in ('amount', 'currency', 'scheduleVersion', 'tier')
      )
      or not target_estimated_cost ? 'amount'
      or not target_estimated_cost ? 'currency'
      or not target_estimated_cost ? 'scheduleVersion'
      or not target_estimated_cost ? 'tier' then
      raise exception 'invalid-interview-question-generation-result'
        using errcode = '22023';
    end if;
    if jsonb_typeof(target_estimated_cost -> 'amount') <> 'number'
      or jsonb_typeof(target_estimated_cost -> 'currency') <> 'string'
      or target_estimated_cost ->> 'currency' <> 'USD'
      or jsonb_typeof(target_estimated_cost -> 'scheduleVersion') <> 'string'
      or char_length(btrim(target_estimated_cost ->> 'scheduleVersion')) not between 1 and 80
      or btrim(target_estimated_cost ->> 'scheduleVersion') !~ '^[A-Za-z0-9._:-]{1,80}$'
      or jsonb_typeof(target_estimated_cost -> 'tier') <> 'string'
      or target_estimated_cost ->> 'tier' not in ('default', 'peak') then
      raise exception 'invalid-interview-question-generation-result'
        using errcode = '22023';
    end if;
    if (target_estimated_cost ->> 'amount') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'invalid-interview-question-generation-result'
        using errcode = '22023';
    end if;
    if (target_estimated_cost ->> 'amount')::numeric not between 0 and 1000000000 then
      raise exception 'invalid-interview-question-generation-result'
        using errcode = '22023';
    end if;
    safe_estimated_cost := jsonb_build_object(
      'amount', (target_estimated_cost ->> 'amount')::numeric,
      'currency', 'USD',
      'scheduleVersion', btrim(target_estimated_cost ->> 'scheduleVersion'),
      'tier', target_estimated_cost ->> 'tier'
    );
  else
    safe_estimated_cost := null;
  end if;

  safe_request_id := nullif(btrim(target_request_id), '');
  input_cache_hit := (target_ai_usage -> 'usage' ->> 'inputCacheHitTokens')::integer;
  input_cache_miss := (target_ai_usage -> 'usage' ->> 'inputCacheMissTokens')::integer;
  output_token_count := (target_ai_usage -> 'usage' ->> 'outputTokens')::integer;
  safe_ai_usage := jsonb_build_object(
    'provider', owned_run.provider,
    'model', owned_run.model,
    'requestId', safe_request_id,
    'usage', jsonb_build_object(
      'inputCacheHitTokens', input_cache_hit,
      'inputCacheMissTokens', input_cache_miss,
      'outputTokens', output_token_count
    ),
    'priceScheduleVersion', case
      when safe_estimated_cost is null then null
      else safe_estimated_cost ->> 'scheduleVersion'
    end
  );

  select public.normalize_interview_question_generation_text(jd_text)
  into jd_folded
  from public.applications
  where id = owned_run.application_id
    and user_id = current_user_id;

  if jd_folded is null then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  for candidate in select value from jsonb_array_elements(target_candidates)
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'invalid-interview-question-generation-candidate'
        using errcode = '22023';
    end if;
    if not candidate ? 'category'
      or not candidate ? 'prompt'
      or not candidate ? 'sourceExcerpt'
      or not candidate ? 'relevanceReason'
      or candidate -> 'category' is null
      or candidate -> 'prompt' is null
      or candidate -> 'sourceExcerpt' is null
      or candidate -> 'relevanceReason' is null
      or jsonb_typeof(candidate -> 'category') <> 'string'
      or jsonb_typeof(candidate -> 'prompt') <> 'string'
      or jsonb_typeof(candidate -> 'sourceExcerpt') <> 'string'
      or jsonb_typeof(candidate -> 'relevanceReason') <> 'string'
      or exists (
        select 1 from jsonb_object_keys(candidate) as keys(key)
        where key not in ('category', 'prompt', 'sourceExcerpt', 'relevanceReason')
      ) then
      raise exception 'invalid-interview-question-generation-candidate'
        using errcode = '22023';
    end if;

    candidate_category := btrim(candidate ->> 'category');
    candidate_prompt := btrim(candidate ->> 'prompt');
    candidate_excerpt := btrim(candidate ->> 'sourceExcerpt');
    candidate_reason := btrim(candidate ->> 'relevanceReason');

    if candidate_category is null
      or candidate_prompt is null
      or candidate_excerpt is null
      or candidate_reason is null
      or candidate_category not in ('function', 'industry', 'job_specific')
      or char_length(candidate_prompt) not between 8 and 500
      or char_length(candidate_excerpt) not between 1 and 240
      or char_length(candidate_reason) not between 1 and 700
      or strpos(
        jd_folded,
        public.normalize_interview_question_generation_text(candidate_excerpt)
      ) = 0 then
      raise exception 'invalid-interview-question-generation-candidate'
        using errcode = '22023';
    end if;

    candidate_canonical := public.normalize_interview_question_prompt(candidate_prompt);
    if candidate_canonical is null
      or char_length(btrim(candidate_canonical)) not between 1 and 500
      or candidate_canonical = any(candidate_canonicals) then
      raise exception 'invalid-interview-question-generation-candidate'
        using errcode = '22023';
    end if;
    candidate_canonicals := array_append(candidate_canonicals, candidate_canonical);
    candidate_index := candidate_index + 1;
  end loop;

  candidate_index := 0;
  for candidate in select value from jsonb_array_elements(target_candidates)
  loop
    candidate_index := candidate_index + 1;
    candidate_category := btrim(candidate ->> 'category');
    candidate_prompt := btrim(candidate ->> 'prompt');
    candidate_excerpt := btrim(candidate ->> 'sourceExcerpt');
    candidate_reason := btrim(candidate ->> 'relevanceReason');

    insert into public.interview_question_candidates (
      run_id, application_id, user_id, sort_order, category, prompt,
      canonical_key, source_excerpt, relevance_reason
    ) values (
      owned_run.id, owned_run.application_id, current_user_id, candidate_index,
      candidate_category, candidate_prompt,
      public.normalize_interview_question_prompt(candidate_prompt),
      candidate_excerpt, candidate_reason
    );
  end loop;

  update public.interview_question_generation_runs
  set status = 'succeeded',
      result = jsonb_build_object(
        'acceptedCandidateCount', 0,
        'rejectedCandidateCount', target_rejected_candidate_count,
        'pendingCandidateCount', jsonb_array_length(target_candidates),
        'ai', safe_ai_usage,
        'estimatedCost', safe_estimated_cost
      ),
      error_code = null,
      error_message = null,
      request_id = safe_request_id,
      input_cache_hit_tokens = input_cache_hit,
      input_cache_miss_tokens = input_cache_miss,
      output_tokens = output_token_count,
      estimated_cost = safe_estimated_cost,
      updated_at = now(),
      completed_at = now()
  where id = owned_run.id and user_id = current_user_id
  returning * into completed_run;

  return completed_run;
end;
$$;

create function public.fail_interview_question_generation(
  target_run_id uuid,
  target_error_code text,
  target_error_message text,
  target_request_id text
)
returns public.interview_question_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.interview_question_generation_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_run_id is null
    or target_error_code is null
    or target_error_code not in (
      'interview-question-generation-unavailable',
      'interview-question-generation-invalid-output',
      'interview-question-generation-provider-error'
    )
    or (
      target_request_id is not null
      and char_length(btrim(target_request_id)) not between 1 and 200
    )
    or (
      target_request_id is not null
      and btrim(target_request_id) !~ '^[A-Za-z0-9._:-]{1,200}$'
    ) then
    raise exception 'invalid-interview-question-generation-error'
      using errcode = '22023';
  end if;

  select * into failed_run
  from public.interview_question_generation_runs
  where id = target_run_id and user_id = current_user_id and status = 'running'
  for update;

  if failed_run.id is null then
    raise exception 'interview-question-generation-not-running'
      using errcode = 'P0002';
  end if;

  update public.interview_question_generation_runs
  set status = 'failed',
      result = null,
      error_code = btrim(target_error_code),
      error_message = '岗位面试题生成失败，请稍后重试。',
      request_id = nullif(btrim(target_request_id), ''),
      updated_at = now(),
      completed_at = now()
  where id = failed_run.id and user_id = current_user_id
  returning * into failed_run;

  return failed_run;
end;
$$;

create function public.accept_interview_question_candidates(
  target_application_id uuid,
  target_candidate_ids uuid[]
)
returns table(candidate_id uuid, disposition text, question_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  candidate_count integer;
  run_key record;
  locked_run public.interview_question_generation_runs%rowtype;
  candidate public.interview_question_candidates%rowtype;
  existing_question public.interview_questions%rowtype;
  created_question public.interview_questions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_application_id is null
    or target_candidate_ids is null
    or cardinality(target_candidate_ids) not between 1 and 6
    or exists (
      select 1
      from unnest(target_candidate_ids) as requested(id)
      group by requested.id having count(*) > 1
    ) then
    raise exception 'invalid-interview-question-candidate-selection'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.applications
    where id = target_application_id and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  select count(*) into candidate_count
  from public.interview_question_candidates
  where id = any(target_candidate_ids)
    and application_id = target_application_id
    and user_id = current_user_id
    and status = 'pending';
  if candidate_count <> cardinality(target_candidate_ids) then
    raise exception 'invalid-interview-question-candidate-selection'
      using errcode = '22023';
  end if;

  -- Lock all owning runs in UUID order before candidate rows.
  for run_key in
    select run_id
    from public.interview_question_candidates
    where id = any(target_candidate_ids)
      and application_id = target_application_id
      and user_id = current_user_id
    group by run_id
    order by run_id
  loop
    select * into locked_run
    from public.interview_question_generation_runs
    where id = run_key.run_id and user_id = current_user_id
    for update;
    if locked_run.id is null then
      raise exception 'interview-question-generation-not-found' using errcode = 'P0002';
    end if;
  end loop;

  -- Candidate locks are always acquired in UUID order.
  -- Process canonical keys in the same order as the pre-lock pass. Candidate
  -- rows are already locked in UUID order above, so this order prevents two
  -- multi-canonical accept calls from taking question locks in opposite order.
  for candidate in
    select *
    from public.interview_question_candidates
    where id = any(target_candidate_ids)
      and application_id = target_application_id
      and user_id = current_user_id
      and status = 'pending'
    order by id
    for update
  loop
    null;
  end loop;

  -- Existing canonical rows are locked in canonical-key order.
  for run_key in
    select distinct canonical_key
    from public.interview_question_candidates
    where id = any(target_candidate_ids)
      and application_id = target_application_id
      and user_id = current_user_id
      and status = 'pending'
    order by canonical_key
  loop
    perform 1
    from public.interview_questions
    where user_id = current_user_id and canonical_key = run_key.canonical_key
    for update;
  end loop;

  for candidate in
    select *
    from public.interview_question_candidates
    where id = any(target_candidate_ids)
      and application_id = target_application_id
      and user_id = current_user_id
      and status = 'pending'
    order by canonical_key, id
  loop
    existing_question := null;
    created_question := null;
    select * into existing_question
    from public.interview_questions
    where user_id = current_user_id
      and canonical_key = candidate.canonical_key
    for update;

    if existing_question.id is null then
      insert into public.interview_questions (
        user_id, category, canonical_key, prompt, source
      ) values (
        current_user_id, candidate.category, candidate.canonical_key,
        candidate.prompt, 'ai'
      )
      on conflict (user_id, canonical_key) do nothing
      returning * into created_question;

      if created_question.id is null then
        select * into existing_question
        from public.interview_questions
        where user_id = current_user_id
          and canonical_key = candidate.canonical_key
        for update;
      else
        existing_question := created_question;
      end if;
    end if;

    -- Re-check the final row after the insert/fallback. A concurrent common
    -- question must never be treated as a generated one, and a concurrent
    -- non-common winner is a reuse rather than a new question.
    if existing_question.id is null then
      raise exception 'interview-question-not-found' using errcode = 'P0002';
    end if;
    if existing_question.category = 'common' then
      update public.interview_question_candidates
      set status = 'rejected', updated_at = now()
      where id = candidate.id;
      update public.interview_question_generation_runs run
      set result = jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(run.result, '{}'::jsonb), '{acceptedCandidateCount}',
            to_jsonb((select count(*) from public.interview_question_candidates c
              where c.run_id = run.id and c.status = 'accepted')), true),
          '{rejectedCandidateCount}',
          to_jsonb(coalesce((run.result->>'rejectedCandidateCount')::integer, 0) + 1), true),
        '{pendingCandidateCount}',
        to_jsonb((select count(*) from public.interview_question_candidates c
          where c.run_id = run.id and c.status = 'pending')), true),
        updated_at = now()
      where run.id = candidate.run_id and run.user_id = current_user_id;
      candidate_id := candidate.id;
      disposition := 'duplicate-common';
      question_id := null;
      return next;
      continue;
    end if;

    if created_question.id is not null then
      disposition := 'new';
    else
      disposition := 'reused';
    end if;

    if existing_question.prompt <> candidate.prompt then
      insert into public.interview_question_variants (
        question_id, user_id, wording
      ) values (
        existing_question.id, current_user_id, candidate.prompt
      ) on conflict on constraint interview_question_variants_question_id_wording_key do nothing;
    end if;

    insert into public.application_interview_questions (
      application_id, question_id, user_id, predicted,
      relevance_reason, source_excerpt
    ) values (
      target_application_id, existing_question.id, current_user_id, true,
      candidate.relevance_reason, candidate.source_excerpt
    )
    on conflict on constraint application_interview_questions_pkey do update
    set predicted = public.application_interview_questions.predicted,
        relevance_reason = coalesce(
          public.application_interview_questions.relevance_reason,
          excluded.relevance_reason
        ),
        source_excerpt = coalesce(
          public.application_interview_questions.source_excerpt,
          excluded.source_excerpt
        );

    update public.interview_question_candidates
    set status = 'accepted', question_id = existing_question.id, updated_at = now()
    where id = candidate.id;
    update public.interview_question_generation_runs run
    set result = jsonb_set(
      jsonb_set(coalesce(run.result, '{}'::jsonb), '{acceptedCandidateCount}',
        to_jsonb((select count(*) from public.interview_question_candidates c
          where c.run_id = run.id and c.status = 'accepted')), true),
      '{pendingCandidateCount}',
      to_jsonb((select count(*) from public.interview_question_candidates c
        where c.run_id = run.id and c.status = 'pending')), true),
      updated_at = now()
    where run.id = candidate.run_id and run.user_id = current_user_id;
    candidate_id := candidate.id;
    question_id := existing_question.id;
    return next;
  end loop;

end;
$$;

create function public.reject_interview_question_candidates(
  target_run_id uuid,
  target_candidate_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_count integer;
  rejected_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_run_id is null
    or target_candidate_ids is null
    or cardinality(target_candidate_ids) not between 1 and 6
    or exists (
      select 1 from unnest(target_candidate_ids) as requested(id)
      group by requested.id having count(*) > 1
    ) then
    raise exception 'invalid-interview-question-candidate-selection'
      using errcode = '22023';
  end if;

  perform 1
  from public.interview_question_generation_runs
  where id = target_run_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'interview-question-generation-not-found' using errcode = 'P0002';
  end if;

  select count(*) into selected_count
  from public.interview_question_candidates
  where id = any(target_candidate_ids)
    and run_id = target_run_id
    and user_id = current_user_id
    and status = 'pending';
  if selected_count <> cardinality(target_candidate_ids) then
    raise exception 'invalid-interview-question-candidate-selection'
      using errcode = '22023';
  end if;

  update public.interview_question_candidates
  set status = 'rejected', updated_at = now()
  where id = any(target_candidate_ids)
    and run_id = target_run_id
    and user_id = current_user_id
    and status = 'pending';
  get diagnostics rejected_count = row_count;

  update public.interview_question_generation_runs run
  set result = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(run.result, '{}'::jsonb), '{acceptedCandidateCount}',
        to_jsonb((select count(*) from public.interview_question_candidates c
          where c.run_id = run.id and c.status = 'accepted')), true),
      '{rejectedCandidateCount}',
      to_jsonb(coalesce((run.result->>'rejectedCandidateCount')::integer, 0)
        + rejected_count), true),
    '{pendingCandidateCount}',
    to_jsonb((select count(*) from public.interview_question_candidates c
      where c.run_id = run.id and c.status = 'pending')), true),
    updated_at = now()
  where run.id = target_run_id and run.user_id = current_user_id;

  return rejected_count;
end;
$$;

revoke all on function public.normalize_interview_question_generation_text(text) from public;
revoke all on function public.create_or_get_interview_question_generation(uuid, text, text, text, text) from public;
revoke all on function public.claim_interview_question_generation(uuid) from public;
revoke all on function public.complete_interview_question_generation(uuid, jsonb, integer, jsonb, jsonb, text) from public;
revoke all on function public.fail_interview_question_generation(uuid, text, text, text) from public;
revoke all on function public.accept_interview_question_candidates(uuid, uuid[]) from public;
revoke all on function public.reject_interview_question_candidates(uuid, uuid[]) from public;

grant execute on function public.create_or_get_interview_question_generation(uuid, text, text, text, text) to authenticated;
grant execute on function public.claim_interview_question_generation(uuid) to authenticated;
grant execute on function public.complete_interview_question_generation(uuid, jsonb, integer, jsonb, jsonb, text) to authenticated;
grant execute on function public.fail_interview_question_generation(uuid, text, text, text) to authenticated;
grant execute on function public.accept_interview_question_candidates(uuid, uuid[]) to authenticated;
grant execute on function public.reject_interview_question_candidates(uuid, uuid[]) to authenticated;
