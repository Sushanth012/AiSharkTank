-- Durable pitch processing. Client sessions may read their reports, but only the
-- service-role worker may create or settle them.
revoke insert on table public.reports from authenticated;
drop policy if exists "Users can insert their reports" on public.reports;

update storage.buckets
set file_size_limit = 25165824
where id = 'pitch-videos';

alter table public.pitch_jobs
  drop constraint if exists pitch_jobs_attempt_check;

alter table public.pitch_jobs
  alter column attempt set default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists claim_token uuid;

alter table public.submissions
  add column if not exists artifact_status text not null default 'pending',
  add column if not exists artifact_metrics jsonb not null default '{}'::jsonb,
  add column if not exists artifact_processed_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.submissions
  add constraint submissions_artifact_status_check
  check (artifact_status in ('pending', 'processing', 'complete', 'failed'));

alter table public.pitch_jobs
  add constraint pitch_jobs_attempt_check check (attempt >= 0),
  add constraint pitch_jobs_max_attempts_check check (max_attempts between 1 and 10),
  add constraint pitch_jobs_attempt_cap_check check (attempt <= max_attempts);

create unique index if not exists pitch_jobs_claim_token_idx
  on public.pitch_jobs(claim_token)
  where claim_token is not null;

create or replace function private.enqueue_pitch_job(
  p_submission_id uuid,
  p_tier public.pitch_tier,
  p_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.submissions
    where id = p_submission_id and user_id = v_user_id and status = 'queued'
    for update
  ) then
    raise exception 'Submission is not reservable' using errcode = 'P0001';
  end if;

  v_reservation_id := private.reserve_pitch_entitlement(p_submission_id, p_tier);
  insert into public.pitch_jobs(
    id, user_id, submission_id, reservation_id, status, attempt
  ) values (
    p_job_id, v_user_id, p_submission_id, v_reservation_id, 'queued', 0
  );

  return p_job_id;
end;
$$;

