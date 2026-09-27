-- P0 operational-log authorization, provenance, audit, and history retention.
--
-- Authenticated app writes are always normalized to the caller's active profile,
-- the server timestamp, and the live data source. Direct owner-level SQL is the
-- intentionally narrow import/seed escape hatch: postgres/supabase_admin sessions
-- may preserve explicit import provenance, but must provide a recorded/uploading
-- profile. Provenance is immutable after insert for every caller. Volunteer ownership
-- is the matching recorded_by/uploaded_by profile, without a time or data_source limit.

set local check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Token refresh after profile authorization changes.
-- The hook runs when Auth issues or refreshes a JWT. App-layer refresh-on-next-request
-- may therefore pick up a role/status change without this migration mutating
-- auth.sessions or revoking an already-issued token directly.
-- ---------------------------------------------------------------------------

create or replace function core.custom_access_token_hook(event jsonb)
	returns jsonb
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	safe_event jsonb := jsonb_build_object(
		'claims', jsonb_build_object('role', 'authenticated')
	);
	profile_role text;
begin
	-- De-privilege first so missing, invalid, or exceptional lookups cannot preserve
	-- a stale native Admin/Technician/Volunteer/Viewer role from the incoming event.
	safe_event := jsonb_set(
		case when jsonb_typeof(event) = 'object' then event else '{}'::jsonb end,
		'{claims}',
		case
			when jsonb_typeof(event->'claims') = 'object' then event->'claims'
			else '{}'::jsonb
		end || jsonb_build_object('role', 'authenticated'),
		true
	);

	select profile.role
	into profile_role
	from core.profiles as profile
	where profile.auth_user_id = (event->>'user_id')::uuid
		and profile.status = 'active'
		and profile.role in ('admin', 'technician', 'volunteer', 'viewer');

	if profile_role is not null then
		safe_event := jsonb_set(
			safe_event,
			'{claims,role}',
			to_jsonb(profile_role),
			true
		);
	end if;

	return safe_event;
exception
	when others then
		return safe_event;
end;
$$;

comment on function core.custom_access_token_hook(jsonb) is
	'Sets a safe authenticated JWT role before profile lookup, then applies an active valid profile role; profile changes take effect on the next token refresh.';

grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function core.custom_access_token_hook(jsonb) from public;
revoke execute on function core.custom_access_token_hook(jsonb) from anon;
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- Append-only audit trail. Admin and Technician may read it, but no application role
-- may write it directly; the SECURITY DEFINER trigger is its only write path.
-- actor_profile_id is null only for trusted owner-level maintenance executed without
-- an auth identity, in which case database_actor records postgres/supabase_admin.
-- ---------------------------------------------------------------------------

create table core.operational_log_audit (
	id bigint generated always as identity primary key,
	table_schema text not null,
	table_name text not null,
	row_id int not null,
	action text not null,
	old_values jsonb not null,
	new_values jsonb,
	actor_profile_id int references core.profiles (id) on delete restrict,
	database_actor name not null,
	occurred_at timestamptz not null default statement_timestamp(),
	constraint operational_log_audit_table_check check (
		table_schema = 'core'
		and table_name in (
			'daily_checks',
			'water_quality_readings',
			'chemical_additions',
			'health_observations',
			'feeding_logs',
			'maintenance_logs',
			'attachments',
			'star_treatments'
		)
	),
	constraint operational_log_audit_action_check
		check (action in ('UPDATE', 'DELETE')),
	constraint operational_log_audit_values_check check (
		(action = 'UPDATE' and new_values is not null)
		or (action = 'DELETE' and new_values is null)
	),
	constraint operational_log_audit_actor_check check (
		actor_profile_id is not null
		or database_actor::text in ('postgres', 'supabase_admin')
	)
);

create index operational_log_audit_row_idx
	on core.operational_log_audit (table_name, row_id, occurred_at desc);
create index operational_log_audit_actor_idx
	on core.operational_log_audit (actor_profile_id, occurred_at desc);

create index daily_checks_recorded_by_idx on core.daily_checks (recorded_by);
create index water_quality_readings_recorded_by_idx
	on core.water_quality_readings (recorded_by);
create index chemical_additions_recorded_by_idx on core.chemical_additions (recorded_by);
create index health_observations_recorded_by_idx
	on core.health_observations (recorded_by);
