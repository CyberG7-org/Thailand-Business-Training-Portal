-- P15a: what a learner does is visible to their own manager and to the admin.

drop policy "assignments: admins do everything" on public.user_dbd_assignments;
create policy "assignments: admins and owning managers" on public.user_dbd_assignments
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)))
  with check (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "eligibility: admins read" on public.eligibility_snapshots;
create policy "eligibility: admins and owning managers read" on public.eligibility_snapshots
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "attempts: admins read" on public.assessment_attempts;
create policy "attempts: admins and owning managers read" on public.assessment_attempts
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "answers: admins read" on public.assessment_answers;
create policy "answers: admins and owning managers read" on public.assessment_answers
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.assessment_attempts t
      where t.id = assessment_answers.attempt_id and public.in_my_team(t.user_id)
    ))
  );

drop policy "progress: admins read" on public.study_progress;
create policy "progress: admins and owning managers read" on public.study_progress
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "calls: admins read" on public.call_sessions;
create policy "calls: admins and owning managers read" on public.call_sessions
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "name cards: admins read" on public.name_cards;
create policy "name cards: admins and owning managers read" on public.name_cards
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

-- Recording and name-card objects are keyed by the learner's id.
drop policy "recordings bucket: admins do everything" on storage.objects;
create policy "recordings bucket: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'recordings' and (
      public.is_admin()
      or (public.is_manager() and public.in_my_team(nullif(split_part(name, '/', 1), '')::uuid))
    )
  )
  with check (bucket_id = 'recordings' and public.is_admin());

drop policy "name cards bucket: admins do everything" on storage.objects;
create policy "name cards bucket: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'name-cards' and (
      public.is_admin()
      or (public.is_manager() and public.in_my_team(nullif(split_part(name, '/', 1), '')::uuid))
    )
  )
  with check (bucket_id = 'name-cards' and public.is_admin());
