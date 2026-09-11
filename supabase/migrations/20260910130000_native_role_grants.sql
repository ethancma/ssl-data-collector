-- Phase 1 of the RLS-to-native-roles migration (platform-architecture.md §5): create
-- 4 native Postgres roles (admin/technician/volunteer/viewer) mapped to
-- core.profiles.role, and move authorization for every table except core.profiles
-- from RLS row-filtering to plain GRANT-based table access. core.profiles keeps its
-- existing RLS policies untouched — it's the one table where per-row self-vs-admin
-- checks still matter even with native roles.
--
-- This is Phase 1 only: PostgREST can't actually SET ROLE to any of these yet
-- (that requires a Custom Access Token Hook stamping the JWT's `role` claim from
-- core.profiles.role) — that hook is a separate follow-up migration. Until it
-- ships, every session still authenticates as plain `authenticated`, which after
-- this migration has been revoked from most tables below; that's expected and
-- resolves itself once the hook phase lands.

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
-- 3. Reference/roster tables — disable RLS, drop the now-dead policies, revoke
-- authenticated's broad grant (otherwise any session still running as plain
-- authenticated would retain unrestricted access once RLS stops gating it), and
-- grant volunteer/viewer read access directly. admin/technician get full CRUD via
-- the schema-wide grant in section 5, not repeated per table here.
-- ---------------------------------------------------------------------------

alter table core.systems disable row level security;
drop policy if exists "systems_read_active_member" on core.systems;
drop policy if exists "systems_admin_write" on core.systems;
revoke select, insert, update, delete on core.systems from authenticated;
grant select on core.systems to volunteer, viewer;

alter table core.species disable row level security;
drop policy if exists "species_read_active_member" on core.species;
drop policy if exists "species_admin_write" on core.species;
revoke select, insert, update, delete on core.species from authenticated;
grant select on core.species to volunteer, viewer;

alter table core.tanks disable row level security;
drop policy if exists "tanks_read_active_member" on core.tanks;
drop policy if exists "tanks_admin_write" on core.tanks;
revoke select, insert, update, delete on core.tanks from authenticated;
grant select on core.tanks to volunteer, viewer;

alter table core.animals disable row level security;
drop policy if exists "animals_read_active_member" on core.animals;
drop policy if exists "animals_admin_write" on core.animals;
revoke select, insert, update, delete on core.animals from authenticated;
grant select on core.animals to volunteer, viewer;

-- ---------------------------------------------------------------------------
-- Operational log tables — same disable-RLS/drop-policies/revoke treatment.
-- Each currently carries 3 policies: the original `*_read_active_member` select
-- policy plus the `*_full_access_all`/`*_volunteer_update` pair added by the
-- rbac_tiers migration (the `*_insert_contributor`/`*_admin_all` policies from
-- when these tables were first created were already dropped by that migration).
-- volunteer keeps insert + update but no delete; viewer is read-only;
-- admin/technician get full CRUD via the schema-wide grant in section 5.
-- ---------------------------------------------------------------------------

alter table core.daily_checks disable row level security;
drop policy if exists "daily_checks_read_active_member" on core.daily_checks;
drop policy if exists "daily_checks_full_access_all" on core.daily_checks;
drop policy if exists "daily_checks_volunteer_update" on core.daily_checks;
revoke select, insert, update, delete on core.daily_checks from authenticated;
grant select, insert, update on core.daily_checks to volunteer;
grant select on core.daily_checks to viewer;

alter table core.water_quality_readings disable row level security;
drop policy if exists "water_quality_readings_read_active_member" on core.water_quality_readings;
drop policy if exists "water_quality_readings_full_access_all" on core.water_quality_readings;
drop policy if exists "water_quality_readings_volunteer_update" on core.water_quality_readings;
revoke select, insert, update, delete on core.water_quality_readings from authenticated;
grant select, insert, update on core.water_quality_readings to volunteer;
grant select on core.water_quality_readings to viewer;

alter table core.chemical_additions disable row level security;
drop policy if exists "chemical_additions_read_active_member" on core.chemical_additions;
drop policy if exists "chemical_additions_full_access_all" on core.chemical_additions;
drop policy if exists "chemical_additions_volunteer_update" on core.chemical_additions;
revoke select, insert, update, delete on core.chemical_additions from authenticated;
grant select, insert, update on core.chemical_additions to volunteer;
grant select on core.chemical_additions to viewer;

