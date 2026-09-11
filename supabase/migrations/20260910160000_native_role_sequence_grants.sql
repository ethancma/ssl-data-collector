-- Follow-up fix for 20260910130000_native_role_grants.sql: table-level GRANTs do
-- not cascade to the sequences backing serial/identity PK columns — a role also
-- needs USAGE, SELECT on the sequence itself to call nextval() during INSERT.
-- That migration granted INSERT on every serial-PK table to admin/technician
-- (schema-wide) and to volunteer (per operational-log table) but never touched
-- sequences, so every INSERT into a serial-PK table by any of those roles has
-- been failing with "permission denied for sequence <table>_id_seq" since it
-- landed — confirmed via `select sequence_schema, sequence_name from
-- information_schema.sequences where sequence_schema in ('core','analytics')`
-- against the local db: 23 sequences, one per serial-PK table. The only 3
-- tables in core/analytics with no backing sequence are the ones with a
-- composite (non-surrogate) primary key — core.health_observation_issues,
-- core.maintenance_log_tasks, analytics.fact_health_observation_issue — so they
-- need no grant here.

-- admin/technician: schema-wide, matching their schema-wide table grant.
grant usage, select on all sequences in schema core to admin, technician;
grant usage, select on all sequences in schema analytics to admin, technician;
alter default privileges in schema core grant usage, select on sequences to admin, technician;
alter default privileges in schema analytics grant usage, select on sequences to admin, technician;

-- volunteer: only the sequences backing the operational log tables it can
-- INSERT into (20260910130000 section 3's per-table grant list), not reference
-- tables (systems/species/tanks/animals/profiles are select/update-only for
-- volunteer) and not analytics (volunteer has no analytics access at all).
-- core.health_observation_issues and core.maintenance_log_tasks are in that
-- INSERT set too but have no surrogate-id sequence, per above.
grant usage, select on sequence
  core.daily_checks_id_seq,
  core.water_quality_readings_id_seq,
  core.chemical_additions_id_seq,
  core.health_observations_id_seq,
  core.feeding_logs_id_seq,
  core.maintenance_logs_id_seq,
  core.attachments_id_seq
to volunteer;

-- No ALTER DEFAULT PRIVILEGES for volunteer here, deliberately: unlike
-- admin/technician, volunteer's access is an explicit table allowlist rather
-- than schema-wide, and default privileges can only be scoped per-schema, not
-- per-table — a schema-wide default grant would leak sequence access to future
-- reference tables volunteer still can't INSERT into. A future migration adding
-- a new operational log table needs to add its sequence grant here too, same as
-- it already needs to add the table-level INSERT grant in 20260910130000's
-- pattern.

-- viewer: no grant — viewer never inserts anywhere, so never calls nextval().
