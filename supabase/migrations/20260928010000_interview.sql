-- P16a: the readiness interview replaces the voice call (spec 2026-09-28 §6–7, decision D64).

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  language text not null default 'th',
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  verdict text check (verdict in ('ready', 'not_ready')),
  plan jsonb not null,
  summary jsonb,
  provider text not null,
  started_at timestamptz not null default now(),
  last_turn_at timestamptz not null default now(),
  ended_at timestamptz
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, started_at desc);
create index interview_sessions_record_idx on public.interview_sessions (dbd_record_id);
alter table public.interview_sessions enable row level security;

create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  seq integer not null,
  role text not null check (role in ('officer', 'learner')),
  content text not null,
  assessment jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
alter table public.interview_turns enable row level security;

-- Reads: the learner, their manager (through the team predicate computed once per statement,
-- as 20260925000000 does) and the admin. Writes: the service role only — no insert/update
-- policy exists, so a learner's own client cannot forge a turn or a verdict.
create policy "interviews: learners read their own" on public.interview_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "interviews: admins and owning managers read" on public.interview_sessions
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

create policy "interview turns: learners read their own" on public.interview_turns
  for select to authenticated
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = interview_turns.session_id and s.user_id = (select auth.uid())
    )
  );

create policy "interview turns: admins and owning managers read" on public.interview_turns
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_manager()
      and exists (
        select 1 from public.interview_sessions s
        where s.id = interview_turns.session_id
          and s.user_id = any (public.my_team_member_ids())
      )
    )
  );

-- The exam-pass gate keeps its value under the stage's new name (the guard covers a database
-- where the new key was already written); the session cap goes with the call.
update public.policy_config
  set key = 'require_exam_pass_for_interview'
  where key = 'require_exam_pass_for_bank_call'
    and not exists (
      select 1 from public.policy_config where key = 'require_exam_pass_for_interview'
    );
delete from public.policy_config
  where key in ('require_exam_pass_for_bank_call', 'call_max_sessions');

-- The voice call: its bucket policies, the team helper that keyed recordings by session and the
-- tables. Storage rows may not be deleted by SQL ("Use the Storage API instead"), so the empty
-- `recordings` bucket — unreadable once its policies are gone — is removed through the Storage
-- API (dashboard: Storage → recordings → delete). Nothing was ever recorded on staging.
drop policy if exists "recordings bucket: staff read" on storage.objects;
drop policy if exists "recordings bucket: admins write" on storage.objects;
drop function if exists public.key_session_is_my_team(text);
drop table if exists public.webhook_events;
drop table if exists public.call_sessions;
