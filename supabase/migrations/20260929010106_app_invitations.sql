-- App-managed invitations (docs/auth-invitations.md, option B). The raw token
-- never reaches the database; only its SHA-256 hex digest is stored. Clients have
-- no table access; a trusted server calls the service_role-only RPCs below.

create table core.invitations (
	id int generated always as identity primary key,
	email text not null,
	role text not null check (role in ('admin', 'technician', 'volunteer', 'viewer')),
	token_hash text not null unique,
	created_by int not null references core.profiles (id) on delete restrict,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null default now() + interval '7 days',
	revoked_at timestamptz,
	accepted_at timestamptz,
	accepted_auth_user_id uuid references auth.users (id) on delete set null,
	emailed_at timestamptz,
	constraint invitations_email_check check (email = lower(btrim(email)) and email like '_%@_%'),
	constraint invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
	constraint invitations_expiry_check check (expires_at > created_at),
	constraint invitations_terminal_state_check check (
		not (revoked_at is not null and accepted_at is not null)
		and (accepted_auth_user_id is null or accepted_at is not null)
	)
);

create unique index invitations_one_open_per_email_idx
	on core.invitations (email)
	where revoked_at is null and accepted_at is null;
create index invitations_created_by_idx on core.invitations (created_by);
create index invitations_accepted_auth_user_id_idx on core.invitations (accepted_auth_user_id);

alter table core.invitations enable row level security;

-- Default privileges hand new core tables to admin/technician; invitations are server-only.
revoke all on core.invitations from public, anon, authenticated, admin, technician, volunteer, viewer;
grant select on core.invitations to service_role;

create function core.create_invitation(
	p_admin_auth_user_id uuid,
	p_email text,
	p_role text,
	p_token_hash text,
	p_expires_at timestamptz default null
)
	returns int
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	admin_profile_id int;
	normalized_email text := lower(btrim(p_email));
	new_id int;
begin
	select id into admin_profile_id
	from core.profiles
	where auth_user_id = p_admin_auth_user_id and role = 'admin' and status = 'active'
	for share;
	if admin_profile_id is null then
		raise exception 'An active Admin is required.' using errcode = '42501';
	end if;

	if normalized_email is null or normalized_email not like '_%@_%'
		or p_role is null or p_role not in ('admin', 'technician', 'volunteer', 'viewer')
		or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
		or (p_expires_at is not null and p_expires_at <= now())
	then
		raise exception 'A valid email, role, token hash, and future expiry are required.'
			using errcode = '23514';
	end if;

	if exists (
		select 1 from core.profiles
		where lower(email) = normalized_email and status = 'active'
	) then
		raise exception 'This email already has an active account.' using errcode = '23505';
	end if;

	-- An expired, never-revoked invite still occupies the unique slot; retire it.
	update core.invitations
	set revoked_at = now()
	where email = normalized_email
		and revoked_at is null and accepted_at is null and expires_at <= now();

	if exists (
		select 1 from core.invitations
		where email = normalized_email and revoked_at is null and accepted_at is null
	) then
		raise exception 'This email already has an open invitation.' using errcode = '23505';
	end if;

	insert into core.invitations (email, role, token_hash, created_by, expires_at)
	values (
		normalized_email, p_role, p_token_hash, admin_profile_id,
		coalesce(p_expires_at, now() + interval '7 days')
	)
	returning id into new_id;
	return new_id;
end;
$$;

create function core.revoke_invitation(p_admin_auth_user_id uuid, p_invitation_id int)
	returns boolean
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	invitation core.invitations%rowtype;
begin
	perform 1
	from core.profiles
	where auth_user_id = p_admin_auth_user_id and role = 'admin' and status = 'active'
	for share;
	if not found then
		raise exception 'An active Admin is required.' using errcode = '42501';
	end if;

	select * into invitation from core.invitations where id = p_invitation_id for update;
	if not found then
		raise exception 'Invitation not found.' using errcode = 'P0002';
	end if;
	if invitation.accepted_at is not null then
		raise exception 'An accepted invitation cannot be revoked.' using errcode = '23514';
	end if;
	if invitation.revoked_at is not null then
		return false;
	end if;

	update core.invitations set revoked_at = now() where id = invitation.id;
	return true;
end;
$$;

-- The invite row is locked, so a link can be consumed only once under concurrency.
create function core.accept_invitation(p_token_hash text, p_auth_user_id uuid)
	returns int
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	invitation core.invitations%rowtype;
	auth_email text;
	auth_email_confirmed_at timestamptz;
	target_profile core.profiles%rowtype;
	previous_flag text;
begin
	select * into invitation
	from core.invitations where token_hash = lower(p_token_hash) for update;
	if not found then
		raise exception 'Invitation not found.' using errcode = 'P0002';
	end if;
	if invitation.accepted_at is not null then
		raise exception 'This invitation has already been used.' using errcode = '23514';
	end if;
	if invitation.revoked_at is not null then
		raise exception 'This invitation was revoked.' using errcode = '23514';
	end if;
	if invitation.expires_at <= now() then
		raise exception 'This invitation has expired.' using errcode = '23514';
	end if;

	select email, email_confirmed_at into auth_email, auth_email_confirmed_at
	from auth.users where id = p_auth_user_id;
	if auth_email is null or auth_email_confirmed_at is null
		or lower(btrim(auth_email)) <> invitation.email
	then
		raise exception 'The account email does not match this invitation.' using errcode = '42501';
	end if;

	select * into target_profile
	from core.profiles where auth_user_id = p_auth_user_id for update;
	if not found then
		raise exception 'No profile exists for this account.' using errcode = 'P0002';
	end if;
	if target_profile.status = 'active' then
		raise exception 'This account is already active.' using errcode = '23505';
	end if;

	previous_flag := current_setting('core.invitation_write', true);
	perform set_config('core.invitation_write', p_auth_user_id::text, true);
	update core.profiles
	set status = 'active', role = invitation.role
	where id = target_profile.id;
	perform set_config('core.invitation_write', coalesce(previous_flag, ''), true);

	update core.invitations
	set accepted_at = now(), accepted_auth_user_id = p_auth_user_id
	where id = invitation.id;
	return target_profile.id;
end;
$$;

grant usage on schema core to service_role;
revoke all on function
	core.create_invitation(uuid, text, text, text, timestamptz),
	core.revoke_invitation(uuid, int),
	core.accept_invitation(text, uuid)
	from public, anon, authenticated, admin, technician, volunteer, viewer;
grant execute on function
	core.create_invitation(uuid, text, text, text, timestamptz),
	core.revoke_invitation(uuid, int),
	core.accept_invitation(text, uuid)
	to service_role;
