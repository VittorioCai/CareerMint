create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'common', 'function', 'industry', 'job_specific'
  )),
  canonical_key text not null
    check (char_length(btrim(canonical_key)) between 1 and 500),
  prompt text not null
    check (char_length(btrim(prompt)) between 8 and 500),
  source text not null check (source in ('builtin', 'manual', 'ai')),
  preparation_status text not null default 'not_started' check (
    preparation_status in ('not_started', 'outlined', 'practiced', 'ready')
  ),
  answer_outline text check (
    answer_outline is null
    or char_length(btrim(answer_outline)) between 1 and 10000
  ),
  notes text check (
    notes is null or char_length(btrim(notes)) between 1 and 10000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_key)
);

create table public.interview_question_variants (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.interview_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wording text not null
    check (char_length(btrim(wording)) between 8 and 500),
  created_at timestamptz not null default now(),
  unique (question_id, wording)
);

create table public.application_interview_questions (
  application_id uuid not null
    references public.applications(id) on delete cascade,
  question_id uuid not null
    references public.interview_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted boolean not null default true,
  relevance_reason text check (
    relevance_reason is null
    or char_length(btrim(relevance_reason)) between 1 and 700
  ),
  created_at timestamptz not null default now(),
  primary key (application_id, question_id)
);

create table public.interview_question_facts (
  question_id uuid not null
    references public.interview_questions(id) on delete cascade,
  career_fact_id uuid not null
    references public.career_facts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, career_fact_id)
);

create index interview_questions_user_status_idx
  on public.interview_questions(user_id, preparation_status, category);
create index interview_question_variants_user_idx
  on public.interview_question_variants(user_id, question_id);
create index application_interview_questions_user_application_idx
  on public.application_interview_questions(user_id, application_id);
create index interview_question_facts_user_fact_idx
  on public.interview_question_facts(user_id, career_fact_id);

alter table public.interview_questions enable row level security;
alter table public.interview_question_variants enable row level security;
alter table public.application_interview_questions enable row level security;
alter table public.interview_question_facts enable row level security;

create policy interview_questions_owner_select
on public.interview_questions for select to authenticated
using ((select auth.uid()) = user_id);
create policy interview_question_variants_owner_select
on public.interview_question_variants for select to authenticated
using ((select auth.uid()) = user_id);
create policy application_interview_questions_owner_select
on public.application_interview_questions for select to authenticated
using ((select auth.uid()) = user_id);
create policy interview_question_facts_owner_select
on public.interview_question_facts for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.interview_questions from anon, authenticated;
revoke all on public.interview_question_variants from anon, authenticated;
revoke all on public.application_interview_questions from anon, authenticated;
revoke all on public.interview_question_facts from anon, authenticated;
grant select on public.interview_questions to authenticated;
grant select on public.interview_question_variants to authenticated;
grant select on public.application_interview_questions to authenticated;
grant select on public.interview_question_facts to authenticated;

create function public.normalize_interview_question_prompt(target_prompt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(btrim(target_prompt), '[?？!.！。]+$', '', 'g'),
      '[[:space:]]+', ' ', 'g'
    )
  );
$$;

