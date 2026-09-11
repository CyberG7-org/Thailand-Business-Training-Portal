-- P9: policy changes that move the bank window recompute eligibility for every active assignment
-- (a new snapshot row per learner; history is append-only, decision D31).

create or replace function public.recompute_eligibility_snapshots(p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select user_id, dbd_record_id from public.user_dbd_assignments where active
  loop
    perform public.compute_eligibility_snapshot(r.user_id, r.dbd_record_id, p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.recompute_eligibility_snapshots(text) from public;
grant execute on function public.recompute_eligibility_snapshots(text) to service_role;

create or replace function public.policy_config_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key in ('bank_eligibility_days', 'bank_access_expiry_days')
     and new.value is distinct from old.value then
    perform public.recompute_eligibility_snapshots('policy_changed');
  end if;
  return new;
end;
$$;

create trigger policy_config_eligibility_recompute
  after update of value on public.policy_config
  for each row execute function public.policy_config_after_update();

-- Audit views: actor lookups and per-actor listing.
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace view public.audit_logs_with_actor
with (security_invoker = true)
as
select a.id, a.actor_id, p.login_id as actor_login_id, a.action, a.entity_type, a.entity_id,
       a.before, a.after, a.created_at
from public.audit_logs a
left join public.profiles p on p.id = a.actor_id;

grant select on public.audit_logs_with_actor to authenticated;
