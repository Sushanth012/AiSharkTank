create function private.complete_pitch_job(
  p_job_id uuid,
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

  select * into v_job from public.pitch_jobs where id = p_job_id for update;
  if not found then raise exception 'Pitch job not found' using errcode = 'P0001'; end if;
  if v_job.status = 'complete' then
    select id into v_report_id from public.reports where submission_id = v_job.submission_id;
    return v_report_id;
  end if;
  if v_job.status not in ('queued', 'processing') then
    raise exception 'Pitch job is not completable' using errcode = 'P0001';
  end if;

  insert into public.reports(id, user_id, submission_id, content, recommendation, overall_score)
  values (p_report_id, v_job.user_id, v_job.submission_id, p_content, p_recommendation, p_overall_score)
  on conflict (submission_id) do update set
    content = excluded.content,
    recommendation = excluded.recommendation,
    overall_score = excluded.overall_score
  returning id into v_report_id;

  perform private.settle_pitch_reservation(v_job.reservation_id, 'consumed', null);

  update public.submissions
    set status = 'complete', error_message = null
    where id = v_job.submission_id;
  update public.pitch_jobs
    set status = 'complete', finished_at = now(), heartbeat_at = now(),
        error_code = null, error_message = null
    where id = v_job.id;
  return v_report_id;
end;
$$;

create function private.fail_pitch_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
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

  select * into v_job from public.pitch_jobs where id = p_job_id for update;
  if not found or v_job.status in ('complete', 'failed', 'dead_letter') then return; end if;

  perform private.settle_pitch_reservation(v_job.reservation_id, 'released', p_error_code);
  update public.submissions
    set status = 'failed', error_message = left(p_error_message, 500)
    where id = v_job.submission_id;
  update public.pitch_jobs
    set status = 'failed', finished_at = now(), heartbeat_at = now(),
        error_code = left(p_error_code, 100), error_message = left(p_error_message, 500)
    where id = v_job.id;
end;
$$;

revoke all on function private.complete_pitch_job(uuid, uuid, jsonb, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.fail_pitch_job(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.complete_pitch_job(uuid, uuid, jsonb, text, integer) to service_role;
grant execute on function private.fail_pitch_job(uuid, text, text) to service_role;

create function public.complete_pitch_job(
  p_job_id uuid,
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
  select private.complete_pitch_job(
    p_job_id, p_report_id, p_content, p_recommendation, p_overall_score
  );
$$;

create function public.fail_pitch_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.fail_pitch_job(p_job_id, p_error_code, p_error_message);
$$;

revoke all on function public.complete_pitch_job(uuid, uuid, jsonb, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_pitch_job(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_pitch_job(uuid, uuid, jsonb, text, integer) to service_role;
grant execute on function public.fail_pitch_job(uuid, text, text) to service_role;
