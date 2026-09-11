-- Fixes an outage: the custom access token hook migration
-- (20260910140000_custom_access_token_hook.sql) granted EXECUTE on
-- core.custom_access_token_hook to supabase_auth_admin but never granted USAGE
-- on schema core to that role. Without schema USAGE, GoTrue (which runs the
-- hook as supabase_auth_admin) can't resolve the function at all, so every
-- login fails with "Error running hook URI:
-- pg-functions://postgres/core/custom_access_token_hook" — confirmed present
-- on hosted via a read-only query (has_schema_privilege returned false for
-- supabase_auth_admin on schema core) even though the function, its EXECUTE
-- grant, and all 4 native roles already exist there.

grant usage on schema core to supabase_auth_admin;
