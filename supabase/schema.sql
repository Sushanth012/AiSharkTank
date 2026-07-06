create extension if not exists "pgcrypto";

do $$
begin
  create type public.submission_status as enum ('queued', 'processing', 'complete', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  startup_name text not null,
  founder_name text not null,
  status public.submission_status not null default 'queued',
  video_path text not null,
  deck_path text not null,
  profile jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  content jsonb not null,
  recommendation text not null,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  created_at timestamptz not null default now()
);

create index if not exists submissions_user_created_idx
  on public.submissions(user_id, created_at desc);

create index if not exists reports_user_created_idx
  on public.reports(user_id, created_at desc);

alter table public.submissions enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Users can view their submissions" on public.submissions;
create policy "Users can view their submissions"
  on public.submissions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their submissions" on public.submissions;
create policy "Users can insert their submissions"
  on public.submissions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their submissions" on public.submissions;
create policy "Users can update their submissions"
  on public.submissions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their submissions" on public.submissions;
create policy "Users can delete their submissions"
  on public.submissions for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their reports" on public.reports;
create policy "Users can view their reports"
  on public.reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their reports" on public.reports;
create policy "Users can insert their reports"
  on public.reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their reports" on public.reports;
create policy "Users can delete their reports"
  on public.reports for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-videos',
  'pitch-videos',
  false,
  262144000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-decks',
  'pitch-decks',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own pitch videos" on storage.objects;
create policy "Users can upload their own pitch videos"
  on storage.objects for insert
  with check (
    bucket_id = 'pitch-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can read their own pitch videos" on storage.objects;
create policy "Users can read their own pitch videos"
  on storage.objects for select
  using (
    bucket_id = 'pitch-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own pitch videos" on storage.objects;
create policy "Users can delete their own pitch videos"
  on storage.objects for delete
  using (
    bucket_id = 'pitch-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload their own pitch decks" on storage.objects;
create policy "Users can upload their own pitch decks"
  on storage.objects for insert
  with check (
    bucket_id = 'pitch-decks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can read their own pitch decks" on storage.objects;
create policy "Users can read their own pitch decks"
  on storage.objects for select
  using (
    bucket_id = 'pitch-decks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own pitch decks" on storage.objects;
create policy "Users can delete their own pitch decks"
  on storage.objects for delete
  using (
    bucket_id = 'pitch-decks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
