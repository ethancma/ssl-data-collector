-- Feeding logs reference lab-wide food quick picks; catalog names and units are
-- read from the referenced entry.

create table core.food_catalog (
	id serial primary key,
	name text not null,
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint food_catalog_name_check check (
		name = pg_catalog.regexp_replace(pg_catalog.btrim(name), '[[:space:]]+', ' ', 'g')
		and pg_catalog.length(name) between 1 and 200
	)
);

create unique index food_catalog_name_key
	on core.food_catalog (core.normalize_quick_pick_key(name));

create trigger food_catalog_set_updated_at
	before update on core.food_catalog
	for each row execute function core.set_updated_at();

insert into core.food_catalog (name)
values
	('Krill'),
	('Brine shrimp'),
	('Abalone'),
	('Purple urchin'),
	('Painted urchin'),
	('Microalgae');

alter table core.food_catalog enable row level security;

revoke all on table core.food_catalog
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.food_catalog_id_seq
	from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
grant select, insert, update, delete on table core.food_catalog to admin;
grant select on table core.food_catalog to technician, volunteer, viewer;
grant usage, select on sequence core.food_catalog_id_seq to admin;

create policy "food_catalog_active_member_select" on core.food_catalog
	for select to admin, technician, volunteer, viewer
	using ((select core.is_active_member()));
create policy "food_catalog_admin_insert" on core.food_catalog
	for insert to admin with check ((select core.is_active_member()));
create policy "food_catalog_admin_update" on core.food_catalog
	for update to admin
	using ((select core.is_active_member()))
	with check ((select core.is_active_member()));
create policy "food_catalog_admin_delete" on core.food_catalog
	for delete to admin using ((select core.is_active_member()));

alter table core.feeding_logs
	add column food_catalog_id integer not null references core.food_catalog (id) on delete restrict,
	add column amount_value numeric,
	add constraint feeding_logs_amount_value_finite_check check (
		amount_value is null or amount_value not in (
			'-Infinity'::numeric, 'Infinity'::numeric, 'NaN'::numeric
		)
	);

create index feeding_logs_food_catalog_id_idx
	on core.feeding_logs (food_catalog_id) where food_catalog_id is not null;

comment on table core.food_catalog is
	'Admin-managed feeding quick picks; deactivate entries to retire them without changing feeding history.';
comment on column core.feeding_logs.food_catalog_id is
	'Required food catalog reference; food names and units are read from the catalog.';
comment on column analytics.fact_feeding.food_name is
	'Catalog food name from core.food_catalog.name via core.feeding_logs.food_catalog_id.';
comment on column analytics.fact_feeding.amount is
	'Text rendering of core.feeding_logs.amount_value; include the referenced catalog default_unit when reporting units.';
comment on column core.feeding_logs.amount_value is
	'Optional positive finite numeric amount; its unit is core.food_catalog.default_unit.';

create or replace function core.validate_feeding_food_mutation()
	returns trigger
	language plpgsql
	set search_path = pg_catalog, core
	as $$
begin
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
