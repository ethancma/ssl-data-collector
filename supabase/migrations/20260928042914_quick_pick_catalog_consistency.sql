-- Consistent lab-wide quick-pick catalogs: Admin/Technician management, retirement via
-- is_active, auto-linking free text to active entries, and stored feeding units.

-- ---------------------------------------------------------------------------
-- Admin and Technician manage all three catalogs; Volunteer and Viewer stay read-only.
-- ---------------------------------------------------------------------------

do $$
declare
	catalog_table text;
	operation text;
begin
	foreach catalog_table in array array[
		'chemical_addition_catalog',
		'star_treatment_catalog',
		'food_catalog'
	]
	loop
		execute format(
			'grant select, insert, update, delete on table core.%I to admin, technician',
			catalog_table
		);
		execute format(
			'grant usage, select on sequence core.%I to admin, technician',
			catalog_table || '_id_seq'
		);

		foreach operation in array array['insert', 'update', 'delete']
		loop
			execute format(
				'drop policy %I on core.%I',
				catalog_table || '_admin_' || operation,
				catalog_table
			);
		end loop;

		execute format(
			'create policy %I on core.%I for insert to admin, technician with check ((select core.is_active_member()))',
			catalog_table || '_admin_technician_insert',
			catalog_table
		);
		execute format(
			'create policy %I on core.%I for update to admin, technician using ((select core.is_active_member())) with check ((select core.is_active_member()))',
			catalog_table || '_admin_technician_update',
			catalog_table
		);
		execute format(
			'create policy %I on core.%I for delete to admin, technician using ((select core.is_active_member()))',
			catalog_table || '_admin_technician_delete',
			catalog_table
		);
	end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retirement flags and stored feeding units.
-- ---------------------------------------------------------------------------

alter table core.chemical_addition_catalog
	add column is_active boolean not null default true;
alter table core.star_treatment_catalog
	add column is_active boolean not null default true;

alter table core.food_catalog add column default_unit text;

update core.food_catalog
set default_unit = case
	when core.normalize_quick_pick_key(name) = 'microalgae' then 'mL'
	else 'pieces'
end;

alter table core.food_catalog
	alter column default_unit set not null,
	add constraint food_catalog_default_unit_check check (
		default_unit = pg_catalog.regexp_replace(
			pg_catalog.btrim(default_unit),
			'[[:space:]]+',
			' ',
			'g'
		)
		and pg_catalog.length(default_unit) between 1 and 50
	);

-- Existing numeric rows may lack a unit (no backfill); the trigger requires a unit
-- whenever amount_value is inserted or changed.
alter table core.feeding_logs
	add column amount_unit text,
	add constraint feeding_logs_amount_value_positive_check
		check (amount_value is null or amount_value > 0),
	add constraint feeding_logs_amount_unit_check check (
		amount_unit is null or (
			amount_unit = pg_catalog.regexp_replace(
				pg_catalog.btrim(amount_unit),
				'[[:space:]]+',
				' ',
				'g'
			)
			and pg_catalog.length(amount_unit) between 1 and 50
		)
	),
	add constraint feeding_logs_amount_unit_requires_value_check
		check (amount_unit is null or amount_value is not null);

-- ---------------------------------------------------------------------------
-- Event validation: new catalog assignments must be active; free text that matches
-- an active catalog key auto-links and snapshots the canonical catalog name.
-- ---------------------------------------------------------------------------

