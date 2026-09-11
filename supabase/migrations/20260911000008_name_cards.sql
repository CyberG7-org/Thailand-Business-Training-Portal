-- Generated Thai name cards (P6). One row per generation; the latest is what the learner sees.
create table public.name_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  phone_number text not null,
  template_version text not null,
  pdf_path text not null,
  telegram_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index name_cards_user_idx on public.name_cards (user_id, created_at desc);

alter table public.name_cards enable row level security;

create policy "name cards: learners read their own"
  on public.name_cards for select
  to authenticated
  using (user_id = auth.uid());

create policy "name cards: admins read"
  on public.name_cards for select
  to authenticated
  using (public.is_admin());
-- Rows are written by server actions (service role) after the PDF is stored.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('name-cards', 'name-cards', false, 5242880, array['application/pdf']);

create policy "name cards bucket: admins do everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'name-cards' and public.is_admin())
  with check (bucket_id = 'name-cards' and public.is_admin());
