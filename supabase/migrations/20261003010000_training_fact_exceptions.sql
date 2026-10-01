-- P17c: the exception queue (spec 2026-09-30 §5.5, §6; decision D74). Validators raise a row per
-- problem; a person resolves it under their own session (audited); a training version activates
-- only while nothing blocking is open. Resolved rows stay as labelled data.

create table public.training_fact_exceptions (
  id uuid primary key default gen_random_uuid(),
  dbd_record_id uuid not null references public.dbd_records (id) on delete cascade,
  kind text not null check (kind in
    ('missing', 'low_confidence', 'conflict', 'invalid', 'geo_mismatch', 'category_review', 'render_failure')),
  -- The fact, column or concept concerned, e.g. `juristic_id`, `shareholders.shares`.
  field text not null check (field ~ '^[a-z][a-z0-9_.:-]{0,79}$'),
  -- What the open row holds back (plan decision 1).
  blocks text not null check (blocks in ('acceptance', 'version', 'none')),
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('fixed', 'confirmed', 'dismissed')),
  note text check (note is null or char_length(note) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolution is not null)),
  check (status <> 'resolved' or resolved_at is not null),
  check (resolution is distinct from 'dismissed' or note is not null)
);

create unique index training_fact_exceptions_one_open
  on public.training_fact_exceptions (dbd_record_id, kind, field) where status = 'open';
create index training_fact_exceptions_record_idx
  on public.training_fact_exceptions (dbd_record_id, status);
create index training_fact_exceptions_open_idx
  on public.training_fact_exceptions (status, blocks, created_at) where status = 'open';

create trigger training_fact_exceptions_set_updated_at
  before update on public.training_fact_exceptions
  for each row execute function public.set_updated_at();
create trigger training_fact_exceptions_audit
  after insert or update or delete on public.training_fact_exceptions
  for each row execute function public.audit_row_change();

alter table public.training_fact_exceptions enable row level security;

-- The Owner and the owning team's manager read and resolve; validators insert with the service
-- role; learners see nothing (spec §6).
create policy "fact exceptions: admins and owning managers read"
  on public.training_fact_exceptions
  for select to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );
create policy "fact exceptions: admins and owning managers resolve"
  on public.training_fact_exceptions
  for update to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  )
  with check (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );

-- The thresholds (spec §6): silent at or above the first, blocking below the second.
insert into public.policy_config (key, value)
values
  ('training_auto_accept_confidence_percent', '95'::jsonb),
  ('training_review_confidence_percent', '75'::jsonb)
on conflict (key) do nothing;

-- A sheet that waits on exceptions is kept as the record's draft (P17b's `draft` status);
-- activation replaces it. Same body as P17b's function, plus the draft deletion.
create or replace function public.activate_training_version(
  p_record_id uuid,
  p_facts jsonb,
  p_extras jsonb,
  p_provenance jsonb,
  p_coverage jsonb,
  p_complete boolean,
  p_hash text,
  p_source_updated_at timestamptz,
  p_actor uuid default null,
  p_at timestamptz default now()
)
returns uuid
language plpgsql
as $$
declare
  v_active uuid;
  v_active_hash text;
  v_no integer;
  v_id uuid;
begin
  perform 1 from public.dbd_records where id = p_record_id for update;
  select id, facts_hash into v_active, v_active_hash
    from public.company_training_versions
    where dbd_record_id = p_record_id and status = 'active';
  if v_active is not null and v_active_hash = p_hash then
    delete from public.company_training_versions
      where dbd_record_id = p_record_id and status = 'draft';
    return null;
  end if;
  if v_active is not null then
    update public.company_training_versions
      set status = 'superseded', superseded_at = p_at
      where id = v_active;
  end if;
  delete from public.company_training_versions
    where dbd_record_id = p_record_id and status = 'draft';
  select coalesce(max(version_no), 0) + 1 into v_no
    from public.company_training_versions
    where dbd_record_id = p_record_id;
  insert into public.company_training_versions (
    dbd_record_id, version_no, status, facts, extras, provenance, coverage,
    company_complete, facts_hash, source_updated_at, created_by, activated_at
  ) values (
    p_record_id, v_no, 'active', p_facts, p_extras, p_provenance, p_coverage,
    p_complete, p_hash, p_source_updated_at, p_actor, p_at
  ) returning id into v_id;
  update public.user_dbd_assignments
    set training_version_id = v_id
    where dbd_record_id = p_record_id and active and training_version_id is null;
  return v_id;
end;
$$;
