-- Custom Access Token Hook (Phase 2 of the RLS-to-native-roles migration,
-- platform-architecture.md §5): stamps the JWT's `claims.role` from
-- core.profiles.role so PostgREST can SET ROLE to one of the 4 native roles
-- created by the prior migration. supabase/config.toml already points at this
-- function (pg-functions://postgres/core/custom_access_token_hook) — it was
-- referenced before existing, which broke the local auth service; this
-- migration creates it.
--
-- Must never raise: an unhandled exception here blocks token issuance for
-- every user cluster-wide, not just the one being looked up, so the whole
-- lookup is wrapped in EXCEPTION WHEN OTHERS THEN RETURN event.

set local check_function_bodies = off;

create or replace function core.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = core
  as $$
declare
  profile_role text;
begin
  select role into profile_role
  from core.profiles
  where auth_user_id = (event->>'user_id')::uuid
    and status = 'active'
    and role in ('admin', 'technician', 'volunteer', 'viewer');

  if profile_role is not null then
    event := jsonb_set(
      event,
      '{claims,role}',
      to_jsonb(profile_role)
    );
  end if;

  return event;
exception
  when others then
    return event;
end;
$$;

-- Per Supabase's documented custom-access-token-hook pattern: only the auth
-- service may call this (it's how role escalation into admin happens), so
-- ordinary sessions must never be able to invoke it directly.
grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function core.custom_access_token_hook(jsonb) from public;
revoke execute on function core.custom_access_token_hook(jsonb) from anon;
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated;