create or replace function core.validate_feeding_food_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	selected_food core.food_catalog%rowtype;
begin
	if tg_op = 'INSERT' then
		if (new.data_source = 'live' or auth.uid() is not null)
				and new.amount is not null then
			raise exception 'Live feeding amounts must use numeric amount_value.'
				using errcode = '23514';
		end if;
	elsif new.data_source = 'live' and new.amount is distinct from old.amount then
		raise exception 'Live feeding amounts must use numeric amount_value.'
			using errcode = '23514';
	end if;

	if new.amount_value is null then
		new.amount_unit := null;
	elsif tg_op = 'INSERT'
			or new.amount_value is distinct from old.amount_value
			or new.amount_unit is distinct from old.amount_unit then
		if new.amount_value <= 0 then
			raise exception 'Amount must be positive.' using errcode = '23514';
		end if;
		new.amount_unit := pg_catalog.regexp_replace(
			pg_catalog.btrim(new.amount_unit), '[[:space:]]+', ' ', 'g'
		);
		if nullif(new.amount_unit, '') is null then
			raise exception 'Amount unit is required when amount is provided.'
				using errcode = '23514';
		end if;
		if pg_catalog.length(new.amount_unit) > 50 then
			raise exception 'Amount unit must be between 1 and 50 characters.'
				using errcode = '23514';
		end if;
	end if;

	if tg_op = 'UPDATE'
			and new.food_catalog_id is not distinct from old.food_catalog_id
			and new.food_name is not distinct from old.food_name then
		return new;
	end if;
	if tg_op = 'UPDATE' and new.food_catalog_id is not null
			and new.food_catalog_id is not distinct from old.food_catalog_id
			and new.food_name is distinct from old.food_name then
		raise exception 'Clear the food quick pick before entering a different food name.'
			using errcode = '23514';
	end if;

	if new.food_catalog_id is not null then
		select * into selected_food from core.food_catalog
		where id = new.food_catalog_id and is_active;
		if not found then
			raise exception 'Select an active food quick pick.'
				using errcode = '23514';
		end if;
		new.food_name := selected_food.name;
	else
		new.food_name := pg_catalog.regexp_replace(
			pg_catalog.btrim(new.food_name), '[[:space:]]+', ' ', 'g'
		);
		if new.food_name is null or pg_catalog.length(new.food_name) not between 1 and 200 then
			raise exception 'Enter a food name.' using errcode = '23514';
		end if;
		select * into selected_food from core.food_catalog
		where is_active
			and core.normalize_quick_pick_key(name) = core.normalize_quick_pick_key(new.food_name);
		if found then
			new.food_catalog_id := selected_food.id;
			new.food_name := selected_food.name;
		end if;
	end if;

	return new;
end;
$$;

create or replace function core.validate_chemical_addition_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	selected_catalog core.chemical_addition_catalog%rowtype;
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
		select * into selected_catalog
		from core.chemical_addition_catalog as catalog
		where catalog.id = new.catalog_id;

		if not found then
			raise exception 'Chemical addition quick pick % does not exist.', new.catalog_id
				using errcode = '23503';
		end if;
		if not selected_catalog.is_active then
			raise exception 'Select an active chemical addition quick pick.'
				using errcode = '23514';
		end if;

		new.chemical_name := selected_catalog.name;
	elsif tg_op = 'INSERT'
			or new.chemical_name is distinct from old.chemical_name then
		select * into selected_catalog
		from core.chemical_addition_catalog as catalog
		where catalog.is_active
			and core.normalize_quick_pick_key(catalog.name)
				= core.normalize_quick_pick_key(new.chemical_name);

		if found then
			new.catalog_id := selected_catalog.id;
			new.chemical_name := selected_catalog.name;
		else
			new.catalog_id := null;
		end if;
	end if;

	return new;
end;
$$;

create or replace function core.validate_star_treatment_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	selected_catalog core.star_treatment_catalog%rowtype;
begin
	new.treatment_type := core.normalize_star_treatment_type(new.treatment_type);

	if new.catalog_id is not null
			and (tg_op = 'INSERT' or new.catalog_id is distinct from old.catalog_id) then
		select * into selected_catalog
		from core.star_treatment_catalog as catalog
		where catalog.id = new.catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', new.catalog_id
				using errcode = '23503';
		end if;
		if not selected_catalog.is_active then
			raise exception 'Select an active star treatment quick pick.'
				using errcode = '23514';
		end if;

		new.treatment_type := core.normalize_star_treatment_type(selected_catalog.name);
	elsif tg_op = 'INSERT'
			or new.treatment_type is distinct from old.treatment_type then
		select * into selected_catalog
		from core.star_treatment_catalog as catalog
		where catalog.is_active
			and core.normalize_quick_pick_key(catalog.name)
				= core.normalize_quick_pick_key(new.treatment_type);

		if found then
			new.catalog_id := selected_catalog.id;
			new.treatment_type := core.normalize_star_treatment_type(selected_catalog.name);
		else
			new.catalog_id := null;
		end if;
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

