create or replace function core.matches_live_profile_role()
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
			and role = (select auth.jwt() ->> 'role')
			and role in ('admin', 'technician', 'volunteer', 'viewer')
	);
$$;
