-- P15a: one shared content library that managers help author (spec §4), while settings,
-- notifications and webhooks stay with the admin. The audit log shows a manager their own team.

drop policy "study: admins do everything" on public.study_materials;
create policy "study: staff do everything" on public.study_materials
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "study loc: admins do everything" on public.study_material_localizations;
create policy "study loc: staff do everything" on public.study_material_localizations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "questions: admins do everything" on public.questions;
create policy "questions: staff do everything" on public.questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "question loc: admins do everything" on public.question_localizations;
create policy "question loc: staff do everything" on public.question_localizations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "question batches: admins do everything" on public.question_generation_batches;
create policy "question batches: staff do everything" on public.question_generation_batches
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- The buckets are 'study-materials' and 'tts-cache' (migration 0005); there is no
-- 'study-files' bucket, and naming one would have left both of these with no policy at all.
drop policy "study files: admins do everything" on storage.objects;
create policy "study files: staff do everything" on storage.objects
  for all to authenticated
  using (bucket_id in ('study-materials', 'tts-cache') and public.is_staff())
  with check (bucket_id in ('study-materials', 'tts-cache') and public.is_staff());

-- A manager reads what their own team did; the admin reads everything.
drop policy "audit: admins read" on public.audit_logs;
create policy "audit: admins read all, managers read their team" on public.audit_logs
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(actor_id)));
