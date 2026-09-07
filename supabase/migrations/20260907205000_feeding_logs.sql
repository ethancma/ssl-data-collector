-- feeding_logs — per-animal feeding + same-day consumption follow-up, following the
-- same log-table pattern as daily_checks/water_quality_readings.

create table core.feeding_logs (
  id serial primary key,
  tank_id int not null references core.tanks (id),
  animal_id int not null references core.animals (id) on delete cascade,
  food_type text not null
    check (food_type in ('krill', 'brine_shrimp', 'abalone', 'urchin_purple', 'urchin_white', 'microalgae', 'other')),
  amount text,
  fed_at timestamptz not null default now(),
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  consumption_status text check (consumption_status in ('full', 'partial', 'none', 'unknown')),
  consumption_checked_at timestamptz,
  notes text,
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now()
);

create index feeding_logs_animal_fed_idx on core.feeding_logs (animal_id, fed_at desc);
create index feeding_logs_tank_fed_idx on core.feeding_logs (tank_id, fed_at desc);

do $$
declare
  t text;
begin
  for t in select unnest(array['feeding_logs'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on core.feeding_logs to authenticated;

create policy "feeding_logs_read_active_member" on core.feeding_logs
  for select to authenticated
  using (core.is_active_member());

create policy "feeding_logs_insert_contributor" on core.feeding_logs
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

create policy "feeding_logs_admin_all" on core.feeding_logs
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());
