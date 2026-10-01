-- P17d: the concept-first MCQ bank (spec 2026-09-30 §6, §8; decisions D76, D77).
-- A question that names a concept is a *variant* of it; the others are the earlier free-form
-- questions the quiz and exam keep using until P17e. Only the Owner writes either kind.

-- 1. A question may be a variant of a concept.
alter table public.questions
  add column concept_key text references public.evaluation_concepts(key),
  add column correct_option_key text check (correct_option_key in ('A', 'B', 'C', 'D')),
  add column option_recipes jsonb,
  add column applies_when jsonb;

comment on column public.questions.concept_key is
  'The MCQ concept this row is a variant of; null for an earlier free-form question.';
comment on column public.questions.option_recipes is
  'The recipe each option declares, {"A": "DIRECT_FACT", ...} (D77); the editor checks the text matches.';
comment on column public.questions.applies_when is
  'The status this variant is worded for, {"fact": "has_existing_customers", "value": false}; null = every company.';

alter table public.questions drop constraint questions_kind_check;
alter table public.questions
  add constraint questions_kind_check check (kind in ('generic', 'dbd_template', 'concept'));

-- A row is wholly a variant or wholly an earlier question. A variant never enters the old
-- quiz/exam pools: P17e reads it by concept.
alter table public.questions add constraint questions_variant_shape check (
  (
    concept_key is null
    and kind <> 'concept'
    and correct_option_key is null
    and option_recipes is null
    and applies_when is null
  )
  or (
    concept_key is not null
    and kind = 'concept'
    and correct_option_key is not null
    and option_recipes is not null
    and jsonb_typeof(option_recipes) = 'object'
    and option_recipes ?& array['A', 'B', 'C', 'D']
    and pools = '{}'
    and (
      applies_when is null
      -- `coalesce`: a missing key makes the comparison null, and a null check would pass.
      or coalesce(
        jsonb_typeof(applies_when) = 'object'
        and jsonb_typeof(applies_when -> 'fact') = 'string'
        and jsonb_typeof(applies_when -> 'value') = 'boolean',
        false
      )
    )
  )
);

create index questions_concept_idx on public.questions (concept_key)
  where concept_key is not null;

-- 2. A variant belongs to an MCQ concept, is worded only for a status that concept turns on,
--    and goes back to draft when its structure changes after approval (spec §8).
create function public.questions_variant_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order smallint;
  v_alternate text[];
begin
  if new.concept_key is null then
    return new;
  end if;
  select mcq_order, alternate_when into v_order, v_alternate
  from public.evaluation_concepts where key = new.concept_key;
  if v_order is null then
    raise exception 'Concept % is not an MCQ concept', new.concept_key
      using errcode = 'check_violation';
  end if;
  if new.applies_when is not null
     and not ((new.applies_when ->> 'fact') = any (v_alternate)) then
    raise exception 'Concept % has no alternate wording for %',
      new.concept_key, new.applies_when ->> 'fact'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE'
     and old.approval_status = 'approved'
     and new.approval_status = 'approved'
     and (
       new.concept_key is distinct from old.concept_key
       or new.correct_option_key is distinct from old.correct_option_key
       or new.option_recipes is distinct from old.option_recipes
       or new.applies_when is distinct from old.applies_when
     ) then
    new.approval_status := 'draft';
  end if;
  return new;
end;
$$;

create trigger questions_variant_guard
  before insert or update on public.questions
  for each row execute function public.questions_variant_guard();

-- 3. Approval: a variant on its Thai text alone; an earlier question on all three languages.
create or replace function public.questions_check_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_langs integer;
begin
  if new.approval_status = 'approved' and (old.approval_status is distinct from 'approved') then
    if new.concept_key is not null then
      if not exists (
        select 1 from public.question_localizations l
        where l.question_id = new.id and l.language = 'th'
      ) then
        raise exception 'A variant needs its Thai text before approval'
          using errcode = 'check_violation';
      end if;
    else
      select count(distinct language) into v_langs
      from public.question_localizations where question_id = new.id;
      if v_langs < 3 then
        raise exception 'A question needs th, en and zh localizations before approval'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 4. An approved variant whose Thai text changes goes back to draft. English and Chinese are
--    reference translations: changing them does not.
create function public.question_localizations_unapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question uuid;
  v_language text;
begin
  if tg_op = 'DELETE' then
    v_question := old.question_id;
    v_language := old.language;
  else
    v_question := new.question_id;
    v_language := new.language;
  end if;
  if v_language = 'th'
     and not (
       tg_op = 'UPDATE'
       and new.prompt is not distinct from old.prompt
       and new.options is not distinct from old.options
       and new.correct_key is not distinct from old.correct_key
       and new.explanation is not distinct from old.explanation
     ) then
    update public.questions
       set approval_status = 'draft'
     where id = v_question and concept_key is not null and approval_status = 'approved';
  end if;
  return null;
end;
$$;

create trigger question_localizations_unapprove
  after insert or update or delete on public.question_localizations
  for each row execute function public.question_localizations_unapprove();

revoke execute on function public.questions_variant_guard() from public, anon, authenticated;
revoke execute on function public.question_localizations_unapprove() from public, anon, authenticated;

-- 5. Only the Owner writes the bank (D76, superseding D54 for assessment content); staff read.
--    The helper calls are wrapped in a sub-select so each runs once per statement, not per row.
drop policy "questions: staff do everything" on public.questions;
create policy "questions: staff read" on public.questions
  for select to authenticated using ((select public.is_staff()));
create policy "questions: owner inserts" on public.questions
  for insert to authenticated with check ((select public.is_admin()));
create policy "questions: owner updates" on public.questions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy "question loc: staff do everything" on public.question_localizations;
create policy "question loc: staff read" on public.question_localizations
  for select to authenticated using ((select public.is_staff()));
create policy "question loc: owner inserts" on public.question_localizations
  for insert to authenticated with check ((select public.is_admin()));
create policy "question loc: owner updates" on public.question_localizations
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "question loc: owner deletes" on public.question_localizations
  for delete to authenticated using ((select public.is_admin()));

drop policy "question batches: staff do everything" on public.question_generation_batches;
create policy "question batches: staff read" on public.question_generation_batches
  for select to authenticated using ((select public.is_staff()));
create policy "question batches: owner inserts" on public.question_generation_batches
  for insert to authenticated with check ((select public.is_admin()));
create policy "question batches: owner updates" on public.question_generation_batches
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
