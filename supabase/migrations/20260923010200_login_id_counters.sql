-- P15a: account codes that are never reused (spec §3.3). One counter row per scope: 'manager'
-- for team codes, and a manager profile id for the learners inside that team.

create table public.login_id_counters (
  scope text primary key,
  next_value integer not null default 1
);
alter table public.login_id_counters enable row level security;
-- No policies: only the service role, through allocate_login_id, ever touches this.

comment on table public.login_id_counters is
  'Monotonic counters behind account codes; a value is issued once and never reused.';

create or replace function public.allocate_login_id(p_scope text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.login_id_counters as c (scope, next_value)
  values (p_scope, 2)
  on conflict (scope) do update set next_value = c.next_value + 1
  returning case when xmax = 0 then 1 else c.next_value - 1 end into v_next;
  -- Pad single digits only. lpad() truncates anything longer than its width, so lpad('100', 2)
  -- would silently return '10' and hand out a code that is already taken.
  return p_prefix || case when v_next < 10 then '0' || v_next::text else v_next::text end;
end;
$$;

revoke all on function public.allocate_login_id(text, text) from public, anon, authenticated;
grant execute on function public.allocate_login_id(text, text) to service_role;
