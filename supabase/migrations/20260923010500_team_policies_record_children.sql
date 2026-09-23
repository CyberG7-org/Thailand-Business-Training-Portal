-- P15a: transcripts, chunks, cached sweeps and jobs follow the record they belong to.

drop policy "dbd pages: admins read" on public.dbd_pages;
create policy "dbd pages: admins and owning managers read" on public.dbd_pages
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_documents d
      join public.dbd_records r on r.id = d.record_id
      where d.id = dbd_pages.document_id and r.team_id = public.my_team()
    ))
  );

drop policy "dbd chunks: admins read" on public.dbd_chunks;
create policy "dbd chunks: admins and owning managers read" on public.dbd_chunks
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_chunks.record_id and r.team_id = public.my_team()
    ))
  );

drop policy "dbd sweeps: admins read" on public.dbd_sweeps;
create policy "dbd sweeps: admins and owning managers read" on public.dbd_sweeps
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_documents d
      join public.dbd_records r on r.id = d.record_id
      where d.id = dbd_sweeps.document_id and r.team_id = public.my_team()
    ))
  );

drop policy "index jobs: admins do everything" on public.index_jobs;
create policy "index jobs: admins and owning managers" on public.index_jobs
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = index_jobs.record_id and r.team_id = public.my_team()
    ))
  )
  with check (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = index_jobs.record_id and r.team_id = public.my_team()
    ))
  );
