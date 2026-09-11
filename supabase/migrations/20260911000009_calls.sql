-- Bank call training sessions (P8) and the idempotent webhook ledger (spec §4.5/§4.6).

create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  vapi_call_id text unique,
  modality text not null check (modality in ('web', 'phone', 'fake')),
  status text not null default 'initiated'
    check (status in ('initiated', 'in_progress', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  recording_path text,
  transcript text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index call_sessions_user_idx on public.call_sessions (user_id, started_at desc);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, external_id, event_type)
);

alter table public.call_sessions enable row level security;
alter table public.webhook_events enable row level security;

create policy "calls: learners read their own"
  on public.call_sessions for select
  to authenticated
  using (user_id = auth.uid());

create policy "calls: admins read"
  on public.call_sessions for select
  to authenticated
  using (public.is_admin());

create policy "webhooks: admins read"
  on public.webhook_events for select
  to authenticated
  using (public.is_admin());
-- Writes come from server actions and the webhook route (service role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800, array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm', 'application/octet-stream']);

create policy "recordings bucket: admins do everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'recordings' and public.is_admin())
  with check (bucket_id = 'recordings' and public.is_admin());
