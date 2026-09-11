-- Resolve the "Volunteer role permissions" open question (platform-architecture.md §5):
-- technicians get promoted to full CRUD (same as admin) on every operational log
-- table, and volunteers move from insert+read to read+update (no more insert, no
-- delete). Viewers and anon are unaffected. Reference/roster tables (systems,
-- species, tanks, animals) are out of scope and stay admin-write-only.
--
-- core.is_contributor() (admin/technician/volunteer, used for INSERT) is retired and
-- replaced by two more precisely-named helpers:
--   - core.is_full_access() — admin or technician; full CRUD on operational logs.
--   - core.is_editor()      — admin, technician, or volunteer; used only to grant
--                             volunteers UPDATE (admin/technician already get update
--                             via is_full_access(), so the overlap is harmless).

set local check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Drop everything that references core.is_contributor() before dropping it.
-- ---------------------------------------------------------------------------

drop policy if exists "daily_checks_insert_contributor" on core.daily_checks;
drop policy if exists "daily_checks_admin_all" on core.daily_checks;

drop policy if exists "water_quality_readings_insert_contributor" on core.water_quality_readings;
drop policy if exists "water_quality_readings_admin_all" on core.water_quality_readings;

drop policy if exists "chemical_additions_insert_contributor" on core.chemical_additions;
drop policy if exists "chemical_additions_admin_all" on core.chemical_additions;

drop policy if exists "health_observations_insert_contributor" on core.health_observations;
drop policy if exists "health_observations_admin_all" on core.health_observations;

drop policy if exists "health_observation_issues_insert_contributor" on core.health_observation_issues;
drop policy if exists "health_observation_issues_admin_all" on core.health_observation_issues;

drop policy if exists "feeding_logs_insert_contributor" on core.feeding_logs;
drop policy if exists "feeding_logs_admin_all" on core.feeding_logs;

drop policy if exists "maintenance_logs_insert_contributor" on core.maintenance_logs;
drop policy if exists "maintenance_logs_admin_all" on core.maintenance_logs;

drop policy if exists "maintenance_log_tasks_insert_contributor" on core.maintenance_log_tasks;
drop policy if exists "maintenance_log_tasks_admin_all" on core.maintenance_log_tasks;

drop policy if exists "attachments_insert_contributor" on core.attachments;
drop policy if exists "attachments_admin_all" on core.attachments;

drop policy if exists "attachments_bucket_insert_contributor" on storage.objects;
drop policy if exists "attachments_bucket_admin_all" on storage.objects;

drop function if exists core.is_contributor();

-- ---------------------------------------------------------------------------
-- New helpers
-- ---------------------------------------------------------------------------

create or replace function core.is_full_access()
  returns boolean
  language sql
  stable
  security definer
  set search_path = core
  as $$
  select exists (
    select 1 from core.profiles
    where auth_user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'technician')
  );
$$;

create or replace function core.is_editor()
  returns boolean
  language sql
  stable
  security definer
  set search_path = core
  as $$
  select exists (
    select 1 from core.profiles
    where auth_user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'technician', 'volunteer')
  );
$$;

-- ---------------------------------------------------------------------------
-- daily_checks
-- ---------------------------------------------------------------------------

create policy "daily_checks_full_access_all" on core.daily_checks
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "daily_checks_volunteer_update" on core.daily_checks
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- water_quality_readings
-- ---------------------------------------------------------------------------

create policy "water_quality_readings_full_access_all" on core.water_quality_readings
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "water_quality_readings_volunteer_update" on core.water_quality_readings
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- chemical_additions
-- ---------------------------------------------------------------------------

create policy "chemical_additions_full_access_all" on core.chemical_additions
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "chemical_additions_volunteer_update" on core.chemical_additions
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- health_observations (+ issues junction)
-- ---------------------------------------------------------------------------

create policy "health_observations_full_access_all" on core.health_observations
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "health_observations_volunteer_update" on core.health_observations
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

create policy "health_observation_issues_full_access_all" on core.health_observation_issues
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "health_observation_issues_volunteer_update" on core.health_observation_issues
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- feeding_logs
-- ---------------------------------------------------------------------------

create policy "feeding_logs_full_access_all" on core.feeding_logs
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "feeding_logs_volunteer_update" on core.feeding_logs
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- maintenance_logs (+ tasks junction)
-- ---------------------------------------------------------------------------

create policy "maintenance_logs_full_access_all" on core.maintenance_logs
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "maintenance_logs_volunteer_update" on core.maintenance_logs
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

create policy "maintenance_log_tasks_full_access_all" on core.maintenance_log_tasks
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "maintenance_log_tasks_volunteer_update" on core.maintenance_log_tasks
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

-- ---------------------------------------------------------------------------
-- attachments (table + storage bucket)
-- ---------------------------------------------------------------------------

create policy "attachments_full_access_all" on core.attachments
  for all to authenticated
  using (core.is_full_access())
  with check (core.is_full_access());

create policy "attachments_volunteer_update" on core.attachments
  for update to authenticated
  using (core.is_editor())
  with check (core.is_editor());

create policy "attachments_bucket_full_access_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and core.is_full_access())
  with check (bucket_id = 'attachments' and core.is_full_access());

create policy "attachments_bucket_volunteer_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and core.is_editor())
  with check (bucket_id = 'attachments' and core.is_editor());
