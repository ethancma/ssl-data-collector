-- Batch Feeding and Star treatment logging: one ordinary log row per included animal,
-- written by RPCs that replay retries from an append-only request ledger.
--
-- Client-detectable errors (SQLSTATE + message prefix):
--   SSL01 'STALE_PREVIEW: ...'       included ∪ excluded no longer equals the eligible set,
--                                     or the selected animal is no longer in the scope.
--   SSL02 'REQUEST_ID_CONFLICT: ...' request UUID reused with a different actor/operation/payload.
--   SSL03 'NO_ELIGIBLE_ANIMALS: ...' the scope has no eligible animals.

-- ---------------------------------------------------------------------------
-- Append-only request ledger. Writes come only from the batch RPCs.
-- ---------------------------------------------------------------------------

create table core.operational_batch_requests (
	request_id uuid primary key,
	operation text not null,
	scope_system_id int not null references core.systems (id) on delete restrict,
	scope_tank_id int references core.tanks (id) on delete restrict,
	scope_animal_id int references core.animals (id) on delete restrict,
	payload jsonb not null,
	included_animal_ids int[] not null,
	excluded_animal_ids int[] not null,
	actor_profile_id int not null references core.profiles (id) on delete restrict,
	created_at timestamptz not null default pg_catalog.statement_timestamp(),
	result jsonb not null,
	constraint operational_batch_requests_operation_check
		check (operation in ('feeding', 'star_treatment')),
	constraint operational_batch_requests_scope_animal_check
		check (scope_animal_id is null or scope_tank_id is not null),
	constraint operational_batch_requests_included_check
		check (pg_catalog.cardinality(included_animal_ids) > 0)
);

create index operational_batch_requests_scope_system_created_idx
	on core.operational_batch_requests (scope_system_id, created_at desc);
create index operational_batch_requests_scope_tank_id_idx
	on core.operational_batch_requests (scope_tank_id);
create index operational_batch_requests_scope_animal_id_idx
	on core.operational_batch_requests (scope_animal_id);
create index operational_batch_requests_actor_created_idx
	on core.operational_batch_requests (actor_profile_id, created_at desc);

comment on table core.operational_batch_requests is
	'Append-only batch Feeding/Star treatment request ledger written by the batch RPCs; result.records links the request to its log rows. Readable by active Admin and Technician profiles only.';
comment on column core.operational_batch_requests.payload is
	'Canonical shared form values (including notes) compared on request-ID replay.';
comment on column core.operational_batch_requests.scope_system_id is
	'Requested scope; NULL means not narrowed to this level. Each created log row''s tank snapshot is in result.records[].tank_id and the log table.';
comment on column core.operational_batch_requests.scope_tank_id is
	'Requested scope; NULL means not narrowed to this level. Each created log row''s tank snapshot is in result.records[].tank_id and the log table.';
comment on column core.operational_batch_requests.scope_animal_id is
	'Requested scope; NULL means not narrowed to this level. Each created log row''s tank snapshot is in result.records[].tank_id and the log table.';
comment on column core.operational_batch_requests.result is
	'RPC result returned verbatim (with replayed = true) when the same request ID is retried.';

alter table core.operational_batch_requests enable row level security;

revoke all on table core.operational_batch_requests
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select on table core.operational_batch_requests to admin, technician;

create policy "operational_batch_requests_admin_technician_select"
	on core.operational_batch_requests for select to admin, technician
	using ((select core.is_active_member()));

create policy live_native_role on core.operational_batch_requests
	as restrictive for all to admin, technician, volunteer, viewer
	using ((select core.matches_live_profile_role()))
	with check ((select core.matches_live_profile_role()));

-- ---------------------------------------------------------------------------
-- Shared Star treatment field validation and normalization (single + batch RPCs).
-- ---------------------------------------------------------------------------

create function core.normalize_star_treatment_input(
	p_administered_at timestamptz,
	p_treatment_type text,
	p_catalog_id int,
	p_amount numeric,
	p_unit text,
	p_concentration numeric,
	p_concentration_unit text,
	p_notes text,
	out normalized_type text,
	out normalized_unit text,
	out normalized_concentration_unit text,
	out normalized_notes text
)
	language plpgsql
	stable
	set search_path = pg_catalog, core
	as $$
