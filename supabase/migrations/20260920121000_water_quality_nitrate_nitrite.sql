-- Add nitrate/nitrite to water_quality_readings — weekly chemistry params present in
-- the paper/sheet logs (needed for the Graham system historical CSV import) but
-- missing from the original schema. Units differ per param, hence the column comments.

alter table core.water_quality_readings
  add column nitrate numeric,
  add column nitrite numeric;

comment on column core.water_quality_readings.nitrate is 'Nitrate, in ppm.';
comment on column core.water_quality_readings.nitrite is 'Nitrite, in ppb (not ppm — different unit than nitrate).';