create function public.seed_interview_common_questions(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.interview_questions (
    user_id, category, canonical_key, prompt, source
  )
  select
    target_user_id,
    'common',
    public.normalize_interview_question_prompt(seed.prompt),
    seed.prompt,
    'builtin'
  from (
    values
      ('Tell me about yourself.'),
      ('Why are you interested in this role?'),
      ('Describe your most significant achievement.'),
      ('Tell me about a difficult challenge you overcame.'),
      ('Tell me about a time you handled disagreement at work.')
  ) as seed(prompt)
  on conflict (user_id, canonical_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.add_interview_question(
  target_prompt text,
  target_category text,
  target_application_id uuid default null,
  target_relevance_reason text default null
)
returns public.interview_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_prompt text;
  owned_question public.interview_questions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_category not in ('common', 'function', 'industry', 'job_specific')
    or char_length(btrim(target_prompt)) not between 8 and 500
    or (
      target_relevance_reason is not null
      and char_length(btrim(target_relevance_reason)) not between 1 and 700
    )
    or (target_category = 'job_specific' and target_application_id is null) then
    raise exception 'invalid-interview-question' using errcode = '22023';
  end if;
  if target_application_id is not null and not exists (
    select 1 from public.applications
    where id = target_application_id and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  normalized_prompt := public.normalize_interview_question_prompt(target_prompt);
  insert into public.interview_questions (
    user_id, category, canonical_key, prompt, source
  ) values (
    current_user_id, target_category, normalized_prompt,
    btrim(target_prompt), 'manual'
  )
  on conflict (user_id, canonical_key) do nothing
  returning * into owned_question;

  if owned_question.id is null then
    select * into owned_question
    from public.interview_questions
    where user_id = current_user_id and canonical_key = normalized_prompt;

    if owned_question.prompt <> btrim(target_prompt) then
      insert into public.interview_question_variants (
        question_id, user_id, wording
      ) values (
        owned_question.id, current_user_id, btrim(target_prompt)
      ) on conflict (question_id, wording) do nothing;
    end if;
  end if;

  if target_application_id is not null then
    insert into public.application_interview_questions (
      application_id, question_id, user_id, predicted, relevance_reason
    ) values (
      target_application_id, owned_question.id, current_user_id, true,
      nullif(btrim(target_relevance_reason), '')
    )
    on conflict (application_id, question_id) do update
    set relevance_reason = coalesce(
      excluded.relevance_reason,
      public.application_interview_questions.relevance_reason
    );
  end if;

  return owned_question;
end;
$$;

create function public.update_interview_question(
  target_question_id uuid,
  target_preparation_status text,
  target_answer_outline text,
  target_notes text
)
returns public.interview_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_question public.interview_questions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_preparation_status not in (
    'not_started', 'outlined', 'practiced', 'ready'
  )
    or (
      target_answer_outline is not null
      and char_length(btrim(target_answer_outline)) > 10000
    )
    or (
      target_notes is not null and char_length(btrim(target_notes)) > 10000
    ) then
    raise exception 'invalid-interview-preparation' using errcode = '22023';
  end if;

  update public.interview_questions
  set
    preparation_status = target_preparation_status,
    answer_outline = nullif(btrim(target_answer_outline), ''),
    notes = nullif(btrim(target_notes), ''),
    updated_at = now()
  where id = target_question_id and user_id = current_user_id
  returning * into owned_question;

  if owned_question.id is null then
    raise exception 'interview-question-not-found' using errcode = 'P0002';
  end if;
  return owned_question;
end;
$$;

create function public.add_interview_question_variant(
  target_question_id uuid,
  target_wording text
)
returns public.interview_question_variants
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_variant public.interview_question_variants%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if char_length(btrim(target_wording)) not between 8 and 500 then
    raise exception 'invalid-interview-variant' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.interview_questions
    where id = target_question_id and user_id = current_user_id
  ) then
    raise exception 'interview-question-not-found' using errcode = 'P0002';
  end if;

  insert into public.interview_question_variants (
    question_id, user_id, wording
  ) values (
    target_question_id, current_user_id, btrim(target_wording)
  )
  on conflict (question_id, wording) do update
  set wording = excluded.wording
  returning * into created_variant;
  return created_variant;
end;
$$;

create function public.link_interview_question_to_application(
  target_question_id uuid,
  target_application_id uuid,
  target_predicted boolean default true,
  target_relevance_reason text default null
)
returns public.application_interview_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_link public.application_interview_questions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if target_relevance_reason is not null
    and char_length(btrim(target_relevance_reason)) not between 1 and 700 then
    raise exception 'invalid-interview-application-link' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.interview_questions
    where id = target_question_id and user_id = current_user_id
  ) then
    raise exception 'interview-question-not-found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.applications
    where id = target_application_id and user_id = current_user_id
  ) then
    raise exception 'application-not-found' using errcode = 'P0002';
  end if;

  insert into public.application_interview_questions (
    application_id, question_id, user_id, predicted, relevance_reason
  ) values (
    target_application_id, target_question_id, current_user_id,
    target_predicted, nullif(btrim(target_relevance_reason), '')
  )
  on conflict (application_id, question_id) do update
  set
    predicted = excluded.predicted,
    relevance_reason = excluded.relevance_reason
  returning * into created_link;
  return created_link;
end;
$$;

create function public.replace_interview_question_facts(
  target_question_id uuid,
  target_fact_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  linked_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.interview_questions
    where id = target_question_id and user_id = current_user_id
  ) then
    raise exception 'interview-question-not-found' using errcode = 'P0002';
  end if;
  if coalesce(cardinality(target_fact_ids), 0) > 8
    or exists (
      select 1
      from unnest(coalesce(target_fact_ids, '{}'::uuid[])) as requested(id)
      left join public.career_facts fact
        on fact.id = requested.id
        and fact.user_id = current_user_id
        and fact.confirmation_status = 'confirmed'
      where fact.id is null
    ) then
    raise exception 'invalid-interview-fact' using errcode = '22023';
  end if;

  delete from public.interview_question_facts
  where question_id = target_question_id and user_id = current_user_id;

  insert into public.interview_question_facts (
    question_id, career_fact_id, user_id
  )
  select target_question_id, requested.id, current_user_id
  from (
    select distinct id
    from unnest(coalesce(target_fact_ids, '{}'::uuid[])) as selected(id)
  ) as requested;

  get diagnostics linked_count = row_count;
  return linked_count;
end;
$$;

revoke all on function public.normalize_interview_question_prompt(text) from public;
revoke all on function public.seed_interview_common_questions(uuid) from public;
revoke all on function public.add_interview_question(text, text, uuid, text) from public;
revoke all on function public.update_interview_question(uuid, text, text, text) from public;
revoke all on function public.add_interview_question_variant(uuid, text) from public;
revoke all on function public.link_interview_question_to_application(uuid, uuid, boolean, text) from public;
revoke all on function public.replace_interview_question_facts(uuid, uuid[]) from public;
grant execute on function public.add_interview_question(text, text, uuid, text) to authenticated;
grant execute on function public.update_interview_question(uuid, text, text, text) to authenticated;
grant execute on function public.add_interview_question_variant(uuid, text) to authenticated;
grant execute on function public.link_interview_question_to_application(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.replace_interview_question_facts(uuid, uuid[]) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;

  perform public.seed_interview_common_questions(new.id);
  return new;
end;
$$;

do $$
declare
  profile_row record;
begin
  for profile_row in select user_id from public.profiles
  loop
    perform public.seed_interview_common_questions(profile_row.user_id);
  end loop;
end;
$$;