declare
	catalog_name text;
	catalog_is_active boolean;
begin
	if p_administered_at is null then
		raise exception 'Administered time is required.' using errcode = '23502';
	end if;

	if (p_administered_at at time zone 'America/Los_Angeles')::date
			<> (pg_catalog.statement_timestamp() at time zone 'America/Los_Angeles')::date then
		raise exception 'Live star treatments must use the current America/Los_Angeles date.'
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
end;
$$;

-- Same signature, grants, and rules; field checks now run before the animal lookup.
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
	normalized record;
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

	select * into normalized
	from core.normalize_star_treatment_input(
		p_administered_at,
		p_treatment_type,
		p_catalog_id,
		p_amount,
		p_unit,
		p_concentration,
		p_concentration_unit,
		p_notes
	);

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
		normalized.normalized_type,
		p_amount,
		normalized.normalized_unit,
		p_concentration,
		normalized.normalized_concentration_unit,
		normalized.normalized_notes,
		p_administered_at,
		actor_profile.id,
		'live',
		p_catalog_id
	)
	returning * into created_treatment;

	return created_treatment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared batch steps 1-7: live role, request-ID replay, array checks, scope,
-- locked eligible set, and exact-set comparison. Returns replayed_result on replay.
-- ---------------------------------------------------------------------------

create function core.begin_operational_batch(
	p_operation text,
	p_request_id uuid,
	p_system_id int,
	p_tank_id int,
	p_animal_id int,
	p_included_animal_ids int[],
	p_excluded_animal_ids int[],
	p_payload jsonb,
	out batch_actor_profile_id int,
	out replayed_result jsonb,
	out sorted_included_ids int[],
	out sorted_excluded_ids int[]
)
	language plpgsql
	set search_path = pg_catalog, core
	as $$
declare
	existing_request core.operational_batch_requests%rowtype;
	scope_tank_system_id int;
	scope_animal_tank_id int;
	eligible_ids int[];