create index feeding_logs_recorded_by_idx on core.feeding_logs (recorded_by);
create index maintenance_logs_recorded_by_idx on core.maintenance_logs (recorded_by);
create index attachments_uploaded_by_idx on core.attachments (uploaded_by);

comment on table core.operational_log_audit is
	'Immutable trigger-written operational UPDATE/DELETE audit; readable by active Admin and Technician profiles only.';
comment on column core.operational_log_audit.database_actor is
	'Database session identity; postgres/supabase_admin identifies trusted direct SQL when actor_profile_id is null.';

alter table core.operational_log_audit enable row level security;

revoke all on table core.operational_log_audit
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.operational_log_audit_id_seq
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select on table core.operational_log_audit to admin, technician;

create policy "operational_log_audit_admin_technician_select"
	on core.operational_log_audit for select to admin, technician
	using ((select core.is_active_member()));

-- ---------------------------------------------------------------------------
-- Provenance and ownership enforcement.
-- ---------------------------------------------------------------------------

create or replace function core.enforce_log_insert_provenance()
	returns trigger
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile_id int;
begin
	if auth.uid() is not null then
		select profile.id
		into actor_profile_id
		from core.profiles as profile
		where profile.auth_user_id = auth.uid()
			and profile.status = 'active'
			and profile.role in ('admin', 'technician', 'volunteer');

		if not found then
			raise exception 'An active Admin, Technician, or Volunteer profile is required.'
				using errcode = '42501';
		end if;

		new.recorded_by := actor_profile_id;
		new.entered_at := statement_timestamp();
		new.data_source := 'live';
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'Operational imports require a trusted database owner session.'
			using errcode = '42501';
	elsif new.recorded_by is null then
		raise exception 'Trusted operational imports must provide recorded_by.'
			using errcode = '23502';
	end if;

	return new;
end;
$$;

create or replace function core.enforce_attachment_insert_provenance()
	returns trigger
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile_id int;
begin
	if auth.uid() is not null then
		select profile.id
		into actor_profile_id
		from core.profiles as profile
		where profile.auth_user_id = auth.uid()
			and profile.status = 'active'
			and profile.role in ('admin', 'technician', 'volunteer');

		if not found then
			raise exception 'An active Admin, Technician, or Volunteer profile is required.'
				using errcode = '42501';
		end if;

		new.uploaded_by := actor_profile_id;
		new.uploaded_at := statement_timestamp();
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'Attachment imports require a trusted database owner session.'
			using errcode = '42501';
	elsif new.uploaded_by is null then
		raise exception 'Trusted attachment imports must provide uploaded_by.'
			using errcode = '23502';
	end if;

	return new;
end;
$$;

create or replace function core.enforce_log_update_security()
	returns trigger
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile_id int;
	actor_role text;
begin
	if new.recorded_by is distinct from old.recorded_by
			or new.entered_at is distinct from old.entered_at
			or new.data_source is distinct from old.data_source then
		raise exception 'Operational provenance is immutable.'
			using errcode = '23514';
	end if;

	if auth.uid() is not null then
		select profile.id, profile.role
		into actor_profile_id, actor_role
		from core.profiles as profile
		where profile.auth_user_id = auth.uid()
			and profile.status = 'active'
			and profile.role in ('admin', 'technician', 'volunteer');

		if not found then
			raise exception 'An active Admin, Technician, or Volunteer profile is required.'
				using errcode = '42501';
		end if;

		if actor_role = 'volunteer' and old.recorded_by <> actor_profile_id then
			raise exception 'Volunteers may update only their own operational rows.'
				using errcode = '42501';
		end if;
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'Operational maintenance requires a trusted database owner session.'
			using errcode = '42501';
	end if;

	return new;
end;
$$;

create or replace function core.enforce_attachment_update_security()
	returns trigger
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile_id int;
	actor_role text;
begin
	if new.uploaded_by is distinct from old.uploaded_by
			or new.uploaded_at is distinct from old.uploaded_at then
		raise exception 'Attachment provenance is immutable.'
			using errcode = '23514';
	end if;

	if auth.uid() is not null then
		select profile.id, profile.role
		into actor_profile_id, actor_role
		from core.profiles as profile
		where profile.auth_user_id = auth.uid()
			and profile.status = 'active'
			and profile.role in ('admin', 'technician', 'volunteer');

		if not found then
			raise exception 'An active Admin, Technician, or Volunteer profile is required.'
				using errcode = '42501';
		end if;

		if actor_role = 'volunteer' and old.uploaded_by <> actor_profile_id then
			raise exception 'Volunteers may update only their own attachments.'
				using errcode = '42501';
		end if;
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'Attachment maintenance requires a trusted database owner session.'
			using errcode = '42501';
	end if;

	return new;
