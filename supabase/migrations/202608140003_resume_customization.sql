create table public.resume_generation_runs (
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

create table public.resume_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.resume_generation_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in (
    'summary',
    'experience',
    'project',
    'education',
    'skills',
    'certification',
    'language',
    'achievement'
  )),
  content text not null
    check (char_length(btrim(content)) between 1 and 700),
  reason text not null
    check (char_length(btrim(reason)) between 1 and 500),
  decision text not null default 'pending'
    check (decision in ('pending', 'accepted', 'rejected')),
  reviewed_content text check (
    reviewed_content is null
    or char_length(btrim(reviewed_content)) between 1 and 700
  ),
  sort_order integer not null check (sort_order between 0 and 39),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (run_id, sort_order),
  check (decision = 'accepted' or reviewed_content is null)
);

create table public.resume_suggestion_facts (
  suggestion_id uuid not null
    references public.resume_suggestions(id) on delete cascade,
  career_fact_id uuid not null
    references public.career_facts(id) on delete restrict,
  run_id uuid not null
    references public.resume_generation_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, career_fact_id)
);

create table public.resume_suggestion_requirements (
  suggestion_id uuid not null
    references public.resume_suggestions(id) on delete cascade,
  requirement_id uuid not null
    references public.application_requirements(id) on delete cascade,
  run_id uuid not null
    references public.resume_generation_runs(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, requirement_id)
);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_run_id uuid not null
    references public.resume_generation_runs(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  template text not null default 'simple'
    check (template in ('simple', 'modern')),
  created_at timestamptz not null default now(),
  unique (application_id, version_number)
);

create table public.resume_version_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null
    references public.resume_versions(id) on delete cascade,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in (
    'summary',
    'experience',
    'project',
    'education',
    'skills',
    'certification',
    'language',
    'achievement'
  )),
  content text not null
    check (char_length(btrim(content)) between 1 and 700),
  reason text not null
    check (char_length(btrim(reason)) between 1 and 500),
  sort_order integer not null check (sort_order between 0 and 39),
  created_at timestamptz not null default now(),
  unique (version_id, sort_order)
);

