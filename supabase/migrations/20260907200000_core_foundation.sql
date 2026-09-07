-- Foundation: auth profiles + approval gate, reference data (systems/species) as
-- DB source of truth, and tanks. Enum-like columns use text + CHECK (never native
-- Postgres enums) so still-evolving vocab stays cheap to change. Every operational
-- table lives in the `core` schema; the ensure_rls event trigger from the prior
-- migration only auto-enables RLS for `public`, so RLS is enabled explicitly below.

set local check_function_bodies = off;

create schema core;

grant usage on schema core to authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function core.set_updated_at()
  returns trigger
  language plpgsql
  as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- SECURITY DEFINER so role checks inside RLS policies bypass RLS on profiles and
-- avoid infinite policy recursion.
create or replace function core.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = core
  as $$
  select exists (
    select 1 from core.profiles
    where auth_user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function core.is_active_member()
  returns boolean
  language sql
  stable
  security definer
  set search_path = core
  as $$
  select exists (
    select 1 from core.profiles
    where auth_user_id = auth.uid() and status = 'active'
  );
$$;

-- Resolves the caller's core.profiles.id; used as the DEFAULT for recorded_by/
-- uploaded_by columns and in the matching RLS insert checks (subqueries aren't
-- allowed directly in a column DEFAULT expression, but a function call is).
create or replace function core.current_profile_id()
  returns int
  language sql
  stable
  security definer
  set search_path = core
  as $$
  select id from core.profiles where auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user; new sign-ins land pending with no role
-- until an admin approves (approval gate). id is a plain serial surrogate key;
-- auth_user_id links back to auth.users since it can no longer double as the PK.
-- ---------------------------------------------------------------------------

create table core.profiles (
  id serial primary key,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text check (role in ('admin', 'technician', 'volunteer', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on core.profiles
  for each row execute function core.set_updated_at();

-- Auto-create a pending profile whenever a new auth user signs up.
create or replace function core.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = core
  as $$
begin
  insert into core.profiles (auth_user_id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function core.handle_new_user();

grant select, insert, update, delete on core.profiles to authenticated;

-- A user can always read their own profile; admins can read all.
create policy "profiles_select_self_or_admin" on core.profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or core.is_admin());

-- A user may edit their own display_name, but role/status changes are admin-only;
-- enforced by keeping role/status immutable for self here and granting admins a
-- separate policy below.
create policy "profiles_update_self" on core.profiles
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and role is not distinct from (select p.role from core.profiles p where p.auth_user_id = auth.uid())
    and status is not distinct from (select p.status from core.profiles p where p.auth_user_id = auth.uid())
  );

create policy "profiles_admin_all" on core.profiles
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

-- ---------------------------------------------------------------------------
-- systems — DB is the source of truth (seeded below); admins manage.
-- ---------------------------------------------------------------------------

create table core.systems (
  id serial primary key,
  slug text not null unique,
  name text not null,
  category text not null
    check (category in ('quarantine', 'grow_out', 'larviculture', 'feed_production')),
  layout_notes text,
  has_animals boolean not null default true,
  apex_ph_probe_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger systems_set_updated_at
  before update on core.systems
  for each row execute function core.set_updated_at();

grant select, insert, update, delete on core.systems to authenticated;

create policy "systems_read_active_member" on core.systems
  for select to authenticated
  using (core.is_active_member());

create policy "systems_admin_write" on core.systems
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

-- ---------------------------------------------------------------------------
-- species — DB source of truth (seeded below); admins manage.
-- ---------------------------------------------------------------------------

create table core.species (
  id serial primary key,
  common_name text not null,
  scientific_name text not null,
  category text not null
    check (category in ('star', 'urchin', 'abalone', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (common_name)
);

create trigger species_set_updated_at
  before update on core.species
  for each row execute function core.set_updated_at();

grant select, insert, update, delete on core.species to authenticated;

create policy "species_read_active_member" on core.species
  for select to authenticated
  using (core.is_active_member());

create policy "species_admin_write" on core.species
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

-- ---------------------------------------------------------------------------
-- tanks — individual units within a system. Not seeded (inventory is admin data
-- entry). pair_group links the 8 larval cone-bottom pairs.
-- ---------------------------------------------------------------------------

create table core.tanks (
  id serial primary key,
  system_id int not null references core.systems (id) on delete cascade,
  name text not null,
  tank_type text not null check (tank_type in ('shelf', 'cone_bottom', 'main')),
  pair_group text,
  size_liters numeric, -- null means size not yet confirmed
  shelf_position text check (shelf_position in ('upper', 'lower')), -- null when tank type has no shelf position (e.g. cone-bottom)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system_id, name)
);

create index tanks_system_id_idx on core.tanks (system_id);

create trigger tanks_set_updated_at
  before update on core.tanks
  for each row execute function core.set_updated_at();

grant select, insert, update, delete on core.tanks to authenticated;

create policy "tanks_read_active_member" on core.tanks
  for select to authenticated
  using (core.is_active_member());

create policy "tanks_admin_write" on core.tanks
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

-- ---------------------------------------------------------------------------
-- RLS: the ensure_rls event trigger only auto-enables RLS for tables created
-- in the `public` schema, so enable it explicitly for every core table here.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['profiles', 'systems', 'species', 'tanks'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed reference data (mirrors lib/config/systems.ts and lib/config/species.ts)
-- ---------------------------------------------------------------------------

insert into core.systems (slug, name, category, layout_notes, has_animals, apex_ph_probe_confirmed)
values
  ('indoor-quarantine',  'Indoor Quarantine',  'quarantine',      'New/at-risk animal holding',                                      true,  false),
  ('outdoor-quarantine', 'Outdoor Quarantine', 'quarantine',      'New/at-risk animal holding',                                      true,  false),
  ('graham',             'Graham',             'grow_out',        'Upper + lower shelf plus a separate cone-bottom tank',            true,  true),
  ('wholey',             'Wholey',             'grow_out',        'Upper + lower shelf plus a separate cone-bottom tank',            true,  true),
  ('yum-yum',            'Yum Yum',            'grow_out',        'Single large urchin tank',                                        true,  false),
  ('snack-shack',        'Snack Shack',        'grow_out',        'Single large abalone tank + 2 cone-bottoms',                      true,  false),
  ('larval',             'Larval',             'larviculture',    '8 paired cone-bottom tanks, tracked/logged as cohorts per pair',  true,  false),
  ('micro-algae',        'Micro-Algae',        'feed_production',  'Feeds the Larval system; no animals of its own',                  false, false);

insert into core.species (common_name, scientific_name, category)
values
  ('Sunflower star',    'Pycnopodia helianthoides',       'star'),
  ('Bat star',          'Patiria miniata',                'star'),
  ('Giant spined star', 'Pisaster giganteus',             'star'),
  ('Purple urchin',     'Strongylocentrotus purpuratus',  'urchin'),
  ('Sand dollar',       'Dendraster excentricus',         'other'),
  ('Abalone',           'Haliotis spp.',                  'abalone');
