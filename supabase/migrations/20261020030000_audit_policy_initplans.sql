-- Keep the existing audit visibility predicate, but evaluate the caller's stable
-- authorization helpers once per statement. Direct calls in an RLS filter were
-- repeated for every historical audit row (60k rows locally exceeded 8 seconds).
drop policy "audit: admins read all, managers read their team" on public.audit_logs;
create policy "audit: admins read all, managers read their team" on public.audit_logs
  for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_manager())
      and actor_id = any ((select public.my_team_member_ids())::uuid[]))
  );
