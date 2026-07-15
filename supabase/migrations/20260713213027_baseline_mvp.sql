create extension if not exists "pgcrypto";

do $$
begin
  create type public.submission_status as enum ('queued', 'processing', 'complete', 'failed');
exception
  when duplicate_object then null;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.submissions (
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

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  content jsonb not null,
  recommendation text not null check (recommendation in ('Invest', 'Pass', 'Invest with Conditions')),
  overall_score integer not null check (overall_score between 0 and 100),
  created_at timestamptz not null default now()
);

create index submissions_user_created_idx on public.submissions(user_id, created_at desc);
create index reports_user_created_idx on public.reports(user_id, created_at desc);

create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function private.set_updated_at();

alter table public.submissions enable row level security;
alter table public.reports enable row level security;

grant select, insert, update, delete on public.submissions to authenticated;
grant select, insert, delete on public.reports to authenticated;

create policy "Users can view their submissions"
  on public.submissions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their submissions"
  on public.submissions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their submissions"
  on public.submissions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their submissions"
  on public.submissions for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their reports"
  on public.reports for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their reports"
  on public.reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their reports"
  on public.reports for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-videos', 'pitch-videos', false, 262144000,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pitch-decks', 'pitch-decks', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload their own pitch videos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pitch-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own pitch videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pitch-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own pitch videos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pitch-videos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can upload their own pitch decks"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pitch-decks'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own pitch decks"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pitch-decks'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own pitch decks"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pitch-decks'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
