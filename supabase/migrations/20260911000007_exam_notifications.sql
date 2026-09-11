-- Notification queue (ADR 0004) and the atomic exam finalization function (spec §9 step 5).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel text not null check (channel in ('telegram', 'email')),
  destination_ref text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_due_idx on public.notifications (status, next_attempt_at);

alter table public.notifications enable row level security;

create policy "notifications: admins read"
  on public.notifications for select
  to authenticated
  using (public.is_admin());

create policy "notifications: admins update"
  on public.notifications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- Inserts happen only inside finalize_attempt (below) and service-role code.

-- Closes an attempt and enqueues its notifications in one transaction.
-- p_notifications: [{event_type, channel, destination_ref, payload, idempotency_key}]
create or replace function public.finalize_attempt(
  p_attempt_id uuid,
  p_score integer,
  p_max_score integer,
  p_result text,
  p_notifications jsonb default '[]'::jsonb
)
returns public.assessment_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.assessment_attempts;
  v_correct integer;
  v_total integer;
  n jsonb;
begin
  select * into v_attempt from public.assessment_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;
  if v_attempt.status <> 'in_progress' then
    return v_attempt; -- already finalized: idempotent no-op
  end if;

  select count(*) filter (where is_correct), count(*)
    into v_correct, v_total
  from public.assessment_answers where attempt_id = p_attempt_id;
  if v_correct <> p_score or v_total <> p_max_score then
    raise exception 'score mismatch: expected %/% got %/%', v_correct, v_total, p_score, p_max_score
      using errcode = 'check_violation';
  end if;

  update public.assessment_attempts
     set status = 'submitted', score = p_score, max_score = p_max_score,
         result = p_result, submitted_at = now()
   where id = p_attempt_id
   returning * into v_attempt;

  for n in select * from jsonb_array_elements(p_notifications) loop
    insert into public.notifications (event_type, channel, destination_ref, payload, idempotency_key)
    values (
      n ->> 'event_type',
      n ->> 'channel',
      n ->> 'destination_ref',
      coalesce(n -> 'payload', '{}'::jsonb),
      n ->> 'idempotency_key'
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  return v_attempt;
end;
$$;

revoke all on function public.finalize_attempt(uuid, integer, integer, text, jsonb) from public;
grant execute on function public.finalize_attempt(uuid, integer, integer, text, jsonb) to service_role;

-- Leases due notifications for one worker run: bumps attempts, pushes next_attempt_at ahead.
create or replace function public.claim_notifications(p_limit integer default 20)
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id from public.notifications
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit p_limit
    for update skip locked
  )
  update public.notifications n
     set attempts = n.attempts + 1,
         next_attempt_at = now() + interval '5 minutes'
    from due
   where n.id = due.id
  returning n.*;
end;
$$;

revoke all on function public.claim_notifications(integer) from public;
grant execute on function public.claim_notifications(integer) to service_role;
