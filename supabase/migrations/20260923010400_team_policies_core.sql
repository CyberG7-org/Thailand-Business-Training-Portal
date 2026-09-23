-- P15a: people, companies and their files become team-scoped (spec §6). The admin keeps
-- everything; a manager gets exactly their own team.

-- A manager creates, suspends and edits their own learners. Deleting a person is the admin's
-- alone: a profile carries exam history and audit entries that must outlive the account
-- (spec §3.3), so `for all` would have handed a manager an irreversible cascade.
drop policy "profiles: admins do everything" on public.profiles;
create policy "profiles: admins do everything" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "profiles: managers read their team" on public.profiles
  for select to authenticated
  using (public.is_manager() and manager_id = public.my_team());

create policy "profiles: managers create learners" on public.profiles
  for insert to authenticated
  with check (public.is_manager() and manager_id = public.my_team());

create policy "profiles: managers update their learners" on public.profiles
  for update to authenticated
  using (public.is_manager() and manager_id = public.my_team())
  with check (public.is_manager() and manager_id = public.my_team());

drop policy "dbd: admins do everything" on public.dbd_records;
create policy "dbd: admins and owning managers" on public.dbd_records
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = public.my_team()))
  with check (public.is_admin() or (public.is_manager() and team_id = public.my_team()));

drop policy "dbd documents: admins do everything" on public.dbd_documents;
create policy "dbd documents: admins and owning managers" on public.dbd_documents
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and public.record_in_my_team(record_id)))
  -- The object key is '<record id>/<file>', so a row whose path names another record is how
  -- one team's pack gets read under another team's record.
  with check (
    public.is_admin() or (public.is_manager()
      and split_part(path, '/', 1) = record_id::text
      and public.record_in_my_team(record_id))
  );

-- Object keys are '<record id>/<file>', so the record id is guessable: scope the bucket too.
drop policy "dbd docs: admins do everything" on storage.objects;
create policy "dbd docs: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'dbd-documents'
    and (public.is_admin() or (public.is_manager() and public.key_record_is_my_team(name)))
  )
  with check (
    bucket_id = 'dbd-documents'
    and (public.is_admin() or (public.is_manager() and public.key_record_is_my_team(name)))
  );
