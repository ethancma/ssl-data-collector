-- Run manually in the linked project's Supabase SQL Editor, before `supabase db push`.
-- Drops only the superseded temp-password invite pieces; no operational data is touched.
-- Hosted holds no invite data: all 4 profiles are active and every invite column is null.

begin;

create or replace function core.guard_profile_invitation()
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

drop function if exists core.register_invitation(uuid, uuid, text);
drop function if exists core.activate_invitation(uuid);

alter table core.profiles
	drop constraint if exists profiles_invitation_check,
	drop constraint if exists profiles_status_check,
	add constraint profiles_status_check check (status in ('pending', 'active', 'denied')),
	drop column if exists invited_by,
	drop column if exists invited_at,
	drop column if exists invite_password_fingerprint,
	drop column if exists credential_changed_at;

commit;
