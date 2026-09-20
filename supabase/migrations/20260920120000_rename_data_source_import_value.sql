-- Rename the 'historical_import' data_source value to 'import' across all six
-- log tables that carry the data_source vocab (daily_checks, water_quality_readings,
-- chemical_additions, health_observations, feeding_logs, maintenance_logs). No
-- production rows use the old value yet, so this is a straight constraint
-- drop + recreate — no UPDATE needed to migrate existing data.

alter table core.daily_checks
  drop constraint daily_checks_data_source_check,
  add constraint daily_checks_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));

alter table core.water_quality_readings
  drop constraint water_quality_readings_data_source_check,
  add constraint water_quality_readings_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));

alter table core.chemical_additions
  drop constraint chemical_additions_data_source_check,
  add constraint chemical_additions_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));

alter table core.health_observations
  drop constraint health_observations_data_source_check,
  add constraint health_observations_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));

alter table core.feeding_logs
  drop constraint feeding_logs_data_source_check,
  add constraint feeding_logs_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));

alter table core.maintenance_logs
  drop constraint maintenance_logs_data_source_check,
  add constraint maintenance_logs_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'));