-- ---------------------------------------------------------------------------
-- Star treatment RPCs: same signatures; retired quick picks cannot be newly selected.
-- ---------------------------------------------------------------------------

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
	catalog_is_active boolean;
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
		select catalog.name, catalog.is_active
		into catalog_name, catalog_is_active
		from core.star_treatment_catalog as catalog
		where catalog.id = p_catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', p_catalog_id
				using errcode = '23503';
		end if;
		if not catalog_is_active then
			raise exception 'Select an active star treatment quick pick.'
				using errcode = '23514';
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
	current_catalog_id int;
	normalized_type text;
	normalized_unit text;
	normalized_concentration_unit text;
	normalized_notes text;
	catalog_name text;
	catalog_is_active boolean;
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

	select treatment.catalog_id
	into current_catalog_id
	from core.star_treatments as treatment
	where treatment.id = p_treatment_id
	for update;

	if not found then
		raise exception 'Star treatment % does not exist.', p_treatment_id using errcode = 'P0002';
	end if;

	if p_catalog_id is null then
		normalized_type := core.normalize_star_treatment_type(p_treatment_type);
	else
		select catalog.name, catalog.is_active
		into catalog_name, catalog_is_active
		from core.star_treatment_catalog as catalog
		where catalog.id = p_catalog_id;

		if not found then
			raise exception 'Star treatment quick pick % does not exist.', p_catalog_id
				using errcode = '23503';
		end if;
		if not catalog_is_active and p_catalog_id is distinct from current_catalog_id then
			raise exception 'Select an active star treatment quick pick.'
				using errcode = '23514';
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

-- ---------------------------------------------------------------------------
-- Probiotics and Reef Dip drive name-based rules, so they can be retired but not
-- renamed to a different key or deleted.
-- ---------------------------------------------------------------------------

create or replace function core.protect_star_treatment_catalog_builtin_rows()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
	if core.normalize_quick_pick_key(old.name) in ('probiotics', 'reefdip') then
		if tg_op = 'DELETE' then
			raise exception '% is a built-in star treatment quick pick and cannot be deleted; retire it instead.',
				old.name
				using errcode = '23514';
		end if;
		if core.normalize_quick_pick_key(new.name)
				is distinct from core.normalize_quick_pick_key(old.name) then
			raise exception '% is a built-in star treatment quick pick and cannot be renamed.',
				old.name
				using errcode = '23514';
		end if;
	end if;

	if tg_op = 'DELETE' then
		return old;
	end if;
	return new;
end;
$$;

revoke execute on function core.protect_star_treatment_catalog_builtin_rows()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger star_treatment_catalog_protect_builtin_rows
	before update or delete on core.star_treatment_catalog
	for each row execute function core.protect_star_treatment_catalog_builtin_rows();

-- ---------------------------------------------------------------------------
-- Comments.
-- ---------------------------------------------------------------------------

comment on table core.chemical_addition_catalog is
	'Admin/Technician-managed lab-wide Chemical addition quick picks; defaults are editable suggestions. Retire entries with is_active = false.';
comment on table core.star_treatment_catalog is
	'Admin/Technician-managed lab-wide Star treatment quick picks; defaults are editable suggestions. Probiotics and Reef Dip cannot be renamed or deleted, only retired.';
comment on table core.food_catalog is
	'Admin/Technician-managed lab-wide feeding quick picks; retire entries with is_active = false without changing feeding history.';
comment on column core.chemical_addition_catalog.is_active is
	'Retired entries stay on historical events but cannot be newly selected or auto-linked.';
comment on column core.star_treatment_catalog.is_active is
	'Retired entries stay on historical events but cannot be newly selected or auto-linked.';
comment on column core.food_catalog.is_active is
	'Retired entries stay on historical events but cannot be newly selected or auto-linked.';
comment on column core.food_catalog.default_unit is
	'Suggested feeding amount unit; feeding_logs.amount_unit stores the entered unit.';

comment on column core.chemical_additions.catalog_id is
	'Quick-pick reference; free text matching an active entry auto-links. chemical_name and unit are event-time snapshots.';
comment on column core.star_treatments.catalog_id is
	'Quick-pick reference; free text matching an active entry auto-links. treatment_type and unit columns are event-time snapshots.';
comment on column core.feeding_logs.food_catalog_id is
	'Quick-pick reference; free text matching an active entry auto-links. Entries with dependent logs cannot be deleted.';
comment on column core.feeding_logs.amount_value is
	'Positive numeric amount for new entries (fractions allowed); legacy amount text is preserved without conversion. Readers use amount_value when present, else display amount verbatim.';
comment on column core.feeding_logs.amount_unit is
	'Event-time unit snapshot; required when amount_value is entered or changed, NULL when amount_value is NULL.';