end;
$$;

create or replace function core.audit_operational_mutation()
	returns trigger
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile_id int;
begin
	if auth.uid() is not null then
		select profile.id
		into actor_profile_id
		from core.profiles as profile
		where profile.auth_user_id = auth.uid()
			and profile.status = 'active';

		if not found then
			raise exception 'An active profile is required to audit this mutation.'
				using errcode = '42501';
		end if;
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'Operational maintenance requires a trusted database owner session.'
			using errcode = '42501';
	end if;

	insert into core.operational_log_audit (
		table_schema,
		table_name,
		row_id,
		action,
		old_values,
		new_values,
		actor_profile_id,
		database_actor
	)
	values (
		tg_table_schema,
		tg_table_name,
		old.id,
		tg_op,
		to_jsonb(old),
		case when tg_op = 'UPDATE' then to_jsonb(new) else null end,
		actor_profile_id,
		session_user
	);

	return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function core.enforce_log_insert_provenance()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.enforce_attachment_insert_provenance()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.enforce_log_update_security()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.enforce_attachment_update_security()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.audit_operational_mutation()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

do $$
declare
	target_table text;
begin
	foreach target_table in array array[
		'daily_checks',
		'water_quality_readings',
		'chemical_additions',
		'health_observations',
		'feeding_logs',
		'maintenance_logs',
		'star_treatments'
	]
	loop
		execute format(
			'create trigger operational_insert_provenance before insert on core.%I for each row execute function core.enforce_log_insert_provenance()',
			target_table
		);
		execute format(
			'create trigger operational_update_security before update on core.%I for each row execute function core.enforce_log_update_security()',
			target_table
		);
		execute format(
			'create trigger operational_mutation_audit after update or delete on core.%I for each row execute function core.audit_operational_mutation()',
			target_table
		);
	end loop;
end;
$$;

create trigger operational_insert_provenance
	before insert on core.attachments
	for each row execute function core.enforce_attachment_insert_provenance();
create trigger operational_update_security
	before update on core.attachments
	for each row execute function core.enforce_attachment_update_security();
create trigger operational_mutation_audit
	after update or delete on core.attachments
	for each row execute function core.audit_operational_mutation();

-- Star-treatment identity remains immutable, but event time is now a correctable
-- event field. The generic trigger above protects provenance and Volunteer ownership.
create or replace function core.enforce_star_treatment_immutable_fields()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
	if new.id is distinct from old.id
			or new.animal_id is distinct from old.animal_id
			or new.tank_id is distinct from old.tank_id
			or new.recorded_by is distinct from old.recorded_by
			or new.data_source is distinct from old.data_source
			or new.entered_at is distinct from old.entered_at then
		raise exception 'Star treatment identity and provenance are immutable.'
			using errcode = '23514';
	end if;

	return new;
end;
$$;

revoke execute on function core.enforce_star_treatment_immutable_fields()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create or replace function core.correct_star_treatment_event_time(
	p_treatment_id int,
	p_administered_at timestamptz
)
	returns core.star_treatments
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile core.profiles%rowtype;
	existing_treatment core.star_treatments%rowtype;
	updated_treatment core.star_treatments%rowtype;
begin
	select profile.*
	into actor_profile
	from core.profiles as profile
	where profile.auth_user_id = auth.uid()
		and profile.status = 'active'
		and profile.role in ('admin', 'technician', 'volunteer');

	if not found then
		raise exception 'An active Admin, Technician, or Volunteer profile is required.'
			using errcode = '42501';
	end if;

	if p_administered_at is null then
		raise exception 'Administered time is required.' using errcode = '23502';
	end if;

	select treatment.*
	into existing_treatment
	from core.star_treatments as treatment
	where treatment.id = p_treatment_id
	for update;

	if not found then
		raise exception 'Star treatment % does not exist.', p_treatment_id using errcode = 'P0002';
	end if;

	if actor_profile.role = 'volunteer'
			and existing_treatment.recorded_by <> actor_profile.id then
		raise exception 'Volunteers may update only their own operational rows.'
			using errcode = '42501';
	end if;

	update core.star_treatments
	set administered_at = p_administered_at
	where id = p_treatment_id
	returning * into updated_treatment;

	return updated_treatment;
