-- Feeding schedules: which ISO weekdays each system, or a group of its tanks, is fed.
-- Tank groups come from tank names such as "Lower-14.6L", "Left-90L" or "200L": a row
-- targets a position, a position and size, or a size alone. Resolution happens in the
-- app (lib/systems/feeding-schedule.ts). No cadences are seeded; staff enter them in Settings.

set local check_function_bodies = off;

create or replace function core.is_valid_feeding_weekdays(weekdays smallint[])
	returns boolean
	language sql
	immutable
	set search_path = pg_catalog
	as $$
	select weekdays is not null
		and pg_catalog.array_ndims(weekdays) = 1
		and pg_catalog.cardinality(weekdays) between 1 and 7
		and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
		and pg_catalog.cardinality(weekdays) = (
			select pg_catalog.count(distinct day) from pg_catalog.unnest(weekdays) as day
		);
$$;

revoke execute on function core.is_valid_feeding_weekdays(smallint[])
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function core.is_valid_feeding_weekdays(smallint[])
	to admin, technician;

create table core.feeding_schedules (
	id serial primary key,
	system_id integer not null references core.systems (id) on delete cascade,
	tank_position text,
	size_liters numeric,
	weekdays smallint[] not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint feeding_schedules_tank_position_check
		check (tank_position in ('lower', 'upper', 'left', 'right')),
	constraint feeding_schedules_size_liters_check check (
		size_liters > 0 and size_liters not in ('Infinity'::numeric, 'NaN'::numeric)
	),
	constraint feeding_schedules_weekdays_check
		check (core.is_valid_feeding_weekdays(weekdays)),
	constraint feeding_schedules_scope_key
		unique nulls not distinct (system_id, tank_position, size_liters)
);

create trigger feeding_schedules_set_updated_at
	before update on core.feeding_schedules
	for each row execute function core.set_updated_at();

comment on table core.feeding_schedules is
	'Weekday feeding schedule per system; rows with a tank position and/or size override it for matching tanks.';
comment on column core.feeding_schedules.tank_position is
	'Position prefix of the tank name (lower, upper, left, right); NULL when the row is not position-specific.';
comment on column core.feeding_schedules.size_liters is
	'Volume in liters parsed from the tank name (e.g. 14.6 for Lower-14.6L); NULL when the row is not size-specific.';
comment on column core.feeding_schedules.weekdays is
	'ISO weekdays, 1 = Monday to 7 = Sunday; non-empty, no duplicates.';
comment on column core.feeding_schedules.updated_at is
	'Overdue is only evaluated for days after this timestamp, so edits never create retroactive misses.';

alter table core.feeding_schedules enable row level security;

revoke all on table core.feeding_schedules
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.feeding_schedules_id_seq
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select, insert, update, delete on table core.feeding_schedules
	to admin, technician;
grant select on table core.feeding_schedules to volunteer, viewer;
grant usage, select on sequence core.feeding_schedules_id_seq
	to admin, technician;

create policy "feeding_schedules_admin_technician_select"
	on core.feeding_schedules for select to admin, technician
	using ((select core.is_active_member()));
create policy "feeding_schedules_admin_technician_insert"
	on core.feeding_schedules for insert to admin, technician
	with check ((select core.is_active_member()));
create policy "feeding_schedules_admin_technician_update"
	on core.feeding_schedules for update to admin, technician
	using ((select core.is_active_member()))
	with check ((select core.is_active_member()));
create policy "feeding_schedules_admin_technician_delete"
	on core.feeding_schedules for delete to admin, technician
	using ((select core.is_active_member()));
create policy "feeding_schedules_volunteer_viewer_select"
	on core.feeding_schedules for select to volunteer, viewer
	using ((select core.is_active_member()));
