create or replace function public.normalize_interview_question_prompt(target_prompt text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        btrim(normalize(target_prompt, NFKC)),
        '[?？!.！。]+$',
        '',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.save_interview_question_preparation(
  target_question_id uuid,
  target_preparation_status text,
  target_answer_outline text,
  target_notes text,
  target_fact_ids uuid[]
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
  perform 1
  from public.career_facts fact
  where fact.user_id = current_user_id
    and fact.id = any(coalesce(target_fact_ids, '{}'::uuid[]))
  order by fact.id
  for update;
  if target_preparation_status not in (
    'not_started', 'outlined', 'practiced', 'ready'
  )
    or (
      target_answer_outline is not null
      and char_length(btrim(target_answer_outline)) > 10000
    )
    or (
      target_notes is not null
      and char_length(btrim(target_notes)) > 10000
    )
    or coalesce(cardinality(target_fact_ids), 0) > 8
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

  select *
  into owned_question
  from public.interview_questions
  where id = target_question_id and user_id = current_user_id
  for update;

  if owned_question.id is null then
    raise exception 'interview-question-not-found' using errcode = 'P0002';
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

  update public.interview_questions
  set
    preparation_status = target_preparation_status,
    answer_outline = nullif(btrim(target_answer_outline), ''),
    notes = nullif(btrim(target_notes), ''),
    updated_at = now()
  where id = target_question_id and user_id = current_user_id
  returning * into owned_question;

  return owned_question;
end;
$$;

create or replace function public.clear_interview_question_facts_for_unconfirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.interview_question_facts
  where career_fact_id = old.id;
  return new;
end;
$$;

drop trigger if exists career_facts_clear_interview_question_links
on public.career_facts;

create trigger career_facts_clear_interview_question_links
after update of confirmation_status on public.career_facts
for each row
when (
  old.confirmation_status = 'confirmed'
  and new.confirmation_status <> 'confirmed'
)
execute function public.clear_interview_question_facts_for_unconfirmed();

delete from public.interview_question_facts links
using public.career_facts facts
where links.career_fact_id = facts.id
  and facts.confirmation_status <> 'confirmed';

revoke all on function public.normalize_interview_question_prompt(text) from public;
revoke all on function public.save_interview_question_preparation(uuid, text, text, text, uuid[]) from public;
revoke all on function public.clear_interview_question_facts_for_unconfirmed() from public;
grant execute on function public.save_interview_question_preparation(uuid, text, text, text, uuid[]) to authenticated;
