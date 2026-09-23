-- P15a: transcripts, chunks, cached sweeps and jobs follow the record they belong to.

drop policy "dbd pages: admins read" on public.dbd_pages;
create policy "dbd pages: admins and owning managers read" on public.dbd_pages
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and public.document_in_my_team(dbd_pages.document_id))
  );

drop policy "dbd chunks: admins read" on public.dbd_chunks;
create policy "dbd chunks: admins and owning managers read" on public.dbd_chunks
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and public.record_in_my_team(dbd_chunks.record_id))
  );

drop policy "dbd sweeps: admins read" on public.dbd_sweeps;
create policy "dbd sweeps: admins and owning managers read" on public.dbd_sweeps
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and public.document_in_my_team(dbd_sweeps.document_id))
  );

drop policy "index jobs: admins do everything" on public.index_jobs;
create policy "index jobs: admins and owning managers" on public.index_jobs
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager() and public.record_in_my_team(index_jobs.record_id))
  )
  with check (
    public.is_admin() or (public.is_manager()
      and public.record_in_my_team(index_jobs.record_id)
      -- The worker writes a document's text under the job's record_id, so a job whose two
      -- sides name different teams is how one team's pack ends up in another's index.
      and (index_jobs.document_id is null or public.document_in_my_team(index_jobs.document_id))
    )
  );