create table public.resume_version_item_evidence (
  item_id uuid not null
    references public.resume_version_items(id) on delete cascade,
  career_fact_id uuid
    references public.career_facts(id) on delete set null,
  application_id uuid not null
    references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fact_snapshot jsonb not null
    check (jsonb_typeof(fact_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (item_id, fact_snapshot)
);

create index resume_generation_runs_application_created_idx
  on public.resume_generation_runs(application_id, created_at desc);
create index resume_suggestions_run_order_idx
  on public.resume_suggestions(run_id, sort_order);
create index resume_suggestion_facts_fact_idx
  on public.resume_suggestion_facts(career_fact_id);
create index resume_suggestion_requirements_requirement_idx
  on public.resume_suggestion_requirements(requirement_id);
create index resume_versions_application_number_idx
  on public.resume_versions(application_id, version_number desc);
create index resume_version_items_version_order_idx
  on public.resume_version_items(version_id, sort_order);
create index resume_version_item_evidence_fact_idx
  on public.resume_version_item_evidence(career_fact_id);

alter table public.resume_generation_runs enable row level security;
alter table public.resume_suggestions enable row level security;
alter table public.resume_suggestion_facts enable row level security;
alter table public.resume_suggestion_requirements enable row level security;
alter table public.resume_versions enable row level security;
alter table public.resume_version_items enable row level security;
alter table public.resume_version_item_evidence enable row level security;

create policy resume_generation_runs_owner_select
on public.resume_generation_runs for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_suggestions_owner_select
on public.resume_suggestions for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_suggestion_facts_owner_select
on public.resume_suggestion_facts for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_suggestion_requirements_owner_select
on public.resume_suggestion_requirements for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_versions_owner_select
on public.resume_versions for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_version_items_owner_select
on public.resume_version_items for select to authenticated
using ((select auth.uid()) = user_id);
create policy resume_version_item_evidence_owner_select
on public.resume_version_item_evidence for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.resume_generation_runs from anon, authenticated;
revoke all on public.resume_suggestions from anon, authenticated;
revoke all on public.resume_suggestion_facts from anon, authenticated;
revoke all on public.resume_suggestion_requirements from anon, authenticated;
revoke all on public.resume_versions from anon, authenticated;
revoke all on public.resume_version_items from anon, authenticated;
revoke all on public.resume_version_item_evidence from anon, authenticated;
grant select on public.resume_generation_runs to authenticated;
grant select on public.resume_suggestions to authenticated;
grant select on public.resume_suggestion_facts to authenticated;
grant select on public.resume_suggestion_requirements to authenticated;
grant select on public.resume_versions to authenticated;
grant select on public.resume_version_items to authenticated;
grant select on public.resume_version_item_evidence to authenticated;

create function public.create_or_get_resume_generation(
  target_application_id uuid,
  target_input_hash text,
  target_provider text,
  target_model text
)
returns public.resume_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.resume_generation_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_input_hash !~ '^[0-9a-f]{64}$'
    or char_length(btrim(target_provider)) not between 1 and 80
    or char_length(btrim(target_model)) not between 1 and 160 then
    raise exception 'invalid-resume-generation-input' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.applications
    where id = target_application_id and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  insert into public.resume_generation_runs (
    application_id, user_id, input_hash, provider, model
  ) values (
    target_application_id, current_user_id, target_input_hash,
    btrim(target_provider), btrim(target_model)
  )
  on conflict (user_id, application_id, input_hash) do nothing;

  select * into owned_run
  from public.resume_generation_runs
  where user_id = current_user_id
    and application_id = target_application_id
    and input_hash = target_input_hash;

  if owned_run.id is null
    or owned_run.provider <> btrim(target_provider)
    or owned_run.model <> btrim(target_model) then
    raise exception 'resume-generation-conflict' using errcode = '23505';
  end if;

  return owned_run;
end;
$$;

create function public.claim_resume_generation(target_run_id uuid)
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
    and status in ('queued', 'failed');

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create function public.complete_resume_generation(
  target_run_id uuid,
  accepted_suggestions jsonb,
  rejected_suggestion_count integer,
  rejected_reference_count integer,
  ai_usage jsonb,
  estimated_cost jsonb
)
returns public.resume_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_run public.resume_generation_runs%rowtype;
  completed_run public.resume_generation_runs%rowtype;
  candidate jsonb;
  candidate_section text;
  candidate_content text;
  candidate_reason text;
  candidate_fact_ids jsonb;
  candidate_requirement_ids jsonb;
  reference_text text;
  reference_id uuid;
  evidence_text text;
  protected_claim text;
  candidate_fact public.career_facts%rowtype;
  created_suggestion_id uuid;
  suggestion_index integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if jsonb_typeof(accepted_suggestions) <> 'array'
    or jsonb_array_length(accepted_suggestions) > 40
    or rejected_suggestion_count < 0
    or rejected_reference_count < 0 then
    raise exception 'invalid-resume-generation-result' using errcode = '22023';
  end if;

  select * into owned_run
  from public.resume_generation_runs
  where id = target_run_id
    and user_id = current_user_id
    and status = 'running'
  for update;

  if owned_run.id is null then
    raise exception 'resume-generation-not-running' using errcode = 'P0002';
  end if;

  delete from public.resume_suggestions
  where run_id = owned_run.id and user_id = current_user_id;

  for candidate in select value from jsonb_array_elements(accepted_suggestions)
  loop
    candidate_section := candidate ->> 'section';
    candidate_content := btrim(candidate ->> 'content');
    candidate_reason := btrim(candidate ->> 'reason');
    candidate_fact_ids := candidate -> 'factIds';
    candidate_requirement_ids := candidate -> 'requirementIds';

    if candidate_section not in (
      'summary', 'experience', 'project', 'education', 'skills',
      'certification', 'language', 'achievement'
    )
      or coalesce(char_length(candidate_content), 0) not between 1 and 700
      or coalesce(char_length(candidate_reason), 0) not between 1 and 500
      or jsonb_typeof(candidate_fact_ids) <> 'array'
      or jsonb_array_length(candidate_fact_ids) not between 1 and 5
      or jsonb_typeof(candidate_requirement_ids) <> 'array'
      or jsonb_array_length(candidate_requirement_ids) > 5 then
      raise exception 'invalid-resume-suggestion' using errcode = '22023';
    end if;

    insert into public.resume_suggestions (
      run_id, application_id, user_id, section, content, reason, sort_order
    ) values (
      owned_run.id, owned_run.application_id, current_user_id,
      candidate_section, candidate_content, candidate_reason, suggestion_index
    ) returning id into created_suggestion_id;

    evidence_text := '';
    for reference_text in
      select distinct value from jsonb_array_elements_text(candidate_fact_ids)
    loop
      if reference_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'invalid-resume-evidence' using errcode = '22023';
      end if;
      reference_id := reference_text::uuid;

      select * into candidate_fact
      from public.career_facts
        where id = reference_id
          and user_id = current_user_id
          and confirmation_status = 'confirmed';

      if candidate_fact.id is null then
        raise exception 'invalid-resume-evidence' using errcode = '22023';
      end if;

      insert into public.resume_suggestion_facts (
        suggestion_id, career_fact_id, run_id, application_id, user_id
      ) values (
        created_suggestion_id, reference_id, owned_run.id,
        owned_run.application_id, current_user_id
      );

      evidence_text := evidence_text || ' '
        || candidate_fact.fact_type || ' '
        || candidate_fact.data::text || ' '
        || coalesce(candidate_fact.source_excerpt, '');
    end loop;

    for protected_claim in
      select captures[1]
      from regexp_matches(
        candidate_content,
        '([$€£¥]?[0-9]+([.,][0-9]+)*[[:space:]]*%?)',
        'g'
      ) as captures
    loop
      if strpos(
        regexp_replace(lower(evidence_text), '[[:space:]]+', '', 'g'),
        regexp_replace(lower(protected_claim), '[[:space:]]+', '', 'g')
      ) = 0 then
        raise exception 'invalid-resume-content' using errcode = '22023';
      end if;
    end loop;

    for reference_text in
      select distinct value
      from jsonb_array_elements_text(candidate_requirement_ids)
    loop
      if reference_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'invalid-resume-requirement' using errcode = '22023';
      end if;
      reference_id := reference_text::uuid;

      if not exists (
        select 1 from public.application_requirements
        where id = reference_id
          and application_id = owned_run.application_id
          and user_id = current_user_id
      ) then
        raise exception 'invalid-resume-requirement' using errcode = '22023';
      end if;

      insert into public.resume_suggestion_requirements (
        suggestion_id, requirement_id, run_id, application_id, user_id
      ) values (
        created_suggestion_id, reference_id, owned_run.id,
        owned_run.application_id, current_user_id
      );
    end loop;

    suggestion_index := suggestion_index + 1;
  end loop;

  update public.resume_generation_runs
  set
    status = 'succeeded',
    result = jsonb_build_object(
      'acceptedSuggestionCount', jsonb_array_length(accepted_suggestions),
      'rejectedSuggestionCount', rejected_suggestion_count,
      'rejectedReferenceCount', rejected_reference_count,
      'ai', coalesce(ai_usage, '{}'::jsonb),
      'estimatedCost', estimated_cost
    ),
    error_code = null,
    error_message = null,
    finished_at = now()
  where id = owned_run.id and user_id = current_user_id
  returning * into completed_run;

  return completed_run;
end;
$$;

create function public.fail_resume_generation(
  target_run_id uuid,
  target_error_code text,
  target_error_message text
)
returns public.resume_generation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  failed_run public.resume_generation_runs%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  update public.resume_generation_runs
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
    raise exception 'resume-generation-not-running' using errcode = 'P0002';
  end if;

  return failed_run;
end;
$$;

create function public.review_resume_suggestion(
  target_suggestion_id uuid,
  target_decision text,
  target_reviewed_content text
)
returns public.resume_suggestions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  reviewed_suggestion public.resume_suggestions%rowtype;
  normalized_content text := nullif(btrim(target_reviewed_content), '');
  evidence_text text;
  protected_claim text;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_decision not in ('pending', 'accepted', 'rejected')
    or (normalized_content is not null and char_length(normalized_content) > 700)
    or (target_decision <> 'accepted' and normalized_content is not null) then
    raise exception 'invalid-resume-review' using errcode = '22023';
  end if;

  if target_decision = 'accepted' and normalized_content is not null then
    select string_agg(
      fact.fact_type || ' ' || fact.data::text || ' '
        || coalesce(fact.source_excerpt, ''),
      ' '
    )
    into evidence_text
    from public.resume_suggestions as suggestion
    join public.resume_suggestion_facts as link
      on link.suggestion_id = suggestion.id
    join public.career_facts as fact
      on fact.id = link.career_fact_id
    where suggestion.id = target_suggestion_id
      and suggestion.user_id = current_user_id
      and fact.user_id = current_user_id
      and fact.confirmation_status = 'confirmed';

    if evidence_text is null then
      raise exception 'invalid-resume-evidence' using errcode = '22023';
    end if;

    for protected_claim in
      select captures[1]
      from regexp_matches(
        normalized_content,
        '([$€£¥]?[0-9]+([.,][0-9]+)*[[:space:]]*%?)',
        'g'
      ) as captures
    loop
      if strpos(
        regexp_replace(lower(evidence_text), '[[:space:]]+', '', 'g'),
        regexp_replace(lower(protected_claim), '[[:space:]]+', '', 'g')
      ) = 0 then
        raise exception 'invalid-resume-content' using errcode = '22023';
      end if;
    end loop;
  end if;

  update public.resume_suggestions as suggestion
  set
    decision = target_decision,
    reviewed_content = case
      when target_decision = 'accepted' then normalized_content
      else null
    end,
    reviewed_at = case when target_decision = 'pending' then null else now() end
  from public.resume_generation_runs as run
  where suggestion.id = target_suggestion_id
    and suggestion.user_id = current_user_id
    and run.id = suggestion.run_id
    and run.user_id = current_user_id
    and run.status = 'succeeded'
  returning suggestion.* into reviewed_suggestion;

  if reviewed_suggestion.id is null then
    raise exception 'resume-suggestion-not-found' using errcode = 'P0002';
  end if;

  return reviewed_suggestion;
end;
$$;

create function public.create_resume_version(
  target_application_id uuid,
  target_source_run_id uuid,
  target_template text
)
returns public.resume_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_version public.resume_versions%rowtype;
  suggestion public.resume_suggestions%rowtype;
  fact_row public.career_facts%rowtype;
  created_item_id uuid;
  next_version_number integer;
  evidence_count integer;
  accepted_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if target_template not in ('simple', 'modern') then
    raise exception 'invalid-resume-template' using errcode = '22023';
  end if;

  perform 1 from public.applications
  where id = target_application_id and user_id = current_user_id
  for update;

  if not found or not exists (
    select 1 from public.resume_generation_runs
    where id = target_source_run_id
      and application_id = target_application_id
      and user_id = current_user_id
      and status = 'succeeded'
  ) then
    raise exception 'resume-generation-not-found' using errcode = 'P0002';
  end if;

  select count(*) into accepted_count
  from public.resume_suggestions
  where run_id = target_source_run_id
    and user_id = current_user_id
    and decision = 'accepted';

  if accepted_count = 0 then
    raise exception 'resume-version-empty' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.resume_versions
  where application_id = target_application_id;

  insert into public.resume_versions (
    application_id, user_id, source_run_id, version_number, template
  ) values (
    target_application_id, current_user_id, target_source_run_id,
    next_version_number, target_template
  ) returning * into created_version;

  for suggestion in
    select * from public.resume_suggestions
    where run_id = target_source_run_id
      and user_id = current_user_id
      and decision = 'accepted'
    order by sort_order
  loop
    select count(*) into evidence_count
    from public.resume_suggestion_facts as link
    join public.career_facts as fact on fact.id = link.career_fact_id
    where link.suggestion_id = suggestion.id
      and link.user_id = current_user_id
      and fact.user_id = current_user_id
      and fact.confirmation_status = 'confirmed';

    if evidence_count = 0 then
      raise exception 'resume-version-unsupported-item' using errcode = '22023';
    end if;

    insert into public.resume_version_items (
      version_id, application_id, user_id, section, content, reason, sort_order
    ) values (
      created_version.id, target_application_id, current_user_id,
      suggestion.section,
      coalesce(suggestion.reviewed_content, suggestion.content),
      suggestion.reason,
      suggestion.sort_order
    ) returning id into created_item_id;

    for fact_row in
      select fact.*
      from public.resume_suggestion_facts as link
      join public.career_facts as fact on fact.id = link.career_fact_id
      where link.suggestion_id = suggestion.id
        and link.user_id = current_user_id
        and fact.user_id = current_user_id
        and fact.confirmation_status = 'confirmed'
      order by fact.id
    loop
      insert into public.resume_version_item_evidence (
        item_id, career_fact_id, application_id, user_id, fact_snapshot
      ) values (
        created_item_id,
        fact_row.id,
        target_application_id,
        current_user_id,
        jsonb_build_object(
          'id', fact_row.id,
          'factType', fact_row.fact_type,
          'data', fact_row.data,
          'sourceExcerpt', fact_row.source_excerpt,
          'confirmedAt', fact_row.confirmed_at
        )
      );
    end loop;
  end loop;

  return created_version;
end;
$$;

revoke all on function public.create_or_get_resume_generation(
  uuid, text, text, text
) from public;
revoke all on function public.claim_resume_generation(uuid) from public;
revoke all on function public.complete_resume_generation(
  uuid, jsonb, integer, integer, jsonb, jsonb
) from public;
revoke all on function public.fail_resume_generation(uuid, text, text)
  from public;
revoke all on function public.review_resume_suggestion(uuid, text, text)
  from public;
revoke all on function public.create_resume_version(uuid, uuid, text)
  from public;

grant execute on function public.create_or_get_resume_generation(
  uuid, text, text, text
) to authenticated;
grant execute on function public.claim_resume_generation(uuid)
  to authenticated;
grant execute on function public.complete_resume_generation(
  uuid, jsonb, integer, integer, jsonb, jsonb
) to authenticated;
grant execute on function public.fail_resume_generation(uuid, text, text)
  to authenticated;
grant execute on function public.review_resume_suggestion(uuid, text, text)
  to authenticated;
grant execute on function public.create_resume_version(uuid, uuid, text)
  to authenticated;
