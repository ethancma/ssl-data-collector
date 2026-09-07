-- animals — the roster of individually-tracked animals/cohorts housed in tanks.
-- Roster changes (adding/retiring an animal) are admin-managed, not day-to-day log
-- entries, so writes are admin-only for now; read follows the standard active-member
-- policy shared by every other reference/log table.

create table core.animals (
  id serial primary key,
  tank_id int not null references core.tanks (id) on delete cascade,
  species_id int not null references core.species (id),
  name text not null unique,
  life_stage text,
  tracking_type text not null check (tracking_type in ('individual', 'cohort')),
  quantity int not null default 1,
  status text not null default 'active'
    check (status in ('active', 'deceased', 'transferred')),
  date_added date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index animals_tank_id_idx on core.animals (tank_id);
create index animals_species_id_idx on core.animals (species_id);

create trigger animals_set_updated_at
  before update on core.animals
  for each row execute function core.set_updated_at();

do $$
declare
  t text;
begin
  for t in select unnest(array['animals'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on core.animals to authenticated;

create policy "animals_read_active_member" on core.animals
  for select to authenticated
  using (core.is_active_member());

create policy "animals_admin_write" on core.animals
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());
