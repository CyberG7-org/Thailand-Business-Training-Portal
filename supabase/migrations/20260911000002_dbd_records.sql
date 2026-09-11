-- Audit log: written only by the audit_row_change() trigger (security definer).
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,          -- e.g. dbd_records.update
  entity_type text not null,     -- table name
  entity_id text,                -- primary key of the row (uuid or key) as text
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit: admins read"
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- DBD records: one per company certificate (หนังสือรับรอง). Only confirmed records can be assigned.
create table public.dbd_records (
  id uuid primary key default gen_random_uuid(),
  juristic_id text,
  certificate_no text,
  document_ref text,
  company_name_th text,
  company_name_en text,
  registered_on date,
  issued_on date,
  registered_capital numeric(18, 2),
  head_office_address text,
  directors jsonb not null default '[]'::jsonb,
  signing_authority text,
  objectives_count integer,
  issuing_office text,
  registrar_name text,
  structured_data jsonb not null default '{}'::jsonb,
  document_path text,
  extraction_status text not null default 'none'
    check (extraction_status in ('none', 'pending', 'extracted', 'confirmed')),
  extraction_raw jsonb,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dbd_juristic_id_format
    check (juristic_id is null or juristic_id ~ '^[0-9]{13}$'),
  constraint dbd_issue_not_before_registration
    check (issued_on is null or registered_on is null or issued_on >= registered_on),
  constraint dbd_confirmed_requires_core_fields
    check (
      extraction_status <> 'confirmed'
      or (juristic_id is not null and company_name_th is not null
          and confirmed_by is not null and confirmed_at is not null)
    )
);

comment on column public.dbd_records.issued_on is
  'Certificate "Issued on" date (CE). Drives Bank Verification eligibility (decision D2). May be null: then no eligibility snapshot exists and the record is flagged.';

create trigger dbd_records_set_updated_at
  before update on public.dbd_records
  for each row execute function public.set_updated_at();

create trigger dbd_records_audit
  after insert or update or delete on public.dbd_records
  for each row execute function public.audit_row_change();

alter table public.dbd_records enable row level security;

create policy "dbd: admins do everything"
  on public.dbd_records for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- "dbd: learners read their assigned record" is created in 20260911000003 (needs assignments).

-- Private bucket for certificate PDFs. Learners never touch the bucket directly; the server
-- issues short-lived signed URLs after an ownership check (spec §5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dbd-documents', 'dbd-documents', false, 10485760, array['application/pdf']);

create policy "dbd docs: admins do everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'dbd-documents' and public.is_admin())
  with check (bucket_id = 'dbd-documents' and public.is_admin());
