-- The public security-invoker wrapper runs as service_role and must be able to
-- call the private security-definer implementation. The private schema is not
-- exposed through PostgREST, and client roles remain explicitly denied.
grant execute on function private.grant_admin_credits(uuid, integer, text, uuid, text)
  to service_role;