end;
$$;

revoke execute on function core.correct_star_treatment_event_time(int, timestamptz)
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function core.correct_star_treatment_event_time(int, timestamptz)
	to admin, technician, volunteer;

-- ---------------------------------------------------------------------------
-- Ordinary operational-log grants and RLS. Policies are explicit by operation:
-- Admin/Technician full CRUD; Volunteer read/create plus update only where recorded_by
-- (uploaded_by for attachments) matches their profile, with no time or data_source
-- restriction; Viewer read. Cross-user feeding consumption updates stay unavailable.
-- ---------------------------------------------------------------------------

revoke all on table
	core.daily_checks,
	core.water_quality_readings,
	core.chemical_additions,
	core.health_observations,
	core.feeding_logs,
	core.maintenance_logs,
	core.attachments
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
	core.daily_checks,
	core.water_quality_readings,
	core.chemical_additions,
	core.health_observations,
	core.feeding_logs,
	core.maintenance_logs,
	core.attachments
to admin, technician;

grant select, insert, update on table
	core.daily_checks,
	core.water_quality_readings,
	core.chemical_additions,
	core.health_observations,
	core.feeding_logs,
	core.maintenance_logs,
	core.attachments
to volunteer;

grant select on table
	core.daily_checks,
	core.water_quality_readings,
	core.chemical_additions,
	core.health_observations,
	core.feeding_logs,
	core.maintenance_logs,
	core.attachments
to viewer;

revoke all on sequence
	core.daily_checks_id_seq,
	core.water_quality_readings_id_seq,
	core.chemical_additions_id_seq,
	core.health_observations_id_seq,
	core.feeding_logs_id_seq,
	core.maintenance_logs_id_seq,
	core.attachments_id_seq
from public, anon, authenticated, service_role, viewer;

grant usage, select on sequence
	core.daily_checks_id_seq,
	core.water_quality_readings_id_seq,
	core.chemical_additions_id_seq,
	core.health_observations_id_seq,
	core.feeding_logs_id_seq,
	core.maintenance_logs_id_seq,
	core.attachments_id_seq
to admin, technician, volunteer;

-- These reference tables already had no anon grants; keep that invariant explicit.
revoke all on table core.systems, core.tanks, core.species, core.animals
	from public, anon;

do $$
declare
	target_table text;
	owner_column text;
	existing_policy record;
begin
	for target_table, owner_column in
		values
			('daily_checks', 'recorded_by'),
			('water_quality_readings', 'recorded_by'),
			('chemical_additions', 'recorded_by'),
			('health_observations', 'recorded_by'),
			('feeding_logs', 'recorded_by'),
			('maintenance_logs', 'recorded_by'),
			('attachments', 'uploaded_by')
	loop
		for existing_policy in
			select policyname
			from pg_catalog.pg_policies
			where schemaname = 'core' and tablename = target_table
		loop
			execute format(
				'drop policy %I on core.%I',
				existing_policy.policyname,
				target_table
			);
		end loop;

		execute format(
			'create policy %I on core.%I for select to admin, technician using ((select core.is_active_member()))',
			target_table || '_admin_technician_select',
			target_table
		);
		execute format(
			'create policy %I on core.%I for insert to admin, technician with check ((select core.is_active_member()))',
			target_table || '_admin_technician_insert',
			target_table
		);
		execute format(
			'create policy %I on core.%I for update to admin, technician using ((select core.is_active_member())) with check ((select core.is_active_member()))',
			target_table || '_admin_technician_update',
			target_table
		);
		execute format(
			'create policy %I on core.%I for delete to admin, technician using ((select core.is_active_member()))',
			target_table || '_admin_technician_delete',
			target_table
		);
		execute format(
			'create policy %I on core.%I for select to volunteer using ((select core.is_active_member()))',
			target_table || '_volunteer_select',
			target_table
		);
		execute format(
			'create policy %I on core.%I for insert to volunteer with check ((select core.is_active_member()) and %I = (select core.current_profile_id()))',
			target_table || '_volunteer_insert',
			target_table,
			owner_column
		);
		execute format(
			'create policy %I on core.%I for update to volunteer using ((select core.is_active_member()) and %I = (select core.current_profile_id())) with check ((select core.is_active_member()) and %I = (select core.current_profile_id()))',
			target_table || '_volunteer_update_own',
			target_table,
			owner_column,
			owner_column
		);
		execute format(
			'create policy %I on core.%I for select to viewer using ((select core.is_active_member()))',
			target_table || '_viewer_select',
			target_table
		);
	end loop;
