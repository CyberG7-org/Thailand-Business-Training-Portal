-- P16b: one calendar per team for the real bank visit (spec 2026-09-28 §5, §7; decision D67).

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.profiles (id),      -- null = the admin's calendar
  dbd_record_id uuid not null references public.dbd_records (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('booked', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  check (ends_at > starts_at)
);
-- Two learners clicking together: the index decides, the loser is told the slot was taken.
create unique index appointments_one_per_slot
  on public.appointments (coalesce(team_id, '00000000-0000-0000-0000-000000000000'), starts_at)
  where status = 'booked';
create index appointments_user_idx on public.appointments (user_id, starts_at desc);
create index appointments_team_idx on public.appointments (team_id, starts_at);
alter table public.appointments enable row level security;

create table public.appointment_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointment_blocks_team_idx on public.appointment_blocks (team_id, starts_at);
alter table public.appointment_blocks enable row level security;

-- Reads: a learner their own bookings; a manager their team's bookings and blocks (the team is
-- the manager's own id); the admin everything. Writes: the service role after the server's
-- checks (readiness, window, slot, team) — no insert/update policy exists.
create policy "appointments: learners read their own" on public.appointments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "appointments: admins and owning managers read" on public.appointments
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = (select auth.uid())));

create policy "appointment blocks: admins and owning managers read" on public.appointment_blocks
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = (select auth.uid())));
