-- Question bank and assessment attempts (quiz + exam share the engine; spec §4.3/§4.4, P4 spec).

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_key text not null unique,
  kind text not null check (kind in ('generic', 'dbd_template')),
  dbd_field_dependencies text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'ai_generated')),
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved', 'retired')),
  pools text[] not null default '{quiz,exam}',
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_pools_valid check (pools <@ array['quiz', 'exam']::text[])
);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

create trigger questions_audit
  after insert or update or delete on public.questions
  for each row execute function public.audit_row_change();

create table public.question_localizations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  language text not null check (language in ('th', 'en', 'zh')),
  prompt text not null,
  options jsonb not null,
  correct_key text not null check (correct_key in ('A', 'B', 'C', 'D', 'E', 'F')),
  explanation text,
  tts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, language),
  constraint question_options_shape check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6
  )
);

create trigger question_localizations_set_updated_at
  before update on public.question_localizations
  for each row execute function public.set_updated_at();

create trigger question_localizations_audit
  after insert or update or delete on public.question_localizations
  for each row execute function public.audit_row_change();

-- Approval requires all three languages (spec §4.3).
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
    select count(distinct language) into v_langs
    from public.question_localizations where question_id = new.id;
    if v_langs < 3 then
      raise exception 'A question needs th, en and zh localizations before approval'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger questions_check_approval
  before update of approval_status on public.questions
  for each row execute function public.questions_check_approval();

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid references public.dbd_records (id),
  kind text not null check (kind in ('quiz', 'exam')),
  language text not null check (language in ('th', 'en', 'zh')),
  attempt_no integer not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  question_ids uuid[] not null,
  shuffle_seed text not null,
  passing_mark_snapshot numeric(5, 2),
  score integer,
  max_score integer,
  result text check (result in ('pass', 'fail')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (user_id, kind, attempt_no)
);

create unique index assessment_attempts_one_in_progress
  on public.assessment_attempts (user_id, kind) where status = 'in_progress';

create index assessment_attempts_user_idx on public.assessment_attempts (user_id, kind, started_at desc);

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  position integer not null,
  presented_option_order text[] not null,
  rendered_prompt text not null,
  rendered_options jsonb not null,
  selected_key text check (selected_key in ('A', 'B', 'C', 'D', 'E', 'F')),
  is_correct boolean,
  answered_at timestamptz,
  unique (attempt_id, question_id)
);

alter table public.questions enable row level security;
alter table public.question_localizations enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_answers enable row level security;

-- Learners never read the bank directly (correct keys); server actions use the service role.
create policy "questions: admins do everything"
  on public.questions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "question loc: admins do everything"
  on public.question_localizations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "attempts: learners read their own"
  on public.assessment_attempts for select
  to authenticated
  using (user_id = auth.uid());

create policy "attempts: admins read"
  on public.assessment_attempts for select
  to authenticated
  using (public.is_admin());

create policy "answers: learners read their own"
  on public.assessment_answers for select
  to authenticated
  using (
    exists (
      select 1 from public.assessment_attempts a
      where a.id = assessment_answers.attempt_id and a.user_id = auth.uid()
    )
  );

create policy "answers: admins read"
  on public.assessment_answers for select
  to authenticated
  using (public.is_admin());
-- No insert/update policies: attempts and answers are written by server actions (service role).
