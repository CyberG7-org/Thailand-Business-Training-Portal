-- P15c review: two hardenings the whole-branch review asked for.
--
-- 1. Object keys a manager can write are used later by the service role (the index worker, the
--    extract job, the learner's signed download). The prefix check accepted '<own>/../<other>',
--    and dbd_records.document_path was never tied to its own record. Both are now shapes the
--    database refuses. NOT VALID: every existing key already has this shape, and a legacy row
--    must not fail the migration.
--
-- 2. Every team-scoped policy asked in_my_team(<column>) per row, which no index can serve: as a
--    manager, reading the audit log was a full scan with the check run on every row — measured at
--    ~2 s for 1,930 rows, and the authenticated role's 8 s statement timeout lands at roughly
--    8,000. The policies now compare the column to the team's member ids, computed once per
--    statement, so the existing (actor_id / user_id) indexes carry the read.

-- ---------------------------------------------------------------------------------------------
-- 1. Object keys stay under their own record
-- ---------------------------------------------------------------------------------------------

alter table public.dbd_documents
  add constraint dbd_documents_path_under_own_record
  check (
    path ~ '^[0-9a-f-]{36}/[^/]+$'
    and path !~ '(^|/)\.\.(/|$)'
    and split_part(path, '/', 1) = record_id::text
  ) not valid;

alter table public.dbd_records
  add constraint dbd_records_document_path_under_own_record
  check (
    document_path is null
    or (
      document_path ~ '^[0-9a-f-]{36}/[^/]+$'
      and split_part(document_path, '/', 1) = id::text
    )
  ) not valid;

-- ---------------------------------------------------------------------------------------------
-- 2. Team membership computed once, so the per-table indexes can be used
-- ---------------------------------------------------------------------------------------------

-- The caller's team as a set of profile ids: the manager and their learners. Empty for an admin
-- (who is let through by is_admin() before this is consulted) and for anyone with no team.
create or replace function public.my_team_member_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.profiles p
  where public.my_team() is not null
    and (p.id = public.my_team() or p.manager_id = public.my_team());
$$;
revoke all on function public.my_team_member_ids() from public, anon, authenticated;
grant execute on function public.my_team_member_ids() to authenticated, service_role;

drop policy "assignments: admins and owning managers" on public.user_dbd_assignments;
create policy "assignments: admins and owning managers" on public.user_dbd_assignments
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager()
      and user_id = any (public.my_team_member_ids())
      and public.record_in_my_team(dbd_record_id))
  )
  with check (
    public.is_admin() or (public.is_manager()
      and public.learner_of_my_team(user_id)
      and public.record_in_my_team(dbd_record_id))
  );

drop policy "eligibility: admins and owning managers read" on public.eligibility_snapshots;
create policy "eligibility: admins and owning managers read" on public.eligibility_snapshots
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

drop policy "attempts: admins and owning managers read" on public.assessment_attempts;
create policy "attempts: admins and owning managers read" on public.assessment_attempts
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

drop policy "answers: admins and owning managers read" on public.assessment_answers;
create policy "answers: admins and owning managers read" on public.assessment_answers
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.assessment_attempts t
      where t.id = assessment_answers.attempt_id
        and t.user_id = any (public.my_team_member_ids())
    ))
  );

drop policy "progress: admins and owning managers read" on public.study_progress;
create policy "progress: admins and owning managers read" on public.study_progress
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

drop policy "calls: admins and owning managers read" on public.call_sessions;
create policy "calls: admins and owning managers read" on public.call_sessions
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

drop policy "name cards: admins and owning managers read" on public.name_cards;
create policy "name cards: admins and owning managers read" on public.name_cards
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and user_id = any (public.my_team_member_ids()))
  );

drop policy "audit: admins read all, managers read their team" on public.audit_logs;
create policy "audit: admins read all, managers read their team" on public.audit_logs
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and actor_id = any (public.my_team_member_ids()))
  );
