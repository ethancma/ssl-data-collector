-- Display names for every non-pending profile, readable by any active member.
-- core.profiles RLS only returns a user's own row (or all rows to an admin), so this
-- view is the only way other roles can see who recorded a log entry.

-- Owner-rights on purpose (no security_invoker): it must read other users' profile rows
-- that RLS hides from the caller. Supabase's advisor flags this as security_definer_view;
-- it is safe because the view exposes only id and display_name and requires an active member.
create view core.v_profile_names
with (security_barrier = true) as
select id, display_name
from core.profiles
where status <> 'pending'
  and (select core.is_active_member());

-- native_role_grants gives admin and technician ALL on every new core object. A
-- single-table owner-rights view is auto-updatable, so that would let them UPDATE any
-- profile through it and bypass profiles RLS. Reset everything, then grant read only.
revoke all on core.v_profile_names
  from public, anon, authenticated, admin, technician, volunteer, viewer;
grant select on core.v_profile_names to admin, technician, volunteer, viewer;
