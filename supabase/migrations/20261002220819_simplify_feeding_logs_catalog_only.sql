-- Feeding logs reference catalog entries only; numeric amounts use catalog units.

-- Historical free-text names become inactive catalog entries when no matching
-- catalog key exists. Allow "Other" as a literal historical catalog name now
-- that event rows can no longer store an unlinked food name.
alter table core.food_catalog
	drop constraint food_catalog_name_check,
	add constraint food_catalog_name_check check (
		name = pg_catalog.regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')
		and pg_catalog.length(name) between 1 and 200
	);

with historical_foods as (
	select
		feeding.id,
		feeding.food_name,
		core.normalize_quick_pick_key(feeding.food_name) as food_key,
		feeding.amount_unit
	from core.feeding_logs as feeding
	where feeding.food_catalog_id is null
		and feeding.food_name is not null
),
unmatched_foods as (
	select historical.*
	from historical_foods as historical
	where not exists (
		select 1
		from core.food_catalog as catalog
		where core.normalize_quick_pick_key(catalog.name) = historical.food_key
	)
),
food_names as (
	select distinct on (food_key) food_key, food_name
	from unmatched_foods
	order by food_key, id
),
food_units as (
	select distinct on (food_key) food_key, amount_unit
	from (
		select food_key, amount_unit, count(*) as unit_count
		from unmatched_foods
		where amount_unit is not null
		group by food_key, amount_unit
	) as unit_counts
	order by food_key, unit_count desc, amount_unit
)
insert into core.food_catalog (name, is_active, default_unit)
select foods.food_name, false, coalesce(units.amount_unit, 'pieces')
from food_names as foods
left join food_units as units using (food_key)
on conflict (core.normalize_quick_pick_key(name)) do nothing;

update core.feeding_logs as feeding
set food_catalog_id = catalog.id
from core.food_catalog as catalog
where feeding.food_catalog_id is null
	and feeding.food_name is not null
	and core.normalize_quick_pick_key(feeding.food_name)
		= core.normalize_quick_pick_key(catalog.name);

insert into core.food_catalog (name, is_active, default_unit)
values (
	'Unknown',
	false,
	coalesce(
		(
			select feeding.amount_unit
			from core.feeding_logs as feeding
			where feeding.food_catalog_id is null
				and feeding.food_name is null
				and feeding.amount_unit is not null
			group by feeding.amount_unit
			order by count(*) desc, feeding.amount_unit
			limit 1
		),
		'pieces'
	)
)
on conflict (core.normalize_quick_pick_key(name)) do update
set name = 'Unknown', is_active = false;

update core.feeding_logs as feeding
set food_catalog_id = catalog.id
from core.food_catalog as catalog
where feeding.food_catalog_id is null
	and feeding.food_name is null
	and core.normalize_quick_pick_key(catalog.name) = 'unknown';

alter table core.feeding_logs
	alter column food_catalog_id set not null,
	drop constraint feeding_logs_food_name_check,
	drop constraint feeding_logs_amount_unit_check,
	drop constraint feeding_logs_amount_unit_requires_value_check,
	drop column food_name,
	drop column amount_unit,
	drop column amount;

drop trigger if exists feeding_logs_validate_food on core.feeding_logs;

create or replace function core.validate_feeding_food_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
	if new.amount_value is not null and new.amount_value <= 0 then
		raise exception 'Amount must be positive.' using errcode = '23514';
	end if;

	if tg_op = 'UPDATE'
			and new.food_catalog_id is not distinct from old.food_catalog_id then
		return new;
	end if;

	if not exists (
		select 1
		from core.food_catalog as catalog
		where catalog.id = new.food_catalog_id
			and catalog.is_active
	) then
		raise exception 'Select an active food quick pick.'
			using errcode = '23514';
	end if;

	return new;
end;
$$;

revoke execute on function core.validate_feeding_food_mutation()
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger feeding_logs_validate_food
	before insert or update on core.feeding_logs
	for each row execute function core.validate_feeding_food_mutation();

comment on column core.feeding_logs.food_catalog_id is
	'Required food catalog reference; food names and units are read from the catalog.';