end;
$$;

-- Storage access is limited to the private attachments bucket for every application
-- role. Admin/Technician have full access in that bucket, Volunteer and Viewer have
-- lab-wide read there, Volunteer may upload there, and Volunteer UPDATE additionally
-- requires storage.objects.owner_id (the JWT sub text) to match auth.uid(). No custom
-- application policy grants access to any other bucket.
drop policy if exists "storage_objects_admin_technician_all" on storage.objects;
drop policy if exists "storage_objects_volunteer_select" on storage.objects;
drop policy if exists "storage_objects_volunteer_insert" on storage.objects;
drop policy if exists "storage_objects_volunteer_update" on storage.objects;
drop policy if exists "storage_objects_viewer_select" on storage.objects;

create policy "storage_objects_admin_technician_all"
	on storage.objects for all to admin, technician
	using (bucket_id = 'attachments')
	with check (bucket_id = 'attachments');

create policy "storage_objects_volunteer_select"
	on storage.objects for select to volunteer
	using (bucket_id = 'attachments');

create policy "storage_objects_volunteer_insert"
	on storage.objects for insert to volunteer
	with check (bucket_id = 'attachments');

create policy "storage_objects_volunteer_update"
	on storage.objects for update to volunteer
	using (
		bucket_id = 'attachments'
		and owner_id = (select auth.uid()::text)
	)
	with check (
		bucket_id = 'attachments'
		and owner_id = (select auth.uid()::text)
	);

create policy "storage_objects_viewer_select"
	on storage.objects for select to viewer
	using (bucket_id = 'attachments');

-- Star treatments remain RPC-only for writes and hidden from Viewer. Direct table
-- access is SELECT-only for active Admin/Technician/Volunteer profiles.
drop policy if exists "star_treatments_admin_technician_select" on core.star_treatments;
drop policy if exists "star_treatments_volunteer_select" on core.star_treatments;
revoke all on table core.star_treatments
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.star_treatments_id_seq
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select on table core.star_treatments to admin, technician, volunteer;
create policy "star_treatments_admin_technician_select"
	on core.star_treatments for select to admin, technician
	using ((select core.is_contributor()));
create policy "star_treatments_volunteer_select"
	on core.star_treatments for select to volunteer
	using ((select core.is_contributor()));

-- ---------------------------------------------------------------------------
-- Operational history must block parent deletion instead of disappearing with it.
-- Existing NO ACTION profile/tank foreign keys and attachment parent semantics stay
-- unchanged; only destructive CASCADE constraints are replaced here.
-- ---------------------------------------------------------------------------

alter table core.daily_checks
	drop constraint daily_checks_system_id_fkey,
	add constraint daily_checks_system_id_fkey
		foreign key (system_id) references core.systems (id) on delete restrict;

alter table core.water_quality_readings
	drop constraint water_quality_readings_system_id_fkey,
	add constraint water_quality_readings_system_id_fkey
		foreign key (system_id) references core.systems (id) on delete restrict;

alter table core.chemical_additions
	drop constraint chemical_additions_system_id_fkey,
	add constraint chemical_additions_system_id_fkey
		foreign key (system_id) references core.systems (id) on delete restrict;

alter table core.health_observations
	drop constraint health_observations_animal_id_fkey,
	add constraint health_observations_animal_id_fkey
		foreign key (animal_id) references core.animals (id) on delete restrict;

alter table core.feeding_logs
	drop constraint feeding_logs_animal_id_fkey,
	add constraint feeding_logs_animal_id_fkey
		foreign key (animal_id) references core.animals (id) on delete restrict;

alter table core.maintenance_logs
	drop constraint maintenance_logs_system_id_fkey,
	add constraint maintenance_logs_system_id_fkey
		foreign key (system_id) references core.systems (id) on delete restrict;
