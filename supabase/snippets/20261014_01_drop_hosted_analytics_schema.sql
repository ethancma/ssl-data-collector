-- Run manually in the linked project's Supabase SQL Editor, AFTER removing `analytics` from
-- Dashboard > Settings > API > Exposed schemas and Extra search path. Dropping it first would
-- leave the Data API pointing at a missing schema (PGRST002 on every request).
-- Drops only the unused analytics reporting schema; core, public, and auth are untouched.
-- Its live_native_role policies, grants, and default privileges go with it.

begin;

drop schema if exists analytics cascade;

commit;

-- Expect no rows.
select nspname from pg_namespace where nspname = 'analytics';
