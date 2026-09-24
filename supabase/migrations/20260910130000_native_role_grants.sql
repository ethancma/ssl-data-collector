-- Native-roles authorization model (platform-architecture.md §5): 4 native Postgres
-- roles (admin/technician/volunteer/viewer) mapped to core.profiles.role, with table
-- access granted per role. RLS stays enabled on every table (Supabase's linter
-- requires it, and it's defense-in-depth); the policies here are permissive per-role
-- (`to <role> using (true)`), not row filters — the GRANTs below are the real gate and
-- the policies simply mirror them so an RLS-enabled table still has a policy for each
-- role that can touch it. core.profiles is the one exception: it keeps its original
-- row-filtering policies (self-vs-admin), left untouched here.
--
-- PostgREST SET ROLEs into one of these 4 per request via the Custom Access Token Hook
-- (20260910140000) that stamps the JWT `role` claim from core.profiles.role. Sequence
-- access needed for INSERTs is granted alongside the table grants in section 5.

set local check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Roles — idempotent (roles are cluster-global, not transactional like
-- tables, so a plain `create role` would fail on a re-run against a cluster
-- where it already exists).
-- ---------------------------------------------------------------------------

do $$
begin
  create role admin nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create role technician nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create role volunteer nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create role viewer nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end;
$$;

-- Lets PostgREST SET ROLE to one of these once the hook phase stamps a `role` claim.
grant admin, technician, volunteer, viewer to authenticator;

-- Membership/inheritance so core.profiles's `to authenticated` policies still apply
-- once a session's active role is one of these 4. This also means each role
-- inherits authenticated's existing schema-level USAGE grants on core and
-- analytics automatically — no separate USAGE grants needed here.
grant authenticated to admin, technician, volunteer, viewer;

-- core.is_admin/is_active_member/is_full_access/is_editor/current_profile_id have
-- never had EXECUTE revoked from PUBLIC (verified against every prior migration),
-- so they remain callable by these 4 roles under the Postgres default — no
-- additional EXECUTE grant needed.

-- ---------------------------------------------------------------------------
-- 2. core.profiles — GRANTs only. RLS and its existing policies
-- (profiles_select_self_or_admin, profiles_update_self, profiles_admin_all) and
-- authenticated's existing grant are left completely untouched.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on core.profiles to admin, technician;
grant select, update on core.profiles to volunteer, viewer;

-- ---------------------------------------------------------------------------
-- 3. Reference/roster tables — keep RLS enabled, drop the old row-filtering
-- policies, revoke authenticated's broad grant, and grant volunteer/viewer read
-- access directly plus a matching permissive read policy. admin/technician get full
-- CRUD via the schema-wide grant in section 5 and an all-policy per table here.
-- ---------------------------------------------------------------------------

alter table core.systems enable row level security;
drop policy if exists "systems_read_active_member" on core.systems;
drop policy if exists "systems_admin_write" on core.systems;
revoke select, insert, update, delete on core.systems from authenticated;
grant select on core.systems to volunteer, viewer;
create policy "systems_admin_technician_all" on core.systems
  for all to admin, technician using (true) with check (true);
create policy "systems_read_volunteer_viewer" on core.systems
  for select to volunteer, viewer using (true);

alter table core.species enable row level security;
drop policy if exists "species_read_active_member" on core.species;
drop policy if exists "species_admin_write" on core.species;
revoke select, insert, update, delete on core.species from authenticated;
grant select on core.species to volunteer, viewer;
create policy "species_admin_technician_all" on core.species
  for all to admin, technician using (true) with check (true);
create policy "species_read_volunteer_viewer" on core.species
  for select to volunteer, viewer using (true);

alter table core.tanks enable row level security;
drop policy if exists "tanks_read_active_member" on core.tanks;
drop policy if exists "tanks_admin_write" on core.tanks;
revoke select, insert, update, delete on core.tanks from authenticated;
grant select on core.tanks to volunteer, viewer;
create policy "tanks_admin_technician_all" on core.tanks
  for all to admin, technician using (true) with check (true);
create policy "tanks_read_volunteer_viewer" on core.tanks
  for select to volunteer, viewer using (true);

alter table core.animals enable row level security;
drop policy if exists "animals_read_active_member" on core.animals;
drop policy if exists "animals_admin_write" on core.animals;
revoke select, insert, update, delete on core.animals from authenticated;
grant select on core.animals to volunteer, viewer;
create policy "animals_admin_technician_all" on core.animals
  for all to admin, technician using (true) with check (true);
create policy "animals_read_volunteer_viewer" on core.animals
  for select to volunteer, viewer using (true);

-- ---------------------------------------------------------------------------
-- Operational log tables — RLS stays enabled; drop any old row-filtering policies
-- (idempotent), revoke authenticated's broad grant, and grant the per-role tiers:
-- volunteer gets select + insert + update (no delete), viewer is read-only, and
-- admin/technician get full CRUD via the schema-wide grant in section 5. Each tier
-- gets a matching permissive policy so the RLS-enabled table has a policy per role.
-- ---------------------------------------------------------------------------

alter table core.daily_checks enable row level security;
drop policy if exists "daily_checks_read_active_member" on core.daily_checks;
drop policy if exists "daily_checks_insert_contributor" on core.daily_checks;
drop policy if exists "daily_checks_admin_all" on core.daily_checks;
revoke select, insert, update, delete on core.daily_checks from authenticated;
grant select, insert, update on core.daily_checks to volunteer;
grant select on core.daily_checks to viewer;
create policy "daily_checks_admin_technician_all" on core.daily_checks
  for all to admin, technician using (true) with check (true);
create policy "daily_checks_volunteer_select" on core.daily_checks
  for select to volunteer using (true);
create policy "daily_checks_volunteer_insert" on core.daily_checks
  for insert to volunteer with check (true);
create policy "daily_checks_volunteer_update" on core.daily_checks
  for update to volunteer using (true) with check (true);
create policy "daily_checks_viewer_select" on core.daily_checks
  for select to viewer using (true);

alter table core.water_quality_readings enable row level security;
drop policy if exists "water_quality_readings_read_active_member" on core.water_quality_readings;
drop policy if exists "water_quality_readings_insert_contributor" on core.water_quality_readings;
drop policy if exists "water_quality_readings_admin_all" on core.water_quality_readings;
revoke select, insert, update, delete on core.water_quality_readings from authenticated;
grant select, insert, update on core.water_quality_readings to volunteer;
grant select on core.water_quality_readings to viewer;
create policy "water_quality_readings_admin_technician_all" on core.water_quality_readings
  for all to admin, technician using (true) with check (true);
create policy "water_quality_readings_volunteer_select" on core.water_quality_readings
  for select to volunteer using (true);
create policy "water_quality_readings_volunteer_insert" on core.water_quality_readings
  for insert to volunteer with check (true);
create policy "water_quality_readings_volunteer_update" on core.water_quality_readings
  for update to volunteer using (true) with check (true);
create policy "water_quality_readings_viewer_select" on core.water_quality_readings
  for select to viewer using (true);

alter table core.chemical_additions enable row level security;
drop policy if exists "chemical_additions_read_active_member" on core.chemical_additions;
drop policy if exists "chemical_additions_insert_contributor" on core.chemical_additions;
drop policy if exists "chemical_additions_admin_all" on core.chemical_additions;
revoke select, insert, update, delete on core.chemical_additions from authenticated;
grant select, insert, update on core.chemical_additions to volunteer;
grant select on core.chemical_additions to viewer;
create policy "chemical_additions_admin_technician_all" on core.chemical_additions
  for all to admin, technician using (true) with check (true);
create policy "chemical_additions_volunteer_select" on core.chemical_additions
  for select to volunteer using (true);
create policy "chemical_additions_volunteer_insert" on core.chemical_additions
  for insert to volunteer with check (true);
create policy "chemical_additions_volunteer_update" on core.chemical_additions
  for update to volunteer using (true) with check (true);
create policy "chemical_additions_viewer_select" on core.chemical_additions
  for select to viewer using (true);

alter table core.health_observations enable row level security;
drop policy if exists "health_observations_read_active_member" on core.health_observations;
drop policy if exists "health_observations_insert_contributor" on core.health_observations;
drop policy if exists "health_observations_admin_all" on core.health_observations;
revoke select, insert, update, delete on core.health_observations from authenticated;
grant select, insert, update on core.health_observations to volunteer;
grant select on core.health_observations to viewer;
create policy "health_observations_admin_technician_all" on core.health_observations
  for all to admin, technician using (true) with check (true);
create policy "health_observations_volunteer_select" on core.health_observations
  for select to volunteer using (true);
create policy "health_observations_volunteer_insert" on core.health_observations
  for insert to volunteer with check (true);
create policy "health_observations_volunteer_update" on core.health_observations
  for update to volunteer using (true) with check (true);
create policy "health_observations_viewer_select" on core.health_observations
  for select to viewer using (true);

alter table core.feeding_logs enable row level security;
drop policy if exists "feeding_logs_read_active_member" on core.feeding_logs;
drop policy if exists "feeding_logs_insert_contributor" on core.feeding_logs;
drop policy if exists "feeding_logs_admin_all" on core.feeding_logs;
revoke select, insert, update, delete on core.feeding_logs from authenticated;
grant select, insert, update on core.feeding_logs to volunteer;
grant select on core.feeding_logs to viewer;
create policy "feeding_logs_admin_technician_all" on core.feeding_logs
  for all to admin, technician using (true) with check (true);
create policy "feeding_logs_volunteer_select" on core.feeding_logs
  for select to volunteer using (true);
create policy "feeding_logs_volunteer_insert" on core.feeding_logs
  for insert to volunteer with check (true);
create policy "feeding_logs_volunteer_update" on core.feeding_logs
  for update to volunteer using (true) with check (true);
create policy "feeding_logs_viewer_select" on core.feeding_logs
  for select to viewer using (true);

alter table core.maintenance_logs enable row level security;
drop policy if exists "maintenance_logs_read_active_member" on core.maintenance_logs;
drop policy if exists "maintenance_logs_insert_contributor" on core.maintenance_logs;
drop policy if exists "maintenance_logs_admin_all" on core.maintenance_logs;
revoke select, insert, update, delete on core.maintenance_logs from authenticated;
grant select, insert, update on core.maintenance_logs to volunteer;
grant select on core.maintenance_logs to viewer;
create policy "maintenance_logs_admin_technician_all" on core.maintenance_logs
  for all to admin, technician using (true) with check (true);
create policy "maintenance_logs_volunteer_select" on core.maintenance_logs
  for select to volunteer using (true);
create policy "maintenance_logs_volunteer_insert" on core.maintenance_logs
  for insert to volunteer with check (true);
create policy "maintenance_logs_volunteer_update" on core.maintenance_logs
  for update to volunteer using (true) with check (true);
create policy "maintenance_logs_viewer_select" on core.maintenance_logs
  for select to viewer using (true);

alter table core.attachments enable row level security;
drop policy if exists "attachments_read_active_member" on core.attachments;
drop policy if exists "attachments_insert_contributor" on core.attachments;
drop policy if exists "attachments_admin_all" on core.attachments;
revoke select, insert, update, delete on core.attachments from authenticated;
grant select, insert, update on core.attachments to volunteer;
grant select on core.attachments to viewer;
create policy "attachments_admin_technician_all" on core.attachments
  for all to admin, technician using (true) with check (true);
create policy "attachments_volunteer_select" on core.attachments
  for select to volunteer using (true);
create policy "attachments_volunteer_insert" on core.attachments
  for insert to volunteer with check (true);
create policy "attachments_volunteer_update" on core.attachments
  for update to volunteer using (true) with check (true);
create policy "attachments_viewer_select" on core.attachments
  for select to viewer using (true);

-- ---------------------------------------------------------------------------
-- 4. Analytics schema — RLS stays enabled on all 13 tables; drop the old
-- row-filtering policies (idempotent), revoke authenticated's broad grant, and add
-- an admin/technician all-policy per table. No volunteer/viewer grants here —
-- deliberately deferred to a future migration — so no policy for them either.
-- admin/technician also get access via the schema-wide grant below.
-- ---------------------------------------------------------------------------

alter table analytics.dim_date enable row level security;
drop policy if exists "dim_date_read_active_member" on analytics.dim_date;
drop policy if exists "dim_date_admin_all" on analytics.dim_date;
revoke select, insert, update, delete on analytics.dim_date from authenticated;
create policy "dim_date_admin_technician_all" on analytics.dim_date
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_system enable row level security;
drop policy if exists "dim_system_read_active_member" on analytics.dim_system;
drop policy if exists "dim_system_admin_all" on analytics.dim_system;
revoke select, insert, update, delete on analytics.dim_system from authenticated;
create policy "dim_system_admin_technician_all" on analytics.dim_system
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_tank enable row level security;
drop policy if exists "dim_tank_read_active_member" on analytics.dim_tank;
drop policy if exists "dim_tank_admin_all" on analytics.dim_tank;
revoke select, insert, update, delete on analytics.dim_tank from authenticated;
create policy "dim_tank_admin_technician_all" on analytics.dim_tank
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_species enable row level security;
drop policy if exists "dim_species_read_active_member" on analytics.dim_species;
drop policy if exists "dim_species_admin_all" on analytics.dim_species;
revoke select, insert, update, delete on analytics.dim_species from authenticated;
create policy "dim_species_admin_technician_all" on analytics.dim_species
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_animal enable row level security;
drop policy if exists "dim_animal_read_active_member" on analytics.dim_animal;
drop policy if exists "dim_animal_admin_all" on analytics.dim_animal;
revoke select, insert, update, delete on analytics.dim_animal from authenticated;
create policy "dim_animal_admin_technician_all" on analytics.dim_animal
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_chemical enable row level security;
drop policy if exists "dim_chemical_read_active_member" on analytics.dim_chemical;
drop policy if exists "dim_chemical_admin_all" on analytics.dim_chemical;
revoke select, insert, update, delete on analytics.dim_chemical from authenticated;
create policy "dim_chemical_admin_technician_all" on analytics.dim_chemical
  for all to admin, technician using (true) with check (true);

alter table analytics.dim_profile enable row level security;
drop policy if exists "dim_profile_read_active_member" on analytics.dim_profile;
drop policy if exists "dim_profile_admin_all" on analytics.dim_profile;
revoke select, insert, update, delete on analytics.dim_profile from authenticated;
create policy "dim_profile_admin_technician_all" on analytics.dim_profile
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_daily_check enable row level security;
drop policy if exists "fact_daily_check_read_active_member" on analytics.fact_daily_check;
drop policy if exists "fact_daily_check_admin_all" on analytics.fact_daily_check;
revoke select, insert, update, delete on analytics.fact_daily_check from authenticated;
create policy "fact_daily_check_admin_technician_all" on analytics.fact_daily_check
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_water_quality enable row level security;
drop policy if exists "fact_water_quality_read_active_member" on analytics.fact_water_quality;
drop policy if exists "fact_water_quality_admin_all" on analytics.fact_water_quality;
revoke select, insert, update, delete on analytics.fact_water_quality from authenticated;
create policy "fact_water_quality_admin_technician_all" on analytics.fact_water_quality
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_chemical_addition enable row level security;
drop policy if exists "fact_chemical_addition_read_active_member" on analytics.fact_chemical_addition;
drop policy if exists "fact_chemical_addition_admin_all" on analytics.fact_chemical_addition;
revoke select, insert, update, delete on analytics.fact_chemical_addition from authenticated;
create policy "fact_chemical_addition_admin_technician_all" on analytics.fact_chemical_addition
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_feeding enable row level security;
drop policy if exists "fact_feeding_read_active_member" on analytics.fact_feeding;
drop policy if exists "fact_feeding_admin_all" on analytics.fact_feeding;
revoke select, insert, update, delete on analytics.fact_feeding from authenticated;
create policy "fact_feeding_admin_technician_all" on analytics.fact_feeding
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_health_observation enable row level security;
drop policy if exists "fact_health_observation_read_active_member" on analytics.fact_health_observation;
drop policy if exists "fact_health_observation_admin_all" on analytics.fact_health_observation;
revoke select, insert, update, delete on analytics.fact_health_observation from authenticated;
create policy "fact_health_observation_admin_technician_all" on analytics.fact_health_observation
  for all to admin, technician using (true) with check (true);

alter table analytics.fact_health_observation_issue enable row level security;
drop policy if exists "fact_health_observation_issue_read_active_member" on analytics.fact_health_observation_issue;
drop policy if exists "fact_health_observation_issue_admin_all" on analytics.fact_health_observation_issue;
revoke select, insert, update, delete on analytics.fact_health_observation_issue from authenticated;
create policy "fact_health_observation_issue_admin_technician_all" on analytics.fact_health_observation_issue
  for all to admin, technician using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 5. Schema-wide grants for admin/technician — covers every core/analytics
-- table above (including core.profiles) plus, via ALTER DEFAULT PRIVILEGES,
-- any table added by a future migration without needing a follow-up grant.
-- Sequences are granted alongside: table-level GRANTs don't cascade to the
-- sequences backing serial/identity PKs, so INSERT needs USAGE, SELECT on the
-- sequence too. admin/technician get every sequence schema-wide; volunteer gets
-- only the sequences behind the operational-log tables it can INSERT into.
-- ---------------------------------------------------------------------------

grant all privileges on all tables in schema core to admin, technician;
grant all privileges on all tables in schema analytics to admin, technician;
alter default privileges in schema core grant all on tables to admin, technician;
alter default privileges in schema analytics grant all on tables to admin, technician;

grant usage, select on all sequences in schema core to admin, technician;
grant usage, select on all sequences in schema analytics to admin, technician;
alter default privileges in schema core grant usage, select on sequences to admin, technician;
alter default privileges in schema analytics grant usage, select on sequences to admin, technician;

-- volunteer: only the sequences behind operational-log tables it can INSERT into.
grant usage, select on sequence
  core.daily_checks_id_seq,
  core.water_quality_readings_id_seq,
  core.chemical_additions_id_seq,
  core.health_observations_id_seq,
  core.feeding_logs_id_seq,
  core.maintenance_logs_id_seq,
  core.attachments_id_seq
to volunteer;

-- ---------------------------------------------------------------------------
-- 6. storage.objects (attachments bucket) — same RLS-enabled + permissive-per-role
-- policy model as core/analytics above, governed by the GRANTs below. storage.objects
-- is owned by supabase_storage_admin, so ALTER TABLE ... ROW LEVEL SECURITY isn't ours
-- to run — but RLS is already enabled on it by Supabase, and CREATE POLICY doesn't
-- require ownership, so the per-role policies below are all that's needed here.
-- ---------------------------------------------------------------------------

drop policy if exists "attachments_bucket_read_active_member" on storage.objects;
drop policy if exists "attachments_bucket_insert_contributor" on storage.objects;
drop policy if exists "attachments_bucket_admin_all" on storage.objects;
-- storage schema survives db reset / remote schema drops, so also clear our own
-- policy names to keep this section re-runnable.
drop policy if exists "storage_objects_admin_technician_all" on storage.objects;
drop policy if exists "storage_objects_volunteer_select" on storage.objects;
drop policy if exists "storage_objects_volunteer_insert" on storage.objects;
drop policy if exists "storage_objects_volunteer_update" on storage.objects;
drop policy if exists "storage_objects_viewer_select" on storage.objects;
revoke select, insert, update, delete on storage.objects from authenticated;
grant select, insert, update, delete on storage.objects to admin, technician;
grant select, insert, update on storage.objects to volunteer;
grant select on storage.objects to viewer;

create policy "storage_objects_admin_technician_all" on storage.objects
  for all to admin, technician
  using (true)
  with check (true);

create policy "storage_objects_volunteer_select" on storage.objects
  for select to volunteer
  using (true);

create policy "storage_objects_volunteer_insert" on storage.objects
  for insert to volunteer
  with check (true);

create policy "storage_objects_volunteer_update" on storage.objects
  for update to volunteer
  using (true)
  with check (true);

create policy "storage_objects_viewer_select" on storage.objects
  for select to viewer
  using (true);

-- storage.buckets has no custom policies (verified against every prior
-- migration — the only touch was the `attachments` bucket row insert), so it's
-- otherwise left as-is. The `public` column default safeguard from the spec
-- (`alter table storage.buckets alter column public set default false`) hits
-- the same ownership restriction as above — ALTER TABLE ALTER COLUMN requires
-- table ownership, unlike CREATE POLICY — and isn't achievable from this
-- migration's role. Flagging back rather than guessing a workaround: this needs
-- a human (or a future SECURITY DEFINER function reachable by admin) to run via
-- the Dashboard SQL Editor as the table owner.
