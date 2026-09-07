-- analytics schema — star-schema reporting layer, separate from (and does not
-- replace) the operational tables in core. Read-only for all active members;
-- admins get full read/write for manual seeding/testing. Population from the
-- operational tables via SECURITY DEFINER sync triggers is a separate future
-- migration — not built here.
--
-- No UUID surrogate keys anywhere in this schema (serial/int only), except
-- dim_date, whose natural key (the date itself) doubles as its primary key.
--
-- The public.rls_auto_enable event trigger only auto-enables RLS for tables
-- created in the `public` schema, so every table below enables RLS explicitly.

create schema analytics;

grant usage on schema analytics to authenticated;

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------

create table analytics.dim_date (
  date date primary key,
  day_of_week text not null,
  month text not null,
  year int not null,
  day_of_month int not null,
  iso_week int not null,
  is_weekend boolean not null
);

insert into analytics.dim_date (date, day_of_week, month, year, day_of_month, iso_week, is_weekend)
select
  d::date,
  to_char(d, 'Dy'),
  to_char(d, 'Mon'),
  extract(year from d)::int,
  extract(day from d)::int,
  extract(week from d)::int,
  extract(isodow from d) in (6, 7)
from generate_series('2020-01-01'::date, '2040-01-01'::date, '1 day'::interval) as d;

create table analytics.dim_system (
  id serial primary key,
  slug text unique not null,
  name text not null,
  category text not null,
  has_animals boolean not null,
  apex_ph_probe_confirmed boolean not null
);

create table analytics.dim_tank (
  id serial primary key,
  system_id int not null references analytics.dim_system (id),
  name text not null,
  tank_type text not null,
  pair_group text,
  size_liters numeric,
  shelf_position text,
  unique (system_id, name)
);

create table analytics.dim_species (
  id serial primary key,
  common_name text unique not null,
  scientific_name text not null,
  category text not null
);

create table analytics.dim_animal (
  id serial primary key,
  tank_id int not null references analytics.dim_tank (id),
  species_id int not null references analytics.dim_species (id),
  name text unique not null,
  life_stage text,
  tracking_type text,
  status text
);

create table analytics.dim_chemical (
  id serial primary key,
  name text unique not null
);

create table analytics.dim_profile (
  id serial primary key,
  email text unique not null,
  display_name text,
  role text
);

-- ---------------------------------------------------------------------------
-- Facts
-- ---------------------------------------------------------------------------

create table analytics.fact_daily_check (
  id serial primary key,
  date date not null references analytics.dim_date (date),
  event_time timestamptz not null,
  system_id int not null references analytics.dim_system (id),
  profile_id int references analytics.dim_profile (id),
  check_type text not null,
  water_running boolean,
  temperature numeric
);

create table analytics.fact_water_quality (
  id serial primary key,
  date date not null references analytics.dim_date (date),
  event_time timestamptz not null,
  system_id int not null references analytics.dim_system (id),
  profile_id int references analytics.dim_profile (id),
  ph numeric,
  ph_source text,
  magnesium numeric,
  ammonia numeric,
  alkalinity numeric,
  calcium numeric,
  phosphate numeric,
  salinity numeric,
  data_source text
);

create table analytics.fact_chemical_addition (
  id serial primary key,
  date date not null references analytics.dim_date (date),
  event_time timestamptz not null,
  system_id int not null references analytics.dim_system (id),
  chemical_id int not null references analytics.dim_chemical (id),
  profile_id int references analytics.dim_profile (id),
  amount numeric,
  unit text,
  reason text,
  data_source text
);

create table analytics.fact_feeding (
  id serial primary key,
  date date not null references analytics.dim_date (date),
  event_time timestamptz not null,
  system_id int not null references analytics.dim_system (id),
  tank_id int not null references analytics.dim_tank (id),
  animal_id int not null references analytics.dim_animal (id),
  profile_id int references analytics.dim_profile (id),
  food_type text,
  amount text,
  consumption_status text,
  data_source text
);

create table analytics.fact_health_observation (
  id serial primary key,
  date date not null references analytics.dim_date (date),
  event_time timestamptz not null,
  system_id int not null references analytics.dim_system (id),
  tank_id int not null references analytics.dim_tank (id),
  animal_id int not null references analytics.dim_animal (id),
  profile_id int references analytics.dim_profile (id),
  severity text,
  has_photo boolean,
  notes text,
  data_source text
);

create table analytics.fact_health_observation_issue (
  health_observation_id int not null references analytics.fact_health_observation (id) on delete cascade,
  issue text not null,
  primary key (health_observation_id, issue)
);

-- ---------------------------------------------------------------------------
-- RLS: read-only for active members, full read/write for admins.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'dim_date', 'dim_system', 'dim_tank', 'dim_species', 'dim_animal',
      'dim_chemical', 'dim_profile', 'fact_daily_check', 'fact_water_quality',
      'fact_chemical_addition', 'fact_feeding', 'fact_health_observation',
      'fact_health_observation_issue'
    ])
  loop
    execute format('alter table analytics.%I enable row level security', t);
    execute format('grant select, insert, update, delete on analytics.%I to authenticated', t);
    execute format(
      'create policy "%s_read_active_member" on analytics.%I for select to authenticated using (core.is_active_member())',
      t, t
    );
    execute format(
      'create policy "%s_admin_all" on analytics.%I for all to authenticated using (core.is_admin()) with check (core.is_admin())',
      t, t
    );
  end loop;
end;
$$;
