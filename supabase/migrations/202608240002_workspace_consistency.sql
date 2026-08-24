alter table public.source_assets
  add column duplicate_of_id uuid;

alter table public.source_assets
  add constraint source_assets_user_id_id_key unique (user_id, id),
  add constraint source_assets_duplicate_not_self
    check (duplicate_of_id is null or duplicate_of_id <> id),
  add constraint source_assets_duplicate_owner_fkey
    foreign key (user_id, duplicate_of_id)
    references public.source_assets(user_id, id)
    on delete restrict;

with ranked_assets as (
  select
    id,
    first_value(id) over (
      partition by user_id, sha256
      order by
        case status
          when 'ready' then 0
          when 'extracting' then 1
          when 'uploaded' then 2
          when 'failed' then 3
          else 4
        end,
        created_at,
        id
    ) as canonical_id
  from public.source_assets
), duplicate_assets as (
  select id, canonical_id
  from ranked_assets
  where id <> canonical_id
)
update public.source_assets as asset
set duplicate_of_id = duplicate_assets.canonical_id
from duplicate_assets
where asset.id = duplicate_assets.id;

update public.applications as application
set resume_source_asset_id = asset.duplicate_of_id
from public.source_assets as asset
where application.resume_source_asset_id = asset.id
  and asset.duplicate_of_id is not null;

create unique index source_assets_user_sha256_canonical_idx
  on public.source_assets(user_id, sha256)
  where duplicate_of_id is null;

alter table public.application_requirements
  add column translation_zh text
    check (
      translation_zh is null
      or char_length(btrim(translation_zh)) between 1 and 1000
    );

drop function public.complete_application_analysis(
  uuid, jsonb, integer, integer, jsonb, jsonb
);

create function public.complete_application_analysis(
  target_run_id uuid,
  accepted_requirements jsonb,
  jd_translation_zh text default null,
  rejected_requirement_count integer default 0,
  rejected_evidence_count integer default 0,
  ai_usage jsonb default null,
  estimated_cost jsonb default null
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
  sanitized_jd_translation text := btrim(jd_translation_zh);
  candidate jsonb;
  candidate_category text;
  candidate_text text;
  candidate_translation_zh text;
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
    or char_length(sanitized_jd_translation) not between 1 and 100000
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
    candidate_translation_zh := btrim(candidate ->> 'translationZh');
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
      or char_length(candidate_translation_zh) not between 1 and 1000
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
      translation_zh,
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
      candidate_translation_zh,
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
      'jdTranslationZh', sanitized_jd_translation,
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

revoke all on function public.complete_application_analysis(
  uuid, jsonb, text, integer, integer, jsonb, jsonb
) from public;

grant execute on function public.complete_application_analysis(
  uuid, jsonb, text, integer, integer, jsonb, jsonb
) to authenticated;

create function public.delete_owned_application(
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

  -- `resume_versions.source_run_id` uses RESTRICT, so versions must be
  -- removed before the parent application cascades through generation runs.
  delete from public.resume_versions
  where application_id = owned_application_id
    and user_id = current_user_id;

  delete from public.applications
  where id = owned_application_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.delete_owned_application(uuid) from public;
grant execute on function public.delete_owned_application(uuid) to authenticated;
