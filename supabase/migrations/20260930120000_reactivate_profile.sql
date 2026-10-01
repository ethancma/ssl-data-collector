-- Server-only restoration of access for an existing denied profile. Open
-- invitations are intentionally unchanged.

create function core.reactivate_profile(
	p_admin_auth_user_id uuid,
	p_profile_id int,
	p_role text
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, core
as $$
declare
	admin_profile_id int;
	target_profile core.profiles%rowtype;
	previous_flag text;
begin
	select id into admin_profile_id
	from core.profiles
	where auth_user_id = p_admin_auth_user_id
		and role = 'admin'
		and status = 'active'
	for share;
	if admin_profile_id is null then
		raise exception 'An active Admin is required.' using errcode = '42501';
	end if;

	if p_role is null or p_role not in ('admin', 'technician', 'volunteer', 'viewer') then
		raise exception 'A valid profile role is required.' using errcode = '23514';
	end if;

	select * into target_profile
	from core.profiles
	where id = p_profile_id
	for update;
	if not found then
		raise exception 'Profile not found.' using errcode = 'P0002';
	end if;
	if target_profile.id = admin_profile_id then
		raise exception 'An admin cannot reactivate their own profile.' using errcode = '42501';
	end if;
	if target_profile.status = 'active' then
		raise exception 'Profile is already active.' using errcode = '23514';
	end if;
	if target_profile.status = 'pending' then
		raise exception 'Profile is pending and cannot be reactivated.' using errcode = '23514';
	end if;
	if target_profile.status <> 'denied' then
		raise exception 'Only denied profiles can be reactivated.' using errcode = '23514';
	end if;

	previous_flag := current_setting('core.invitation_write', true);
	perform set_config('core.invitation_write', target_profile.auth_user_id::text, true);
	update core.profiles
	set status = 'active', role = p_role
	where id = target_profile.id;
	perform set_config('core.invitation_write', coalesce(previous_flag, ''), true);

	return target_profile.id;
end;
$$;

revoke all on function core.reactivate_profile(uuid, int, text)
from public, anon, authenticated, admin, technician, volunteer, viewer;
grant execute on function core.reactivate_profile(uuid, int, text)
to service_role;