comment on column core.feeding_logs.amount_value is
	'Optional positive finite numeric amount; its unit is core.food_catalog.default_unit.';
comment on column analytics.fact_feeding.food_name is
	'Catalog food name from core.food_catalog.name via core.feeding_logs.food_catalog_id.';
comment on column analytics.fact_feeding.amount is
	'Text rendering of core.feeding_logs.amount_value; include the referenced catalog default_unit when reporting units.';

-- Remove the previous overload before installing the catalog-only RPC contract.
drop function core.create_feeding_batch(
	uuid, int, int[], int[], timestamptz, int, int, int, text, numeric, text, text
);

create function core.create_feeding_batch(
	p_request_id uuid,
	p_system_id int,
	p_included_animal_ids int[],
	p_excluded_animal_ids int[],
	p_fed_at timestamptz,
	p_food_catalog_id int,
	p_tank_id int default null,
	p_animal_id int default null,
	p_amount_value numeric default null,
	p_notes text default null
)
	returns jsonb
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	request_payload jsonb;
	batch record;
	created_count int;
	created_records jsonb;
	batch_result jsonb;
begin
	if p_food_catalog_id is null then
		raise exception 'Select an active food quick pick.' using errcode = '23514';
	end if;

	request_payload := pg_catalog.jsonb_build_object(
		'fed_at',
		pg_catalog.to_char(p_fed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
		'food_catalog_id', p_food_catalog_id,
		'amount_value', p_amount_value,
		'notes', nullif(pg_catalog.btrim(p_notes), '')
	);

	select * into batch
	from core.begin_operational_batch(
		'feeding',
		p_request_id,
		p_system_id,
		p_tank_id,
		p_animal_id,
		p_included_animal_ids,
		p_excluded_animal_ids,
		request_payload
	);

	if batch.replayed_result is not null then
		return batch.replayed_result;
	end if;

	if p_fed_at is null then
		raise exception 'Fed time is required.' using errcode = '23502';
	end if;

	with inserted as (
		insert into core.feeding_logs (
			fed_at,
			animal_id,
			tank_id,
			food_catalog_id,
			amount_value,
			notes
		)
		select
			p_fed_at,
			animal.id,
			animal.tank_id,
			p_food_catalog_id,
			p_amount_value,
			nullif(pg_catalog.btrim(p_notes), '')
		from core.animals as animal
		where animal.id = any (batch.sorted_included_ids)
		order by animal.id
		returning id, animal_id, tank_id
	)
	select
		pg_catalog.count(*)::int,
		coalesce(
			pg_catalog.jsonb_agg(
				pg_catalog.jsonb_build_object(
					'id', inserted.id,
					'animal_id', inserted.animal_id,
					'tank_id', inserted.tank_id
				)
				order by inserted.animal_id
			),
			'[]'::jsonb
		)
	into created_count, created_records
	from inserted;

	batch_result := pg_catalog.jsonb_build_object(
		'request_id', p_request_id,
		'replayed', false,
		'created_count', created_count,
		'excluded_animal_ids', pg_catalog.to_jsonb(batch.sorted_excluded_ids),
		'records', created_records
	);

	insert into core.operational_batch_requests (
		request_id,
		operation,
		scope_system_id,
		scope_tank_id,
		scope_animal_id,
		payload,
		included_animal_ids,
		excluded_animal_ids,
		actor_profile_id,
		result
	)
	values (
		p_request_id,
		'feeding',
		p_system_id,
		p_tank_id,
		p_animal_id,
		request_payload,
		batch.sorted_included_ids,
		batch.sorted_excluded_ids,
		batch.batch_actor_profile_id,
		batch_result
	);

	return batch_result;
end;
$$;

comment on function core.create_feeding_batch(
	uuid, int, int[], int[], timestamptz, int, int, int, numeric, text
) is
	'Creates one catalog-backed feeding_logs row per included active animal in the requested scope. Retrying a request ID replays its stored result.';

revoke execute on function core.create_feeding_batch(
	uuid, int, int[], int[], timestamptz, int, int, int, numeric, text
)
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function core.create_feeding_batch(
	uuid, int, int[], int[], timestamptz, int, int, int, numeric, text
)
	to admin, technician, volunteer;
