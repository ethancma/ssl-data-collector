-- P1 database-owned operational metadata and validation rules.

set local check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Optional water-quality target ranges. A system row overrides the lab-wide
-- row for the same parameter. No numeric targets are seeded.
-- ---------------------------------------------------------------------------

create table core.water_quality_target_ranges (
	id serial primary key,
	system_id integer references core.systems (id) on delete restrict,
	parameter_key text not null,
	min_value numeric,
	max_value numeric,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint water_quality_target_ranges_parameter_key_check check (
		parameter_key in (
			'ph',
			'salinity',
			'magnesium',
			'ammonia',
			'calcium',
			'phosphate',
			'nitrate',
			'nitrite',
			'alkalinity'
		)
	),
	constraint water_quality_target_ranges_bound_required_check
		check (min_value is not null or max_value is not null),
	constraint water_quality_target_ranges_finite_bounds_check check (
		(min_value is null or min_value not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
		and (max_value is null or max_value not in ('-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric))
	),
	constraint water_quality_target_ranges_bounds_order_check
		check (min_value is null or max_value is null or min_value <= max_value)
);

create unique index water_quality_target_ranges_lab_parameter_key
	on core.water_quality_target_ranges (parameter_key)
	where system_id is null;
create unique index water_quality_target_ranges_system_parameter_key
	on core.water_quality_target_ranges (system_id, parameter_key)
	where system_id is not null;

create trigger water_quality_target_ranges_set_updated_at
	before update on core.water_quality_target_ranges
	for each row execute function core.set_updated_at();

comment on table core.water_quality_target_ranges is
	'Optional inclusive lab-wide or per-system target ranges; system-specific rows override lab-wide rows.';
comment on column core.water_quality_target_ranges.system_id is
	'NULL for a lab-wide range; otherwise the range applies only to this system.';
comment on column core.water_quality_target_ranges.parameter_key is
	'Fixed units: ph unitless; salinity ppt; magnesium/ammonia/calcium/phosphate/nitrate ppm; nitrite ppb; alkalinity dKH.';
comment on column core.water_quality_readings.ph is 'Unitless pH.';
comment on column core.water_quality_readings.salinity is
	'Salinity in ppt; part of the official weekly panel.';
comment on column core.water_quality_readings.magnesium is 'Magnesium in ppm.';
comment on column core.water_quality_readings.ammonia is 'Ammonia in ppm.';
comment on column core.water_quality_readings.calcium is 'Calcium in ppm.';
comment on column core.water_quality_readings.phosphate is 'Phosphate in ppm.';
comment on column core.water_quality_readings.nitrate is 'Nitrate in ppm.';
comment on column core.water_quality_readings.nitrite is 'Nitrite in ppb.';
comment on column core.water_quality_readings.alkalinity is 'Alkalinity in dKH.';

alter table core.water_quality_target_ranges enable row level security;

revoke all on table core.water_quality_target_ranges
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.water_quality_target_ranges_id_seq
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select, insert, update, delete on table core.water_quality_target_ranges
	to admin, technician;
grant select on table core.water_quality_target_ranges to volunteer, viewer;
grant usage, select on sequence core.water_quality_target_ranges_id_seq
	to admin, technician;

create policy "water_quality_target_ranges_admin_technician_select"
	on core.water_quality_target_ranges for select to admin, technician
	using ((select core.is_active_member()));
create policy "water_quality_target_ranges_admin_technician_insert"
	on core.water_quality_target_ranges for insert to admin, technician
	with check ((select core.is_active_member()));
create policy "water_quality_target_ranges_admin_technician_update"
	on core.water_quality_target_ranges for update to admin, technician
	using ((select core.is_active_member()))
	with check ((select core.is_active_member()));
create policy "water_quality_target_ranges_admin_technician_delete"
	on core.water_quality_target_ranges for delete to admin, technician
	using ((select core.is_active_member()));
create policy "water_quality_target_ranges_volunteer_viewer_select"
	on core.water_quality_target_ranges for select to volunteer, viewer
	using ((select core.is_active_member()));

create or replace function core.enforce_water_quality_range_notes()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	out_of_range_parameter text;
begin
	select measurement.parameter_key
	into out_of_range_parameter
	from (
		values
			('ph', new.ph),
			('salinity', new.salinity),
			('magnesium', new.magnesium),
			('ammonia', new.ammonia),
			('calcium', new.calcium),
			('phosphate', new.phosphate),
			('nitrate', new.nitrate),
			('nitrite', new.nitrite),
			('alkalinity', new.alkalinity)
	) as measurement(parameter_key, measured_value)
	cross join lateral (
		select target.min_value, target.max_value
		from core.water_quality_target_ranges as target
		where target.parameter_key = measurement.parameter_key
			and (target.system_id = new.system_id or target.system_id is null)
		order by (target.system_id is not null) desc
		limit 1
	) as applicable_target
	where measurement.measured_value is not null
		and (
			(applicable_target.min_value is not null
				and measurement.measured_value < applicable_target.min_value)
			or (applicable_target.max_value is not null
				and measurement.measured_value > applicable_target.max_value)
		)
	limit 1;

	if out_of_range_parameter is not null
			and nullif(pg_catalog.btrim(new.notes), '') is null then
		raise exception 'Notes are required when % is outside its configured target range.',
			out_of_range_parameter
			using errcode = '23514';
	end if;

	return new;
end;
$$;

revoke execute on function core.enforce_water_quality_range_notes()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger water_quality_readings_require_range_notes
	before insert or update on core.water_quality_readings
	for each row execute function core.enforce_water_quality_range_notes();

-- ---------------------------------------------------------------------------
-- Lab-wide quick-pick catalogs. Event rows retain their entered name and unit
-- snapshots; catalog renames never rewrite historical events.
-- ---------------------------------------------------------------------------

create or replace function core.normalize_quick_pick_key(value text)
	returns text
	language sql
	immutable
	strict
	set search_path = pg_catalog
	as $$
	select pg_catalog.lower(
		pg_catalog.regexp_replace(pg_catalog.btrim(value), '[[:space:]_-]+', '', 'g')
	);
$$;

revoke execute on function core.normalize_quick_pick_key(text)
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function core.normalize_quick_pick_key(text)
	to admin, technician, volunteer;

create table core.chemical_addition_catalog (
	id serial primary key,
	name text not null,
	default_unit text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint chemical_addition_catalog_name_check check (
		name = pg_catalog.regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')
		and pg_catalog.length(name) between 1 and 200
	),
	constraint chemical_addition_catalog_default_unit_check check (
		default_unit = pg_catalog.regexp_replace(
			pg_catalog.btrim(default_unit),
			'[[:space:]]+',
			' ',
			'g'
		)
		and pg_catalog.length(default_unit) between 1 and 50
	)
);

create unique index chemical_addition_catalog_name_key
	on core.chemical_addition_catalog (core.normalize_quick_pick_key(name));

create trigger chemical_addition_catalog_set_updated_at
	before update on core.chemical_addition_catalog
	for each row execute function core.set_updated_at();

create table core.star_treatment_catalog (
	id serial primary key,
	name text not null,
	default_amount_unit text,
	default_concentration_unit text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint star_treatment_catalog_name_check check (
		name = pg_catalog.regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')
		and pg_catalog.length(name) between 1 and 100
	),
	constraint star_treatment_catalog_amount_unit_check check (
		default_amount_unit is null
		or (
			default_amount_unit = pg_catalog.regexp_replace(
				pg_catalog.btrim(default_amount_unit),
				'[[:space:]]+',
				' ',
				'g'
			)
			and pg_catalog.length(default_amount_unit) between 1 and 50
		)
	),
	constraint star_treatment_catalog_concentration_unit_check check (
		default_concentration_unit is null
		or (
			default_concentration_unit = pg_catalog.regexp_replace(
				pg_catalog.btrim(default_concentration_unit),
				'[[:space:]]+',
				' ',
				'g'
			)
			and pg_catalog.length(default_concentration_unit) between 1 and 50
		)
	)
);

create unique index star_treatment_catalog_name_key
	on core.star_treatment_catalog (core.normalize_quick_pick_key(name));

create trigger star_treatment_catalog_set_updated_at
	before update on core.star_treatment_catalog
	for each row execute function core.set_updated_at();

insert into core.chemical_addition_catalog (name, default_unit)
values
	('C-Balance', 'mL'),
	('Mg', 'mL'),
	('DI-Trace', 'mL');

insert into core.star_treatment_catalog (
	name,
	default_amount_unit,
	default_concentration_unit
)
values
	('Probiotics', 'mL', 'ppm'),
	('Reef Dip', null, null);

comment on table core.chemical_addition_catalog is
	'Admin-managed lab-wide Chemical addition quick picks; defaults are editable suggestions.';
comment on table core.star_treatment_catalog is
	'Admin-managed lab-wide Star treatment quick picks; defaults are editable suggestions.';

do $$
declare
	catalog_table text;
begin
	foreach catalog_table in array array[
		'chemical_addition_catalog',
		'star_treatment_catalog'
	]
	loop
		execute format('alter table core.%I enable row level security', catalog_table);
		execute format(
			'revoke all on table core.%I from public, anon, authenticated, service_role, admin, technician, volunteer, viewer',
			catalog_table
		);
		execute format('grant select, insert, update, delete on table core.%I to admin', catalog_table);
		execute format('grant select on table core.%I to technician, volunteer, viewer', catalog_table);
		execute format(
			'create policy %I on core.%I for select to admin, technician, volunteer, viewer using ((select core.is_active_member()))',
			catalog_table || '_active_member_select',
			catalog_table
		);
		execute format(
			'create policy %I on core.%I for insert to admin with check ((select core.is_active_member()))',
			catalog_table || '_admin_insert',
			catalog_table
		);
		execute format(
			'create policy %I on core.%I for update to admin using ((select core.is_active_member())) with check ((select core.is_active_member()))',
			catalog_table || '_admin_update',
			catalog_table
		);
		execute format(
			'create policy %I on core.%I for delete to admin using ((select core.is_active_member()))',
			catalog_table || '_admin_delete',
			catalog_table
		);
	end loop;
end;
$$;

revoke all on sequence
	core.chemical_addition_catalog_id_seq,
	core.star_treatment_catalog_id_seq
from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant usage, select on sequence
	core.chemical_addition_catalog_id_seq,
	core.star_treatment_catalog_id_seq
to admin;

alter table core.chemical_additions
	add column catalog_id integer
		references core.chemical_addition_catalog (id) on delete restrict,
	add constraint chemical_additions_name_check check (
		chemical_name = pg_catalog.regexp_replace(
			pg_catalog.btrim(chemical_name),
			'[[:space:]]+',
			' ',
			'g'
		)
		and pg_catalog.length(chemical_name) between 1 and 200
	),
	add constraint chemical_additions_amount_positive_check check (amount > 0),
	add constraint chemical_additions_unit_check check (
		unit = pg_catalog.regexp_replace(pg_catalog.btrim(unit), '[[:space:]]+', ' ', 'g')
		and pg_catalog.length(unit) between 1 and 50
	);

create index chemical_additions_catalog_id_idx
	on core.chemical_additions (catalog_id)
	where catalog_id is not null;

comment on column core.chemical_additions.catalog_id is
	'Optional quick-pick reference; chemical_name and unit are the event-time snapshots.';
comment on column core.chemical_additions.chemical_name is
	'Entered product-name snapshot; catalog renames do not rewrite this value.';
comment on column core.chemical_additions.unit is
	'Entered unit snapshot; catalog default changes do not rewrite this value.';

create or replace function core.validate_chemical_addition_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	catalog_name text;
begin
	new.chemical_name := pg_catalog.regexp_replace(
		pg_catalog.btrim(new.chemical_name),
		'[[:space:]]+',
		' ',
		'g'
	);
	new.unit := pg_catalog.regexp_replace(
		pg_catalog.btrim(new.unit),
		'[[:space:]]+',
		' ',
		'g'
	);

	if core.normalize_quick_pick_key(new.chemical_name) in ('probiotic', 'probiotics') then
		raise exception 'Record Probiotics as an individual Star treatment.'
			using errcode = '23514';
	end if;

	if new.catalog_id is not null
			and (tg_op = 'INSERT' or new.catalog_id is distinct from old.catalog_id) then
		select catalog.name
		into catalog_name
		from core.chemical_addition_catalog as catalog
		where catalog.id = new.catalog_id;

		if not found then
			raise exception 'Chemical addition quick pick % does not exist.', new.catalog_id
				using errcode = '23503';
		end if;

		new.chemical_name := catalog_name;
	elsif tg_op = 'INSERT'
			or new.chemical_name is distinct from old.chemical_name then
		select catalog.id
		into new.catalog_id
		from core.chemical_addition_catalog as catalog
		where core.normalize_quick_pick_key(catalog.name)
			= core.normalize_quick_pick_key(new.chemical_name);
	end if;

	return new;
end;
$$;

revoke execute on function core.validate_chemical_addition_mutation()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger chemical_additions_validate_mutation
	before insert or update on core.chemical_additions
	for each row execute function core.validate_chemical_addition_mutation();

alter table core.star_treatments
	add column catalog_id integer
		references core.star_treatment_catalog (id) on delete restrict,
	drop constraint star_treatments_value_required_check,
	add constraint star_treatments_value_required_check check (
		treatment_type = 'reef_dip'
		or amount is not null
		or concentration is not null
	);

create index star_treatments_catalog_id_idx
	on core.star_treatments (catalog_id)
	where catalog_id is not null;

comment on column core.star_treatments.catalog_id is
	'Optional quick-pick reference; treatment_type and unit columns are event-time snapshots.';
comment on column core.star_treatments.treatment_type is
	'Entered treatment-name snapshot; catalog renames do not rewrite this value.';
comment on column core.star_treatments.unit is
	'Entered amount-unit snapshot; catalog default changes do not rewrite this value.';
comment on column core.star_treatments.concentration_unit is
	'Entered concentration-unit snapshot; catalog default changes do not rewrite this value.';

create or replace function core.validate_star_treatment_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	catalog_name text;
begin
	new.treatment_type := core.normalize_star_treatment_type(new.treatment_type);

	if new.catalog_id is not null
			and (tg_op = 'INSERT' or new.catalog_id is distinct from old.catalog_id) then
		select catalog.name
		into catalog_name
		from core.star_treatment_catalog as catalog
		where catalog.id = new.catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', new.catalog_id
				using errcode = '23503';
		end if;

		new.treatment_type := core.normalize_star_treatment_type(catalog_name);
	elsif tg_op = 'INSERT'
			or new.treatment_type is distinct from old.treatment_type then
		select catalog.id
		into new.catalog_id
		from core.star_treatment_catalog as catalog
		where core.normalize_quick_pick_key(catalog.name)
			= core.normalize_quick_pick_key(new.treatment_type);
	end if;

	if new.amount is null and new.concentration is null
			and new.treatment_type <> 'reef_dip' then
		raise exception 'Amount or concentration is required unless the treatment is Reef Dip.'
			using errcode = '23514';
	end if;

	if new.amount is not null and new.amount <= 0 then
		raise exception 'Amount must be positive.' using errcode = '23514';
	end if;
	if new.amount is not null and nullif(pg_catalog.btrim(new.unit), '') is null then
		raise exception 'Amount unit is required when amount is provided.' using errcode = '23514';
	end if;
	if new.amount is null then
		new.unit := null;
	else
		new.unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(new.unit),
			'[[:space:]]+',
			' ',
			'g'
		);
	end if;

	if new.concentration is not null and new.concentration <= 0 then
		raise exception 'Concentration must be positive.' using errcode = '23514';
	end if;
	if new.concentration is not null
			and nullif(pg_catalog.btrim(new.concentration_unit), '') is null then
		raise exception 'Concentration unit is required when concentration is provided.'
			using errcode = '23514';
	end if;
	if new.concentration is null then
		new.concentration_unit := null;
	else
		new.concentration_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(new.concentration_unit),
			'[[:space:]]+',
			' ',
			'g'
		);
	end if;

	return new;
end;
$$;

revoke execute on function core.validate_star_treatment_mutation()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger star_treatments_validate_mutation
	before insert or update on core.star_treatments
	for each row execute function core.validate_star_treatment_mutation();

drop function core.create_star_treatment(
	int,
	int,
	numeric,
	text,
	numeric,
	text,
	text,
	text,
	timestamptz
);
drop function core.update_star_treatment(int, text, numeric, text, numeric, text, text);

create or replace function core.create_star_treatment(
	p_animal_id int,
	p_tank_id int,
	p_amount numeric default null,
	p_unit text default null,
	p_concentration numeric default null,
	p_concentration_unit text default null,
	p_treatment_type text default 'probiotics',
	p_notes text default null,
	p_administered_at timestamptz default pg_catalog.now(),
	p_catalog_id int default null
)
	returns core.star_treatments
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	actor_profile core.profiles%rowtype;
	animal_tank_id int;
	animal_status text;
	animal_tracking_type text;
	species_category text;
	normalized_type text;
	normalized_unit text;
	normalized_concentration_unit text;
	normalized_notes text;
	catalog_name text;
	created_treatment core.star_treatments%rowtype;
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

	if (p_administered_at at time zone 'America/Los_Angeles')::date
			<> (pg_catalog.statement_timestamp() at time zone 'America/Los_Angeles')::date then
		raise exception 'Live star treatments must use the current America/Los_Angeles date.'
			using errcode = '23514';
	end if;

	select animal.tank_id, animal.status, animal.tracking_type, species.category
	into animal_tank_id, animal_status, animal_tracking_type, species_category
	from core.animals as animal
	join core.species as species on species.id = animal.species_id
	where animal.id = p_animal_id
	for share of animal, species;

	if not found then
		raise exception 'The selected animal does not exist.' using errcode = '23503';
	end if;

	if animal_status <> 'active'
			or animal_tracking_type <> 'individual'
			or species_category <> 'star' then
		raise exception 'The selected animal must be an active, individually tracked star.'
			using errcode = '23514';
	end if;

	if animal_tank_id <> p_tank_id then
		raise exception 'The selected tank does not match the star''s current tank.'
			using errcode = '23514';
	end if;

	if p_catalog_id is null then
		normalized_type := core.normalize_star_treatment_type(p_treatment_type);
	else
		select catalog.name
		into catalog_name
		from core.star_treatment_catalog as catalog
		where catalog.id = p_catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', p_catalog_id
				using errcode = '23503';
		end if;

		normalized_type := core.normalize_star_treatment_type(catalog_name);
	end if;

	if p_amount is null and p_concentration is null
			and normalized_type <> 'reef_dip' then
		raise exception 'Amount or concentration is required unless the treatment is Reef Dip.'
			using errcode = '23514';
	end if;

	if p_amount is null then
		normalized_unit := null;
	else
		if p_amount <= 0 then
			raise exception 'Amount must be positive.' using errcode = '23514';
		end if;
		if nullif(pg_catalog.btrim(p_unit), '') is null then
			raise exception 'Amount unit is required when amount is provided.' using errcode = '23514';
		end if;
		normalized_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(p_unit),
			'[[:space:]]+',
			' ',
			'g'
		);
		if pg_catalog.length(normalized_unit) > 50 then
			raise exception 'Amount unit must be between 1 and 50 characters.' using errcode = '23514';
		end if;
	end if;

	if p_concentration is null then
		normalized_concentration_unit := null;
	else
		if p_concentration <= 0 then
			raise exception 'Concentration must be positive.' using errcode = '23514';
		end if;
		if nullif(pg_catalog.btrim(p_concentration_unit), '') is null then
			raise exception 'Concentration unit is required when concentration is provided.'
				using errcode = '23514';
		end if;
		normalized_concentration_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(p_concentration_unit),
			'[[:space:]]+',
			' ',
			'g'
		);
		if pg_catalog.length(normalized_concentration_unit) > 50 then
			raise exception 'Concentration unit must be between 1 and 50 characters.'
				using errcode = '23514';
		end if;
	end if;

	normalized_notes := nullif(pg_catalog.btrim(p_notes), '');

	insert into core.star_treatments (
		animal_id,
		tank_id,
		treatment_type,
		amount,
		unit,
		concentration,
		concentration_unit,
		notes,
		administered_at,
		recorded_by,
		data_source,
		catalog_id
	)
	values (
		p_animal_id,
		p_tank_id,
		normalized_type,
		p_amount,
		normalized_unit,
		p_concentration,
		normalized_concentration_unit,
		normalized_notes,
		p_administered_at,
		actor_profile.id,
		'live',
		p_catalog_id
	)
	returning * into created_treatment;

	return created_treatment;