begin
	-- 1. Active contributor whose native session role still matches the profile.
	select profile.id
	into batch_actor_profile_id
	from core.profiles as profile
	where profile.auth_user_id = auth.uid()
		and profile.status = 'active'
		and profile.role in ('admin', 'technician', 'volunteer');

	if not found then
		raise exception 'An active Admin, Technician, or Volunteer profile is required.'
			using errcode = '42501';
	end if;
	if not core.matches_live_profile_role() then
		raise exception 'The current profile role does not match this session.'
			using errcode = '42501';
	end if;

	if p_operation is null or p_operation not in ('feeding', 'star_treatment') then
		raise exception 'Unsupported batch operation.' using errcode = '22023';
	end if;
	if p_request_id is null then
		raise exception 'A request ID is required.' using errcode = '22023';
	end if;

	if p_included_animal_ids is not null then
		sorted_included_ids := array(
			select input.id from pg_catalog.unnest(p_included_animal_ids) as input (id)
			order by input.id
		);
	end if;
	if p_excluded_animal_ids is not null then
		sorted_excluded_ids := array(
			select input.id from pg_catalog.unnest(p_excluded_animal_ids) as input (id)
			order by input.id
		);
	end if;

	-- 2. Serialize by request ID; replay or reject before rechecking current scope.
	perform pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended(p_request_id::text, 0)
	);

	select request.*
	into existing_request
	from core.operational_batch_requests as request
	where request.request_id = p_request_id;

	if found then
		if existing_request.operation <> p_operation
				or existing_request.actor_profile_id <> batch_actor_profile_id
				or existing_request.scope_system_id is distinct from p_system_id
				or existing_request.scope_tank_id is distinct from p_tank_id
				or existing_request.scope_animal_id is distinct from p_animal_id
				or existing_request.payload is distinct from p_payload
				or existing_request.included_animal_ids is distinct from sorted_included_ids
				or existing_request.excluded_animal_ids is distinct from sorted_excluded_ids then
			raise exception 'REQUEST_ID_CONFLICT: This request ID was already used for a different save.'
				using errcode = 'SSL02';
		end if;

		replayed_result := existing_request.result
			|| pg_catalog.jsonb_build_object('replayed', true);
		return;
	end if;

	-- 3. Null or duplicate IDs.
	if sorted_included_ids is null or sorted_excluded_ids is null then
		raise exception 'Included and excluded animal lists are required.'
			using errcode = '22023';
	end if;
	if pg_catalog.array_position(sorted_included_ids, null) is not null
			or pg_catalog.array_position(sorted_excluded_ids, null) is not null then
		raise exception 'Animal lists cannot contain empty IDs.' using errcode = '22023';
	end if;
	if (select pg_catalog.count(distinct input.id)
			from pg_catalog.unnest(sorted_included_ids) as input (id))
			<> pg_catalog.cardinality(sorted_included_ids)
		or (select pg_catalog.count(distinct input.id)
			from pg_catalog.unnest(sorted_excluded_ids) as input (id))
			<> pg_catalog.cardinality(sorted_excluded_ids) then
		raise exception 'Animal lists cannot contain duplicate IDs.' using errcode = '22023';
	end if;

	-- 4. Scope: system, optional tank in that system, optional animal in that tank.
	if p_system_id is null then
		raise exception 'Select a system.' using errcode = '22023';
	end if;
	perform 1 from core.systems as selected_system where selected_system.id = p_system_id;
	if not found then
		raise exception 'The selected system does not exist.' using errcode = '23503';
	end if;

	if p_tank_id is not null then
		select tank.system_id
		into scope_tank_system_id
		from core.tanks as tank
		where tank.id = p_tank_id;

		if not found then
			raise exception 'The selected tank does not exist.' using errcode = '23503';
		end if;
		if scope_tank_system_id <> p_system_id then
			raise exception 'The selected tank does not belong to the selected system.'
				using errcode = '23514';
		end if;
	end if;

	if p_animal_id is not null then
		if p_tank_id is null then
			raise exception 'Select a tank before selecting an animal.' using errcode = '22023';
		end if;

		select animal.tank_id
		into scope_animal_tank_id
		from core.animals as animal
		where animal.id = p_animal_id;

		if not found then
			raise exception 'The selected animal does not exist.' using errcode = '23503';
		end if;
		if scope_animal_tank_id <> p_tank_id then
			raise exception 'STALE_PREVIEW: The selected animal is no longer in this tank. Nothing was saved; refresh and try again.'
				using errcode = 'SSL01';
		end if;
	end if;

	-- 5. Current eligible set, locked for the rest of the transaction.
	select coalesce(pg_catalog.array_agg(locked.id order by locked.id), '{}'::int[])
	into eligible_ids
	from (
		select animal.id
		from core.animals as animal
		join core.tanks as tank on tank.id = animal.tank_id
		join core.species as species on species.id = animal.species_id
		where tank.system_id = p_system_id
			and (p_tank_id is null or animal.tank_id = p_tank_id)
			and (p_animal_id is null or animal.id = p_animal_id)
			and animal.status = 'active'
			and (
				p_operation = 'feeding'
				or (animal.tracking_type = 'individual' and species.category = 'star')
			)
		for share of animal, species
	) as locked;

	-- 6. An empty scope is never a successful save.
	if pg_catalog.cardinality(eligible_ids) = 0 then
		raise exception 'NO_ELIGIBLE_ANIMALS: No eligible animals are in the selected scope.'
			using errcode = 'SSL03';
	end if;

	-- 7. included ∪ excluded must exactly equal the eligible set.
	if sorted_included_ids && sorted_excluded_ids then
		raise exception 'An animal cannot be both included and excluded.' using errcode = '22023';
	end if;
	if pg_catalog.cardinality(sorted_included_ids) = 0 then
		raise exception 'Include at least one animal.' using errcode = '22023';
	end if;
	if array(
		select scope.id
		from pg_catalog.unnest(sorted_included_ids || sorted_excluded_ids) as scope (id)
		order by scope.id
	) <> eligible_ids then
		raise exception 'STALE_PREVIEW: The animals in this scope changed. Nothing was saved; refresh the list and try again.'
			using errcode = 'SSL01';
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Batch RPCs.
-- ---------------------------------------------------------------------------

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

	-- 8. Food and amount rules run per row in the existing insert trigger.
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

	-- 9. Ledger row in the same transaction.
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

