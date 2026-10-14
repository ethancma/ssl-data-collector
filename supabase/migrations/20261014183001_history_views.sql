-- Read-only views behind the History page: one per dataset, plus an "all" view.
-- Every view is security_invoker, so base-table RLS and grants decide what each role sees.
-- Shared columns come first and in the same order everywhere (the union view relies on it):
--   dataset, id, occurred_at, occurred_on (Pacific date), system_*, tank_*, animal_*,
--   recorded_by(_name), data_source, entered_at, notes
-- Each dataset's own columns follow. Tank and animal are null where they don't apply.

create view core.v_history_daily_checks with (security_invoker = true) as
select
  'daily_check'::text as dataset,
  dc.id,
  dc.checked_at as occurred_at,
  (dc.checked_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  null::int as tank_id,
  null::text as tank_name,
  null::int as animal_id,
  null::text as animal_name,
  dc.recorded_by,
  pn.display_name as recorded_by_name,
  dc.data_source,
  dc.entered_at,
  dc.notes,
  dc.check_type,
  dc.water_running,
  dc.temperature
from core.daily_checks dc
join core.systems s on s.id = dc.system_id
left join core.v_profile_names pn on pn.id = dc.recorded_by;

create view core.v_history_feeding with (security_invoker = true) as
select
  'feeding'::text as dataset,
  fl.id,
  fl.fed_at as occurred_at,
  (fl.fed_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  t.id as tank_id,
  t.name as tank_name,
  a.id as animal_id,
  a.name as animal_name,
  fl.recorded_by,
  pn.display_name as recorded_by_name,
  fl.data_source,
  fl.entered_at,
  fl.notes,
  fc.name as food_name,
  fl.amount_value,
  fc.default_unit as amount_unit,
  fl.consumption_status,
  fl.consumption_checked_at
from core.feeding_logs fl
join core.tanks t on t.id = fl.tank_id
join core.systems s on s.id = t.system_id
join core.animals a on a.id = fl.animal_id
join core.food_catalog fc on fc.id = fl.food_catalog_id
left join core.v_profile_names pn on pn.id = fl.recorded_by;

-- out_of_range lists parameter keys outside their target. A system-specific target wins
-- over the lab-wide one (system_id is null); either bound may be missing, bounds are
-- inclusive, and no target means never out of range. It is a scalar subquery so the
-- planner drops it when a caller (such as v_history_events) does not select it.
create view core.v_history_water_quality with (security_invoker = true) as
select
  'water_quality'::text as dataset,
  w.id,
  w.tested_at as occurred_at,
  (w.tested_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  null::int as tank_id,
  null::text as tank_name,
  null::int as animal_id,
  null::text as animal_name,
  w.recorded_by,
  pn.display_name as recorded_by_name,
  w.data_source,
  w.entered_at,
  w.notes,
  w.ph_source,
  w.ph,
  w.magnesium,
  w.ammonia,
  w.alkalinity,
  w.calcium,
  w.phosphate,
  w.salinity,
  w.nitrate,
  w.nitrite,
  (
    select coalesce(array_agg(p.key order by p.ord), '{}'::text[])
    from (values
      (1, 'ph', w.ph), (2, 'magnesium', w.magnesium), (3, 'ammonia', w.ammonia),
      (4, 'alkalinity', w.alkalinity), (5, 'calcium', w.calcium), (6, 'phosphate', w.phosphate),
      (7, 'salinity', w.salinity), (8, 'nitrate', w.nitrate), (9, 'nitrite', w.nitrite)
    ) as p(ord, key, value)
    join lateral (
      select r.min_value, r.max_value
      from core.water_quality_target_ranges r
      where r.parameter_key = p.key
        and (r.system_id = w.system_id or r.system_id is null)
      order by r.system_id nulls last
      limit 1
    ) tr on true
    where (tr.min_value is not null and p.value < tr.min_value)
      or (tr.max_value is not null and p.value > tr.max_value)
  ) as out_of_range
from core.water_quality_readings w
join core.systems s on s.id = w.system_id
left join core.v_profile_names pn on pn.id = w.recorded_by;

-- chemical_additions has no notes column, so notes is null here.
create view core.v_history_chemical_additions with (security_invoker = true) as
select
  'chemical_addition'::text as dataset,
  ca.id,
  ca.added_at as occurred_at,
  (ca.added_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  null::int as tank_id,
  null::text as tank_name,
  null::int as animal_id,
  null::text as animal_name,
  ca.recorded_by,
  pn.display_name as recorded_by_name,
  ca.data_source,
  ca.entered_at,
  null::text as notes,
  ca.chemical_name,
  ca.amount,
  ca.unit,
  ca.reason
from core.chemical_additions ca
join core.systems s on s.id = ca.system_id
left join core.v_profile_names pn on pn.id = ca.recorded_by;

create view core.v_history_health_observations with (security_invoker = true) as
select
  'health_observation'::text as dataset,
  ho.id,
  ho.observed_at as occurred_at,
  (ho.observed_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  t.id as tank_id,
  t.name as tank_name,
  a.id as animal_id,
  a.name as animal_name,
  ho.recorded_by,
  pn.display_name as recorded_by_name,
  ho.data_source,
  ho.entered_at,
  ho.notes,
  ho.severity,
  ho.issues,
  ho.has_photo
from core.health_observations ho
join core.tanks t on t.id = ho.tank_id
join core.systems s on s.id = t.system_id
join core.animals a on a.id = ho.animal_id
left join core.v_profile_names pn on pn.id = ho.recorded_by;

create view core.v_history_maintenance with (security_invoker = true) as
select
  'maintenance'::text as dataset,
  m.id,
  m.performed_at as occurred_at,
  (m.performed_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  null::int as tank_id,
  null::text as tank_name,
  null::int as animal_id,
  null::text as animal_name,
  m.recorded_by,
  pn.display_name as recorded_by_name,
  m.data_source,
  m.entered_at,
  m.notes,
  m.task_type
from core.maintenance_logs m
join core.systems s on s.id = m.system_id
left join core.v_profile_names pn on pn.id = m.recorded_by;

create view core.v_history_star_treatments with (security_invoker = true) as
select
  'star_treatment'::text as dataset,
  st.id,
  st.administered_at as occurred_at,
  (st.administered_at at time zone 'America/Los_Angeles')::date as occurred_on,
  s.id as system_id,
  s.name as system_name,
  t.id as tank_id,
  t.name as tank_name,
  a.id as animal_id,
  a.name as animal_name,
  st.recorded_by,
  pn.display_name as recorded_by_name,
  st.data_source,
  st.entered_at,
  st.notes,
  st.treatment_type,
  st.amount,
  st.unit,
  st.concentration,
  st.concentration_unit
from core.star_treatments st
join core.tanks t on t.id = st.tank_id
join core.systems s on s.id = t.system_id
join core.animals a on a.id = st.animal_id
left join core.v_profile_names pn on pn.id = st.recorded_by;

-- "All": shared columns of every dataset a viewer can read. Star treatments stay out
-- because viewers have no grant on core.star_treatments, and one unreadable branch
-- would fail the whole query for them.
create view core.v_history_events with (security_invoker = true) as
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_daily_checks
union all
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_feeding
union all
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_water_quality
union all
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_chemical_additions
union all
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_health_observations
union all
select dataset, id, occurred_at, occurred_on, system_id, system_name, tank_id, tank_name,
  animal_id, animal_name, recorded_by, recorded_by_name, data_source, entered_at, notes
from core.v_history_maintenance;

-- native_role_grants gives admin and technician ALL on every new core object; these views
-- are read-only, so reset everything and grant select only.
revoke all on
  core.v_history_daily_checks, core.v_history_feeding, core.v_history_water_quality,
  core.v_history_chemical_additions, core.v_history_health_observations,
  core.v_history_maintenance, core.v_history_star_treatments, core.v_history_events
from public, anon, authenticated, admin, technician, volunteer, viewer;

grant select on
  core.v_history_daily_checks, core.v_history_feeding, core.v_history_water_quality,
  core.v_history_chemical_additions, core.v_history_health_observations,
  core.v_history_maintenance, core.v_history_events
to admin, technician, volunteer, viewer;

grant select on core.v_history_star_treatments to admin, technician, volunteer;
