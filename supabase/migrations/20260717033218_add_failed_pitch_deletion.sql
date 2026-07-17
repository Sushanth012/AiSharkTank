create or replace function public.delete_failed_pitch(p_submission_id uuid)
returns table(video_path text, deck_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.submissions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id
    and user_id = v_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Pitch not found' using errcode = 'P0002';
  end if;
  if v_submission.status <> 'failed' then
    raise exception 'Only failed pitches can be deleted' using errcode = 'P0001';
  end if;

  update public.submissions
  set startup_name = 'Deleted pitch',
      founder_name = 'Deleted founder',
      video_path = '',
      deck_path = '',
      profile = '{}'::jsonb,
      error_message = null,
      deleted_at = now()
  where id = p_submission_id;

  return query select v_submission.video_path, v_submission.deck_path;
end;
$$;

revoke all on function public.delete_failed_pitch(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_failed_pitch(uuid) to authenticated;
