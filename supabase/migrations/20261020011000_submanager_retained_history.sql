-- Conversion retains identity/history, not the learner's self-service permissions.
-- Do not use NOT is_submanager(): that helper is false for a suspended parent,
-- which would accidentally restore access. Read the authoritative role instead.
alter policy "assignments: learners read their own" on public.user_dbd_assignments
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "eligibility: learners read their own" on public.eligibility_snapshots
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "dbd: learners read their assigned record" on public.dbd_records
  using ((select role from public.profiles where id = auth.uid()) <> 'submanager'
    and exists (select 1 from public.user_dbd_assignments a
      where a.dbd_record_id = dbd_records.id and a.user_id = auth.uid() and a.active));

alter policy "training versions: learners read their pinned version" on public.company_training_versions
  using ((select role from public.profiles where id = auth.uid()) <> 'submanager'
    and exists (select 1 from public.user_dbd_assignments a
      where a.training_version_id = company_training_versions.id
        and a.user_id = auth.uid() and a.active));

alter policy "attempts: learners read their own" on public.assessment_attempts
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "answers: learners read their own" on public.assessment_answers
  using ((select role from public.profiles where id = auth.uid()) <> 'submanager'
    and exists (select 1 from public.assessment_attempts a
      where a.id = assessment_answers.attempt_id and a.user_id = auth.uid()));

alter policy "interviews: learners read their own" on public.interview_sessions
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "interview turns: learners read their own" on public.interview_turns
  using ((select role from public.profiles where id = auth.uid()) <> 'submanager'
    and exists (select 1 from public.interview_sessions s
      where s.id = interview_turns.session_id and s.user_id = auth.uid()));

alter policy "appointments: learners read their own" on public.appointments
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "name cards: learners read their own" on public.name_cards
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');

alter policy "progress: learners read their own" on public.study_progress
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');
alter policy "progress: learners insert their own" on public.study_progress
  with check (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');
alter policy "progress: learners update their own" on public.study_progress
  using (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager')
  with check (user_id = auth.uid() and
    (select role from public.profiles where id = auth.uid()) <> 'submanager');
