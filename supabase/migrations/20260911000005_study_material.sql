-- Study material: cards (Markdown) or PDFs, localized per language, with per-learner progress.

create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  type text not null check (type in ('card', 'pdf')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger study_materials_set_updated_at
  before update on public.study_materials
  for each row execute function public.set_updated_at();

create trigger study_materials_audit
  after insert or update or delete on public.study_materials
  for each row execute function public.audit_row_change();

create table public.study_material_localizations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.study_materials (id) on delete cascade,
  language text not null check (language in ('th', 'en', 'zh')),
  title text not null,
  body text,
  file_path text,
  tts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, language)
);

create trigger study_material_localizations_set_updated_at
  before update on public.study_material_localizations
  for each row execute function public.set_updated_at();

create trigger study_material_localizations_audit
  after insert or update or delete on public.study_material_localizations
  for each row execute function public.audit_row_change();

create table public.study_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.study_materials (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, material_id)
);

alter table public.study_materials enable row level security;
alter table public.study_material_localizations enable row level security;
alter table public.study_progress enable row level security;

create policy "study: learners read active materials"
  on public.study_materials for select
  to authenticated
  using (active);

create policy "study: admins do everything"
  on public.study_materials for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "study loc: learners read localizations of active materials"
  on public.study_material_localizations for select
  to authenticated
  using (
    exists (
      select 1 from public.study_materials m
      where m.id = study_material_localizations.material_id and m.active
    )
  );

create policy "study loc: admins do everything"
  on public.study_material_localizations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "progress: learners read their own"
  on public.study_progress for select
  to authenticated
  using (user_id = auth.uid());

create policy "progress: learners insert their own"
  on public.study_progress for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "progress: learners update their own"
  on public.study_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "progress: admins read"
  on public.study_progress for select
  to authenticated
  using (public.is_admin());

-- Private buckets: study PDFs and the Thai read-aloud cache. Learners get signed URLs from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('study-materials', 'study-materials', false, 20971520, array['application/pdf']),
  ('tts-cache', 'tts-cache', false, 10485760, array['audio/mpeg']);

create policy "study files: admins do everything"
  on storage.objects for all
  to authenticated
  using (bucket_id in ('study-materials', 'tts-cache') and public.is_admin())
  with check (bucket_id in ('study-materials', 'tts-cache') and public.is_admin());