create or replace function private.delete_pitch_report(p_report_id uuid)
returns table(video_path text, deck_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission_id uuid;
  v_video_path text;
  v_deck_path text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  delete from public.reports
  where id = p_report_id and user_id = v_user_id
  returning submission_id into v_submission_id;
  if v_submission_id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  select submissions.video_path, submissions.deck_path
  into v_video_path, v_deck_path
  from public.submissions
  where id = v_submission_id and user_id = v_user_id
  for update;

  update public.submissions
  set startup_name = 'Deleted pitch',
      founder_name = 'Deleted founder',
      video_path = '',
      deck_path = '',
      profile = '{}'::jsonb,
      error_message = null,
      deleted_at = now()
  where id = v_submission_id and user_id = v_user_id;

  return query select v_video_path, v_deck_path;
end;
$$;

create or replace function public.enqueue_pitch_job(
  p_submission_id uuid,
  p_tier public.pitch_tier,
  p_job_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.enqueue_pitch_job(p_submission_id, p_tier, p_job_id);
$$;

create or replace function public.delete_pitch_report(p_report_id uuid)
returns table(video_path text, deck_path text)
language sql
security invoker
set search_path = ''
as $$ select * from private.delete_pitch_report(p_report_id); $$;

create or replace function private.claim_pitch_job()
returns public.pitch_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_job public.pitch_jobs%rowtype;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  with candidate as (
    select id
    from public.pitch_jobs
    where status = 'queued' and attempt < max_attempts
    order by created_at, id
    for update skip locked
    limit 1
  )
  update public.pitch_jobs jobs
  set status = 'processing',
      attempt = jobs.attempt + 1,
      claimed_at = now(),
      heartbeat_at = now(),
      claim_token = gen_random_uuid(),
      error_code = null,
      error_message = null
  from candidate
  where jobs.id = candidate.id
  returning jobs.* into v_job;

  if v_job.id is not null then
    update public.submissions
      set status = 'processing', error_message = null
      where id = v_job.submission_id and status <> 'complete';
  end if;

  return v_job;
end;
$$;

create or replace function private.heartbeat_pitch_job(
  p_job_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_updated integer;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.pitch_jobs
    set heartbeat_at = now()
    where id = p_job_id
      and status = 'processing'
      and claim_token = p_claim_token;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function private.retry_or_fail_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true
)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_job public.pitch_jobs%rowtype;
  v_status public.job_status;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_job
  from public.pitch_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Pitch job not found' using errcode = 'P0001';
  end if;
  if v_job.status in ('complete', 'failed', 'dead_letter') then
    return v_job.status;
  end if;
  if v_job.status <> 'processing' or v_job.claim_token is distinct from p_claim_token then
    raise exception 'Pitch job lease is no longer owned' using errcode = 'P0001';
  end if;

  if p_retryable and v_job.attempt < v_job.max_attempts then
    v_status := 'queued';
    update public.pitch_jobs
      set status = v_status,
          claimed_at = null,
          heartbeat_at = null,
          claim_token = null,
          error_code = left(p_error_code, 100),
          error_message = left(p_error_message, 500)
      where id = v_job.id;
    update public.submissions
      set status = 'queued', error_message = null
      where id = v_job.submission_id and status <> 'complete';
  else
    v_status := case when p_retryable then 'dead_letter' else 'failed' end;
    perform private.settle_pitch_reservation(
      v_job.reservation_id,
      'released',
      case when p_retryable then 'attempts_exhausted' else p_error_code end
    );
    update public.pitch_jobs
      set status = v_status,
          finished_at = now(),
          heartbeat_at = now(),
          claim_token = null,
          error_code = left(p_error_code, 100),
          error_message = left(p_error_message, 500)
      where id = v_job.id;
    update public.submissions
      set status = 'failed', error_message = left(p_error_message, 500)
      where id = v_job.submission_id and status <> 'complete';
  end if;

  return v_status;
end;
$$;

create or replace function private.complete_claimed_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_report_id uuid,
  p_content jsonb,
  p_recommendation text,
  p_overall_score integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_job public.pitch_jobs%rowtype;
  v_report_id uuid;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_job
  from public.pitch_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Pitch job not found' using errcode = 'P0001';
  end if;
  if v_job.status = 'complete' then
    select id into v_report_id
    from public.reports
    where submission_id = v_job.submission_id;
    return v_report_id;
  end if;
  if v_job.status <> 'processing' or v_job.claim_token is distinct from p_claim_token then
    raise exception 'Pitch job lease is no longer owned' using errcode = 'P0001';
  end if;

  v_report_id := private.complete_pitch_job(
    p_job_id, p_report_id, p_content, p_recommendation, p_overall_score
  );
  update public.pitch_jobs set claim_token = null where id = p_job_id;
  return v_report_id;
end;
$$;

create or replace function private.reconcile_stale_pitch_jobs(
  p_stale_seconds integer default 600,
  p_limit integer default 50
)
returns table(requeued integer, dead_lettered integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_job public.pitch_jobs%rowtype;
  v_requeued integer := 0;
  v_dead_lettered integer := 0;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_stale_seconds < 60 or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid reconciliation bounds' using errcode = '22023';
  end if;

  for v_job in
    select *
    from public.pitch_jobs
    where status = 'processing'
      and coalesce(heartbeat_at, claimed_at, updated_at) < now() - make_interval(secs => p_stale_seconds)
    order by coalesce(heartbeat_at, claimed_at, updated_at), id
    for update skip locked
    limit p_limit
  loop
    if v_job.attempt < v_job.max_attempts then
      update public.pitch_jobs
        set status = 'queued', claimed_at = null, heartbeat_at = null,
            claim_token = null, error_code = 'stale_lease',
            error_message = 'Worker lease expired before completion.'
        where id = v_job.id;
      update public.submissions
        set status = 'queued', error_message = null
        where id = v_job.submission_id and status <> 'complete';
      v_requeued := v_requeued + 1;
    else
      perform private.settle_pitch_reservation(
        v_job.reservation_id, 'released', 'attempts_exhausted'
      );
      update public.pitch_jobs
        set status = 'dead_letter', finished_at = now(), heartbeat_at = now(),
            claim_token = null, error_code = 'stale_lease',
            error_message = 'Worker lease expired and the attempt limit was reached.'
        where id = v_job.id;
      update public.submissions
        set status = 'failed', error_message = 'Pitch processing attempts were exhausted.'
        where id = v_job.submission_id and status <> 'complete';
      v_dead_lettered := v_dead_lettered + 1;
    end if;
  end loop;

  return query select v_requeued, v_dead_lettered;
end;
$$;

create or replace function public.claim_pitch_job()
returns public.pitch_jobs
language sql
security invoker
set search_path = ''
as $$ select private.claim_pitch_job(); $$;

create or replace function public.heartbeat_pitch_job(p_job_id uuid, p_claim_token uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.heartbeat_pitch_job(p_job_id, p_claim_token); $$;

create or replace function public.retry_or_fail_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true
)
returns public.job_status
language sql
security invoker
set search_path = ''
as $$
  select private.retry_or_fail_pitch_job(
    p_job_id, p_claim_token, p_error_code, p_error_message, p_retryable
  );
$$;

create or replace function public.complete_claimed_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_report_id uuid,
  p_content jsonb,
  p_recommendation text,
  p_overall_score integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.complete_claimed_pitch_job(
    p_job_id, p_claim_token, p_report_id, p_content, p_recommendation, p_overall_score
  );
$$;

create or replace function public.reconcile_stale_pitch_jobs(
  p_stale_seconds integer default 600,
  p_limit integer default 50
)
returns table(requeued integer, dead_lettered integer)
language sql
security invoker
set search_path = ''
as $$ select * from private.reconcile_stale_pitch_jobs(p_stale_seconds, p_limit); $$;

revoke all on function private.claim_pitch_job() from public, anon, authenticated, service_role;
revoke all on function private.heartbeat_pitch_job(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_stale_pitch_jobs(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.claim_pitch_job() from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_pitch_job(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_stale_pitch_jobs(integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_pitch_job(uuid, public.pitch_tier, uuid) from public, anon, authenticated, service_role;
revoke all on function private.delete_pitch_report(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_pitch_job(uuid, public.pitch_tier, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_pitch_report(uuid) from public, anon, authenticated, service_role;

grant execute on function private.claim_pitch_job() to service_role;
grant execute on function private.heartbeat_pitch_job(uuid, uuid) to service_role;
grant execute on function private.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean) to service_role;
grant execute on function private.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer) to service_role;
grant execute on function private.reconcile_stale_pitch_jobs(integer, integer) to service_role;
grant execute on function public.claim_pitch_job() to service_role;
grant execute on function public.heartbeat_pitch_job(uuid, uuid) to service_role;
grant execute on function public.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer) to service_role;
grant execute on function public.reconcile_stale_pitch_jobs(integer, integer) to service_role;
grant execute on function private.enqueue_pitch_job(uuid, public.pitch_tier, uuid) to authenticated;
grant execute on function private.delete_pitch_report(uuid) to authenticated;
grant execute on function public.enqueue_pitch_job(uuid, public.pitch_tier, uuid) to authenticated;
grant execute on function public.delete_pitch_report(uuid) to authenticated;
