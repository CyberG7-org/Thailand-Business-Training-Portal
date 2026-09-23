-- P15a: people, companies and their files become team-scoped (spec §6). The admin keeps
-- everything; a manager gets exactly their own team.

drop policy "profiles: admins do everything" on public.profiles;
create policy "profiles: admins and owning managers" on public.profiles
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and manager_id = public.my_team()))
  with check (public.is_admin() or (public.is_manager() and manager_id = public.my_team()));

drop policy "dbd: admins do everything" on public.dbd_records;
create policy "dbd: admins and owning managers" on public.dbd_records
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = public.my_team()))
  with check (public.is_admin() or (public.is_manager() and team_id = public.my_team()));

drop policy "dbd documents: admins do everything" on public.dbd_documents;
create policy "dbd documents: admins and owning managers" on public.dbd_documents
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_documents.record_id and r.team_id = public.my_team()
    ))
  )
  with check (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_documents.record_id and r.team_id = public.my_team()
    ))
  );

-- Object keys are '<record id>/<file>', so the record id is guessable: scope the bucket too.
drop policy "dbd docs: admins do everything" on storage.objects;
create policy "dbd docs: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'dbd-documents' and (
      public.is_admin() or (public.is_manager() and exists (
        select 1 from public.dbd_records r
        where r.id::text = split_part(name, '/', 1) and r.team_id = public.my_team()
      ))
    )
  )
  with check (
    bucket_id = 'dbd-documents' and (
      public.is_admin() or (public.is_manager() and exists (
        select 1 from public.dbd_records r
        where r.id::text = split_part(name, '/', 1) and r.team_id = public.my_team()
      ))
    )
  );