end;
$$;

create or replace function core.update_star_treatment(
	p_treatment_id int,
	p_treatment_type text,
	p_amount numeric,
	p_unit text,
	p_concentration numeric,
	p_concentration_unit text,
	p_notes text,
	p_catalog_id int default null
)
	returns core.star_treatments
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	updated_treatment core.star_treatments%rowtype;
	normalized_type text;
	normalized_unit text;
	normalized_concentration_unit text;
	normalized_notes text;
	catalog_name text;
begin
	perform 1
	from core.profiles as profile
	where profile.auth_user_id = auth.uid()
		and profile.status = 'active'
		and profile.role in ('admin', 'technician', 'volunteer');

	if not found then
		raise exception 'An active Admin, Technician, or Volunteer profile is required.'
			using errcode = '42501';
	end if;

	perform 1
	from core.star_treatments as treatment
	where treatment.id = p_treatment_id
	for update;

	if not found then
		raise exception 'Star treatment % does not exist.', p_treatment_id using errcode = 'P0002';
	end if;

	if p_catalog_id is null then
		normalized_type := core.normalize_star_treatment_type(p_treatment_type);
	else
		select catalog.name
		into catalog_name
		from core.star_treatment_catalog as catalog
		where catalog.id = p_catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', p_catalog_id
				using errcode = '23503';
		end if;

		normalized_type := core.normalize_star_treatment_type(catalog_name);
	end if;

	if p_amount is null and p_concentration is null
			and normalized_type <> 'reef_dip' then
		raise exception 'Amount or concentration is required unless the treatment is Reef Dip.'
			using errcode = '23514';
	end if;

	if p_amount is null then
		normalized_unit := null;
	else
		if p_amount <= 0 then
			raise exception 'Amount must be positive.' using errcode = '23514';
		end if;
		if nullif(pg_catalog.btrim(p_unit), '') is null then
			raise exception 'Amount unit is required when amount is provided.' using errcode = '23514';
		end if;
		normalized_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(p_unit),
			'[[:space:]]+',
			' ',
			'g'
		);
		if pg_catalog.length(normalized_unit) > 50 then
			raise exception 'Amount unit must be between 1 and 50 characters.' using errcode = '23514';
		end if;
	end if;

	if p_concentration is null then
		normalized_concentration_unit := null;
	else
		if p_concentration <= 0 then
			raise exception 'Concentration must be positive.' using errcode = '23514';
		end if;
		if nullif(pg_catalog.btrim(p_concentration_unit), '') is null then
			raise exception 'Concentration unit is required when concentration is provided.'
				using errcode = '23514';
		end if;
		normalized_concentration_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(p_concentration_unit),
			'[[:space:]]+',
			' ',
			'g'
		);
		if pg_catalog.length(normalized_concentration_unit) > 50 then
			raise exception 'Concentration unit must be between 1 and 50 characters.'
				using errcode = '23514';
		end if;
	end if;

	normalized_notes := nullif(pg_catalog.btrim(p_notes), '');

	update core.star_treatments
	set treatment_type = normalized_type,
			amount = p_amount,
			unit = normalized_unit,
			concentration = p_concentration,
			concentration_unit = normalized_concentration_unit,
			notes = normalized_notes,
			catalog_id = coalesce(p_catalog_id, catalog_id)
	where id = p_treatment_id
	returning * into updated_treatment;

	return updated_treatment;
end;
$$;

revoke execute on function core.create_star_treatment(
	int,
	int,
	numeric,
	text,
	numeric,
	text,
	text,
	text,
	timestamptz,
	int
)
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.update_star_treatment(
	int,
	text,
	numeric,
	text,
	numeric,
	text,
	text,
	int
)
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function core.create_star_treatment(
	int,
	int,
	numeric,
	text,
	numeric,
	text,
	text,
	text,
	timestamptz,
	int
)
	to admin, technician, volunteer;
grant execute on function core.update_star_treatment(
	int,
	text,
	numeric,
	text,
	numeric,
	text,
	text,
	int
)
	to admin, technician, volunteer;