alter table core.health_observations disable row level security;
drop policy if exists "health_observations_read_active_member" on core.health_observations;
drop policy if exists "health_observations_full_access_all" on core.health_observations;
drop policy if exists "health_observations_volunteer_update" on core.health_observations;
revoke select, insert, update, delete on core.health_observations from authenticated;
grant select, insert, update on core.health_observations to volunteer;
grant select on core.health_observations to viewer;

alter table core.health_observation_issues disable row level security;
drop policy if exists "health_observation_issues_read_active_member" on core.health_observation_issues;
drop policy if exists "health_observation_issues_full_access_all" on core.health_observation_issues;
drop policy if exists "health_observation_issues_volunteer_update" on core.health_observation_issues;
revoke select, insert, update, delete on core.health_observation_issues from authenticated;
grant select, insert, update on core.health_observation_issues to volunteer;
grant select on core.health_observation_issues to viewer;

alter table core.feeding_logs disable row level security;
drop policy if exists "feeding_logs_read_active_member" on core.feeding_logs;
drop policy if exists "feeding_logs_full_access_all" on core.feeding_logs;
drop policy if exists "feeding_logs_volunteer_update" on core.feeding_logs;
revoke select, insert, update, delete on core.feeding_logs from authenticated;
grant select, insert, update on core.feeding_logs to volunteer;
grant select on core.feeding_logs to viewer;

alter table core.maintenance_logs disable row level security;
drop policy if exists "maintenance_logs_read_active_member" on core.maintenance_logs;
drop policy if exists "maintenance_logs_full_access_all" on core.maintenance_logs;
drop policy if exists "maintenance_logs_volunteer_update" on core.maintenance_logs;
revoke select, insert, update, delete on core.maintenance_logs from authenticated;
grant select, insert, update on core.maintenance_logs to volunteer;
grant select on core.maintenance_logs to viewer;

alter table core.maintenance_log_tasks disable row level security;
drop policy if exists "maintenance_log_tasks_read_active_member" on core.maintenance_log_tasks;
drop policy if exists "maintenance_log_tasks_full_access_all" on core.maintenance_log_tasks;
drop policy if exists "maintenance_log_tasks_volunteer_update" on core.maintenance_log_tasks;
revoke select, insert, update, delete on core.maintenance_log_tasks from authenticated;
grant select, insert, update on core.maintenance_log_tasks to volunteer;
grant select on core.maintenance_log_tasks to viewer;

alter table core.attachments disable row level security;
drop policy if exists "attachments_read_active_member" on core.attachments;
drop policy if exists "attachments_full_access_all" on core.attachments;
drop policy if exists "attachments_volunteer_update" on core.attachments;
revoke select, insert, update, delete on core.attachments from authenticated;
grant select, insert, update on core.attachments to volunteer;
grant select on core.attachments to viewer;

-- ---------------------------------------------------------------------------
-- 4. Analytics schema — same disable-RLS/drop-policies/revoke treatment on all
-- 13 tables (each carries exactly a `*_read_active_member` select policy and a
-- `*_admin_all` all-policy, both created in a loop by the analytics_schema
-- migration). No volunteer/viewer grants here — deliberately deferred to a
-- future migration. admin/technician get access via the schema-wide grant below.
-- ---------------------------------------------------------------------------

alter table analytics.dim_date disable row level security;
drop policy if exists "dim_date_read_active_member" on analytics.dim_date;
drop policy if exists "dim_date_admin_all" on analytics.dim_date;
revoke select, insert, update, delete on analytics.dim_date from authenticated;

alter table analytics.dim_system disable row level security;
drop policy if exists "dim_system_read_active_member" on analytics.dim_system;
drop policy if exists "dim_system_admin_all" on analytics.dim_system;
revoke select, insert, update, delete on analytics.dim_system from authenticated;

alter table analytics.dim_tank disable row level security;
drop policy if exists "dim_tank_read_active_member" on analytics.dim_tank;
drop policy if exists "dim_tank_admin_all" on analytics.dim_tank;
revoke select, insert, update, delete on analytics.dim_tank from authenticated;

alter table analytics.dim_species disable row level security;
drop policy if exists "dim_species_read_active_member" on analytics.dim_species;
drop policy if exists "dim_species_admin_all" on analytics.dim_species;
revoke select, insert, update, delete on analytics.dim_species from authenticated;

