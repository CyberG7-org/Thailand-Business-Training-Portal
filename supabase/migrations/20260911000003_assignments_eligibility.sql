-- Every open business rule lives here (spec §4.6). JSON null means "not set".
create table public.policy_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.policy_config enable row level security;

create policy "policy: admins do everything"
  on public.policy_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger policy_config_audit
  after insert or update or delete on public.policy_config
  for each row execute function public.audit_row_change();

insert into public.policy_config (key, value) values
  ('bank_eligibility_days', '45'::jsonb),
  ('bank_access_expiry_days', 'null'::jsonb),
  ('exam_passing_mark_percent', '70'::jsonb),
  ('quiz_question_count', '10'::jsonb),
  ('exam_question_count', '20'::jsonb),
  ('exam_max_attempts', 'null'::jsonb),
  ('exam_retry_wait_hours', '0'::jsonb),
  ('exam_pass_rule', '"any"'::jsonb),
  ('require_exam_pass_for_name_card', 'false'::jsonb),
  ('require_exam_pass_for_bank_call', 'true'::jsonb),
  ('call_max_sessions', 'null'::jsonb),
  ('telegram_admin_chat_ids', '[]'::jsonb),
  ('email_admin_recipients', '[]'::jsonb),
  ('study_completion_tracking', '"viewed"'::jsonb);

create or replace function public.policy_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::integer else null end
  from public.policy_config
  where key = p_key;
$$;

-- One learner ↔ one active company.
create table public.user_dbd_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  active boolean not null default true,
  deactivated_at timestamptz
);

create unique index user_dbd_assignments_one_active
  on public.user_dbd_assignments (user_id) where active;

create index user_dbd_assignments_active_record_idx
  on public.user_dbd_assignments (dbd_record_id) where active;

-- Append-only history of eligibility calculations (ADR 0005).
create table public.eligibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  issued_on_snapshot date not null,
  available_from date not null,
  expires_at date,
  calculated_at timestamptz not null default now(),
  reason text not null check (reason in ('assignment', 'issue_date_changed', 'policy_changed'))
);

create index eligibility_snapshots_latest_idx
  on public.eligibility_snapshots (user_id, dbd_record_id, calculated_at desc);

-- BR-002: available_from = issued_on + N calendar days (N from policy_config, default 45).
-- No snapshot when issued_on is null: the record is flagged for correction (PRD §16).
create or replace function public.compute_eligibility_snapshot(p_user_id uuid, p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issued date;
  v_days integer := coalesce(public.policy_int('bank_eligibility_days'), 45);
  v_expiry_days integer := public.policy_int('bank_access_expiry_days');
begin
  select issued_on into v_issued from public.dbd_records where id = p_record_id;
  if v_issued is null then
    return;
  end if;

  insert into public.eligibility_snapshots
    (user_id, dbd_record_id, issued_on_snapshot, available_from, expires_at, reason)
  values (
    p_user_id,
    p_record_id,
    v_issued,
    v_issued + v_days,
    case when v_expiry_days is null then null else v_issued + v_days + v_expiry_days end,
    p_reason
  );
end;
$$;

create or replace function public.assignment_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select extraction_status into v_status from public.dbd_records where id = new.dbd_record_id;
  if v_status is distinct from 'confirmed' then
    raise exception 'DBD record % is not confirmed (status: %)', new.dbd_record_id, coalesce(v_status, 'missing')
      using errcode = 'check_violation';
  end if;
  if new.assigned_by is null then
    new.assigned_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger user_dbd_assignments_before_insert
  before insert on public.user_dbd_assignments
  for each row execute function public.assignment_before_insert();

create or replace function public.assignment_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.compute_eligibility_snapshot(new.user_id, new.dbd_record_id, 'assignment');
  return new;
end;
$$;

create trigger user_dbd_assignments_after_insert
  after insert on public.user_dbd_assignments
  for each row execute function public.assignment_after_insert();

create or replace function public.dbd_issue_date_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.issued_on is distinct from old.issued_on then
    for r in
      select user_id from public.user_dbd_assignments
      where dbd_record_id = new.id and active
    loop
      perform public.compute_eligibility_snapshot(r.user_id, new.id, 'issue_date_changed');
    end loop;
  end if;
  return new;
end;
$$;

create trigger dbd_records_issue_date_changed
  after update of issued_on on public.dbd_records
  for each row execute function public.dbd_issue_date_changed();

create trigger user_dbd_assignments_audit
  after insert or update or delete on public.user_dbd_assignments
  for each row execute function public.audit_row_change();

alter table public.user_dbd_assignments enable row level security;

create policy "assignments: learners read their own"
  on public.user_dbd_assignments for select
  to authenticated
  using (user_id = auth.uid());

create policy "assignments: admins do everything"
  on public.user_dbd_assignments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.eligibility_snapshots enable row level security;

create policy "eligibility: learners read their own"
  on public.eligibility_snapshots for select
  to authenticated
  using (user_id = auth.uid());

create policy "eligibility: admins read"
  on public.eligibility_snapshots for select
  to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: rows are written only by compute_eligibility_snapshot().

create policy "dbd: learners read their assigned record"
  on public.dbd_records for select
  to authenticated
  using (
    exists (
      select 1 from public.user_dbd_assignments a
      where a.dbd_record_id = dbd_records.id and a.user_id = auth.uid() and a.active
    )
  );
