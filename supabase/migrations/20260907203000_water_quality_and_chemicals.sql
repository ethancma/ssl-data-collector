-- water_quality_readings + chemical_additions — weekly chemistry logging and dosing
-- events, following the daily_checks pattern (text+CHECK vocab, data_source +
-- event/entered timestamps, recorded_by defaulted server-side, contributor/admin RLS).

create table core.water_quality_readings (
  id serial primary key,
  system_id int not null references core.systems (id) on delete cascade,
  tested_at timestamptz not null default now(),
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  ph numeric(4, 2),
  ph_source text check (ph_source in ('manual', 'apex_probe')),
  magnesium numeric,
  ammonia numeric,
  alkalinity numeric,
  calcium numeric,
  phosphate numeric,
  salinity numeric,
  notes text,
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now()
);

create index water_quality_readings_system_tested_idx
  on core.water_quality_readings (system_id, tested_at desc);

create table core.chemical_additions (
  id serial primary key,
  system_id int not null references core.systems (id) on delete cascade,
  chemical_name text not null,
  amount numeric not null,
  unit text not null,
  added_at timestamptz not null default now(),
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  reason text,
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now()
);

create index chemical_additions_system_added_idx
  on core.chemical_additions (system_id, added_at desc);

do $$
declare
  t text;
begin
  for t in select unnest(array['water_quality_readings', 'chemical_additions'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on core.water_quality_readings to authenticated;

create policy "water_quality_readings_read_active_member" on core.water_quality_readings
  for select to authenticated
  using (core.is_active_member());

create policy "water_quality_readings_insert_contributor" on core.water_quality_readings
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

create policy "water_quality_readings_admin_all" on core.water_quality_readings
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

grant select, insert, update, delete on core.chemical_additions to authenticated;

create policy "chemical_additions_read_active_member" on core.chemical_additions
  for select to authenticated
  using (core.is_active_member());

create policy "chemical_additions_insert_contributor" on core.chemical_additions
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

create policy "chemical_additions_admin_all" on core.chemical_additions
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());