alter table analytics.dim_animal disable row level security;
drop policy if exists "dim_animal_read_active_member" on analytics.dim_animal;
drop policy if exists "dim_animal_admin_all" on analytics.dim_animal;
revoke select, insert, update, delete on analytics.dim_animal from authenticated;

alter table analytics.dim_chemical disable row level security;
drop policy if exists "dim_chemical_read_active_member" on analytics.dim_chemical;
drop policy if exists "dim_chemical_admin_all" on analytics.dim_chemical;
revoke select, insert, update, delete on analytics.dim_chemical from authenticated;

alter table analytics.dim_profile disable row level security;
drop policy if exists "dim_profile_read_active_member" on analytics.dim_profile;
drop policy if exists "dim_profile_admin_all" on analytics.dim_profile;
revoke select, insert, update, delete on analytics.dim_profile from authenticated;

alter table analytics.fact_daily_check disable row level security;
drop policy if exists "fact_daily_check_read_active_member" on analytics.fact_daily_check;
drop policy if exists "fact_daily_check_admin_all" on analytics.fact_daily_check;
revoke select, insert, update, delete on analytics.fact_daily_check from authenticated;

alter table analytics.fact_water_quality disable row level security;
drop policy if exists "fact_water_quality_read_active_member" on analytics.fact_water_quality;
drop policy if exists "fact_water_quality_admin_all" on analytics.fact_water_quality;
revoke select, insert, update, delete on analytics.fact_water_quality from authenticated;

alter table analytics.fact_chemical_addition disable row level security;
drop policy if exists "fact_chemical_addition_read_active_member" on analytics.fact_chemical_addition;
drop policy if exists "fact_chemical_addition_admin_all" on analytics.fact_chemical_addition;
revoke select, insert, update, delete on analytics.fact_chemical_addition from authenticated;

alter table analytics.fact_feeding disable row level security;
drop policy if exists "fact_feeding_read_active_member" on analytics.fact_feeding;
drop policy if exists "fact_feeding_admin_all" on analytics.fact_feeding;
revoke select, insert, update, delete on analytics.fact_feeding from authenticated;

alter table analytics.fact_health_observation disable row level security;
drop policy if exists "fact_health_observation_read_active_member" on analytics.fact_health_observation;
drop policy if exists "fact_health_observation_admin_all" on analytics.fact_health_observation;
revoke select, insert, update, delete on analytics.fact_health_observation from authenticated;

alter table analytics.fact_health_observation_issue disable row level security;
drop policy if exists "fact_health_observation_issue_read_active_member" on analytics.fact_health_observation_issue;
drop policy if exists "fact_health_observation_issue_admin_all" on analytics.fact_health_observation_issue;
revoke select, insert, update, delete on analytics.fact_health_observation_issue from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Schema-wide grants for admin/technician — covers every core/analytics
-- table above (including core.profiles) plus, via ALTER DEFAULT PRIVILEGES,
-- any table added by a future migration without needing a follow-up grant.
-- ---------------------------------------------------------------------------

grant all privileges on all tables in schema core to admin, technician;
grant all privileges on all tables in schema analytics to admin, technician;
alter default privileges in schema core grant all on tables to admin, technician;
alter default privileges in schema analytics grant all on tables to admin, technician;

-- ---------------------------------------------------------------------------
-- 6. storage.objects (attachments bucket) — same GRANT-tiering intent as core/
-- analytics, with one unavoidable deviation: storage.objects is owned by
-- supabase_storage_admin (confirmed locally — `alter table storage.objects
-- disable row level security` fails with "must be owner of table objects" for
-- both `postgres` locally and, since Supabase's hosted `postgres` role is the
-- same restricted non-owner role by design, on the hosted project too), so we
-- can't literally disable RLS here the way we did for core/analytics tables.
-- CREATE POLICY does not require ownership (verified — it's how every prior
-- storage.objects policy in this repo's migrations was created), so the
-- equivalent is applied as maximally-permissive per-role policies instead of a
-- disabled table: RLS stays technically "enabled" on storage.objects, but with
-- no row-filtering left, access is governed purely by the GRANTs below, same
-- as every other table in this migration.
-- ---------------------------------------------------------------------------

drop policy if exists "attachments_bucket_read_active_member" on storage.objects;
drop policy if exists "attachments_bucket_full_access_all" on storage.objects;
drop policy if exists "attachments_bucket_volunteer_update" on storage.objects;
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