create function core.create_star_treatment_batch(
	p_request_id uuid,
	p_system_id int,
	p_included_animal_ids int[],
	p_excluded_animal_ids int[],
	p_administered_at timestamptz,
	p_tank_id int default null,
	p_animal_id int default null,
	p_amount numeric default null,
	p_unit text default null,
	p_concentration numeric default null,
	p_concentration_unit text default null,
	p_treatment_type text default 'probiotics',
	p_notes text default null,
	p_catalog_id int default null
)
	returns jsonb
	language plpgsql
	security definer
	set search_path = pg_catalog, core
	as $$
declare
	request_payload jsonb;
	batch record;
	normalized record;
	created_count int;
	created_records jsonb;
	batch_result jsonb;
begin
	request_payload := pg_catalog.jsonb_build_object(
		'administered_at',
		pg_catalog.to_char(
			p_administered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
		),
		'catalog_id', p_catalog_id,
		'treatment_type', nullif(
			pg_catalog.regexp_replace(pg_catalog.btrim(p_treatment_type), '[[:space:]]+', ' ', 'g'),
			''
		),
		'amount', p_amount,
		'unit', case when p_amount is not null then nullif(
			pg_catalog.regexp_replace(pg_catalog.btrim(p_unit), '[[:space:]]+', ' ', 'g'),
			''
		) end,
		'concentration', p_concentration,
		'concentration_unit', case when p_concentration is not null then nullif(
			pg_catalog.regexp_replace(
				pg_catalog.btrim(p_concentration_unit), '[[:space:]]+', ' ', 'g'
			),
			''
		) end,
		'notes', nullif(pg_catalog.btrim(p_notes), '')
	);

	select * into batch
	from core.begin_operational_batch(
		'star_treatment',
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

	select * into normalized
	from core.normalize_star_treatment_input(
		p_administered_at,
		p_treatment_type,
		p_catalog_id,
		p_amount,
		p_unit,
		p_concentration,
		p_concentration_unit,
		p_notes
	);

	-- 8. One set-based insert; each row snapshots the animal's current tank.
	with inserted as (
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
		select
			animal.id,
			animal.tank_id,
			normalized.normalized_type,
			p_amount,
			normalized.normalized_unit,
			p_concentration,
			normalized.normalized_concentration_unit,
			normalized.normalized_notes,
			p_administered_at,
			batch.batch_actor_profile_id,
			'live',
			p_catalog_id
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

	-- 9. Ledger row in the same transaction.
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
		'star_treatment',
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
comment on function core.create_star_treatment_batch(
	uuid, int, int[], int[], timestamptz, int, int, numeric, text, numeric, text, text, text, int
) is
	'Creates one star_treatments row per included active, individually tracked star in the system/tank/animal scope. Retrying a request ID replays its stored result. Errors: SSL01 STALE_PREVIEW, SSL02 REQUEST_ID_CONFLICT, SSL03 NO_ELIGIBLE_ANIMALS.';

-- ---------------------------------------------------------------------------
-- Grants: helpers are internal; batch RPCs follow create_star_treatment.
-- ---------------------------------------------------------------------------

revoke execute on function
	core.normalize_star_treatment_input(
		timestamptz, text, int, numeric, text, numeric, text, text
	),
	core.begin_operational_batch(text, uuid, int, int, int, int[], int[], jsonb)
from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

revoke execute on function
	core.create_star_treatment(
		int, int, numeric, text, numeric, text, text, text, timestamptz, int
	),
	core.create_feeding_batch(
		uuid, int, int[], int[], timestamptz, int, int, int, numeric, text
	),
	core.create_star_treatment_batch(
		uuid, int, int[], int[], timestamptz, int, int, numeric, text, numeric, text, text, text, int
	)
from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant execute on function
	core.create_star_treatment(
		int, int, numeric, text, numeric, text, text, text, timestamptz, int
	),
	core.create_feeding_batch(
		uuid, int, int[], int[], timestamptz, int, int, int, numeric, text
	),
	core.create_star_treatment_batch(
		uuid, int, int[], int[], timestamptz, int, int, numeric, text, numeric, text, text, text, int
	)
to admin, technician, volunteer;
