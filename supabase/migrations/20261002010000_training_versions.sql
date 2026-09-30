-- P17b: immutable training versions (spec 2026-09-30 §5.6, §6; decisions D74, D75). A version is
-- the fact sheet of a confirmed record, frozen once active; an assignment pins one and never
-- moves by itself. Written by the service role after checks in code (the audit trigger keeps
-- the history); read by the Owner, the owning manager and the learner it is pinned to.

create table public.company_training_versions (
  id uuid primary key default gen_random_uuid(),
  dbd_record_id uuid not null references public.dbd_records (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  -- The company-scope fact sheet (lib/domain/facts/fact-sheet.ts) and what the old templates
  -- still read beside it (lib/domain/facts/snapshot.ts).
  facts jsonb not null,
  extras jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  coverage jsonb not null,
  company_complete boolean not null default false,
  facts_hash text not null,
  source_updated_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dbd_record_id, version_no),
  -- Activation is not gated on completeness (plan decision 1); it is gated on exceptions from P17c.
  check (status <> 'active' or activated_at is not null),
  check (status <> 'superseded' or (activated_at is not null and superseded_at is not null))
);

create unique index company_training_versions_one_active
  on public.company_training_versions (dbd_record_id) where status = 'active';
create unique index company_training_versions_one_draft
  on public.company_training_versions (dbd_record_id) where status = 'draft';
create index company_training_versions_record_idx
  on public.company_training_versions (dbd_record_id, version_no desc);

-- Frozen once active (D75): the sheet of an active or superseded version never changes, and the
-- only moves are draft → active and active → superseded.
create or replace function public.training_version_freeze()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('active', 'superseded') then
    if new.facts is distinct from old.facts
       or new.extras is distinct from old.extras
       or new.provenance is distinct from old.provenance
       or new.coverage is distinct from old.coverage
       or new.company_complete is distinct from old.company_complete
       or new.facts_hash is distinct from old.facts_hash
       or new.version_no is distinct from old.version_no
       or new.dbd_record_id is distinct from old.dbd_record_id
       or new.activated_at is distinct from old.activated_at then
      raise exception 'training version % is frozen', old.id using errcode = 'check_violation';
    end if;
    if old.status = 'superseded' and new.status is distinct from 'superseded' then
      raise exception 'a superseded training version stays superseded'
        using errcode = 'check_violation';
    end if;
    if old.status = 'active' and new.status not in ('active', 'superseded') then
      raise exception 'an active training version can only be superseded'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.training_version_freeze() from public, anon, authenticated;

create trigger company_training_versions_freeze
  before update on public.company_training_versions
  for each row execute function public.training_version_freeze();
create trigger company_training_versions_set_updated_at
  before update on public.company_training_versions
  for each row execute function public.set_updated_at();
create trigger company_training_versions_audit
  after insert or update or delete on public.company_training_versions
  for each row execute function public.audit_row_change();

alter table public.company_training_versions enable row level security;

create policy "training versions: admins and owning managers read"
  on public.company_training_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );

-- The pin (§5.6): which version an assignment studies and is evaluated on, and the learner's
-- role as confirmed against it (plan decision 4).
alter table public.user_dbd_assignments
  add column training_version_id uuid references public.company_training_versions (id),
  add column role_snapshot jsonb,
  add column role_confirmed_at timestamptz,
  add column role_confirmed_by uuid references public.profiles (id) on delete set null,
  add constraint user_dbd_assignments_role_confirmed
    check ((role_snapshot is null) = (role_confirmed_at is null));
create index user_dbd_assignments_version_idx
  on public.user_dbd_assignments (training_version_id);

-- The learner reads exactly the version their active assignment pins (plan decision 3).
create policy "training versions: learners read their pinned version"
  on public.company_training_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.user_dbd_assignments a
      where a.training_version_id = company_training_versions.id
        and a.user_id = auth.uid()
        and a.active
    )
  );

-- A pin points at a version of the assignment's own record.
create or replace function public.assignment_version_matches()
returns trigger
language plpgsql
as $$
begin
  if new.training_version_id is not null and not exists (
    select 1 from public.company_training_versions v
    where v.id = new.training_version_id and v.dbd_record_id = new.dbd_record_id
  ) then
    raise exception 'training version % is not a version of record %',
      new.training_version_id, new.dbd_record_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.assignment_version_matches() from public, anon, authenticated;
create trigger user_dbd_assignments_version_check
  before insert or update of training_version_id, dbd_record_id on public.user_dbd_assignments
  for each row execute function public.assignment_version_matches();

-- Results count against a version (D75): an attempt remembers the one it was rendered from.
alter table public.assessment_attempts
  add column training_version_id uuid
    references public.company_training_versions (id) on delete set null;
