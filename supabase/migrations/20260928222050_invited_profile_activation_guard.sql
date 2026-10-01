-- Profile activation guard and live-role enforcement. Activating a profile is
-- server-managed (core.accept_invitation); existing active profiles are unaffected.

create function core.guard_profile_invitation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
	if new.auth_user_id is distinct from old.auth_user_id then
		raise exception 'Profile identity cannot be changed.' using errcode = '42501';
	end if;

	if new.status = 'active' and new.status is distinct from old.status
		and (current_user <> 'postgres'
			or current_setting('core.invitation_write', true) is distinct from new.auth_user_id::text)
	then
		raise exception 'Profile activation is server-managed.' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- Star-treatment RPCs write as SECURITY DEFINER and bypass table RLS; their
-- trigger must enforce the same live-role check on mutations from a user JWT.
create function core.guard_star_treatment_live_role()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
	if auth.uid() is not null and not core.matches_live_profile_role() then
		raise exception 'The current profile role does not match this session.'
			using errcode = '42501';
	end if;
	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

create trigger star_treatments_guard_live_role
	before insert or update or delete on core.star_treatments
	for each row execute function core.guard_star_treatment_live_role();

create trigger profiles_guard_invitation
	before update on core.profiles
	for each row execute function core.guard_profile_invitation();

revoke insert, delete on core.profiles
	from authenticated, admin, technician, volunteer, viewer;

-- The earlier self-update policy queried profiles from inside its own RLS check.
-- A definer lookup preserves its role/status restriction without recursive RLS.
create function core.profile_self_authorization_unchanged(p_role text, p_status text)
	returns boolean
	language sql
	stable
	security definer
	set search_path = pg_catalog, core
	as $$
	select exists (
		select 1 from core.profiles
		where auth_user_id = (select auth.uid())
			and role is not distinct from p_role
			and status is not distinct from p_status
	);
$$;

revoke all on function core.profile_self_authorization_unchanged(text, text)
	from public, anon, service_role;
grant execute on function core.profile_self_authorization_unchanged(text, text)
	to authenticated;

drop policy "profiles_update_self" on core.profiles;
create policy "profiles_update_self" on core.profiles
	for update to authenticated
	using (auth_user_id = (select auth.uid()))
	with check (
		auth_user_id = (select auth.uid())
		and core.profile_self_authorization_unchanged(role, status)
	);

-- Existing native-role JWTs survive token refresh delays. A restrictive policy
-- intersects every permissive policy, even on tables with broad grants/policies.
create function core.matches_live_profile_role()
	returns boolean
	language sql
	stable
	security definer
	set search_path = pg_catalog, core
	as $$
	select exists (
		select 1 from core.profiles
		where auth_user_id = (select auth.uid())
			and status = 'active'
			and role = current_setting('request.jwt.claim.role', true)
			and role in ('admin', 'technician', 'volunteer', 'viewer')
	);
$$;

revoke all on function core.matches_live_profile_role()
	from public, anon, authenticated, service_role;
grant execute on function core.matches_live_profile_role()
	to admin, technician, volunteer, viewer;

do $$
declare
	target record;
begin
	for target in
		select n.nspname, c.relname
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname in ('core', 'analytics')
			and c.relkind in ('r', 'p') and c.relrowsecurity
		union all select 'storage', 'objects'
	loop
		execute format(
			'create policy live_native_role on %I.%I as restrictive for all to admin, technician, volunteer, viewer using ((select core.matches_live_profile_role())) with check ((select core.matches_live_profile_role()))',
			target.nspname, target.relname
		);
	end loop;
end;
$$;
