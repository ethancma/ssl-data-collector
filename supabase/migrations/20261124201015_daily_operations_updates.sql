-- Daily Operations updates: per-system daily requirements, Header and Nursery systems,
-- the Balding health issue, and a per-observation spine count.

-- Systems: which daily records each system requires. Defaults keep existing systems unchanged.
alter table core.systems
  add column requires_temperature boolean not null default true,
  add column requires_weekly_water_quality boolean not null default true;

comment on column core.systems.requires_temperature is
  'Whether AM/PM daily checks must record a temperature for this system.';
comment on column core.systems.requires_weekly_water_quality is
  'Whether Home lists weekly water quality as outstanding for this system.';

update core.systems set requires_temperature = false where slug = 'micro-algae';

alter table core.systems drop constraint systems_category_check;
alter table core.systems add constraint systems_category_check
  check (category in ('quarantine', 'grow_out', 'larviculture', 'feed_production', 'header'));

insert into core.systems (slug, name, category, has_animals, requires_weekly_water_quality)
values
  ('header', 'Header', 'header', false, false),
  ('nursery', 'Nursery', 'larviculture', true, false)
on conflict (slug) do nothing;

-- Health observations: Balding, and spines found during a Spine drop observation.
alter table core.health_observations drop constraint health_observations_issues_check;
alter table core.health_observations add constraint health_observations_issues_check check (
  case
    when coalesce(array_ndims(issues), 1) <> 1 then false
    else
      array_position(issues, null) is null
      and issues <@ array[
        'arm_drop', 'spine_drop', 'lesion', 'arm_curling', 'flattening', 'balding', 'other'
      ]::text[]
      and cardinality(issues) =
        (case when 'arm_drop' = any (issues) then 1 else 0 end) +
        (case when 'spine_drop' = any (issues) then 1 else 0 end) +
        (case when 'lesion' = any (issues) then 1 else 0 end) +
        (case when 'arm_curling' = any (issues) then 1 else 0 end) +
        (case when 'flattening' = any (issues) then 1 else 0 end) +
        (case when 'balding' = any (issues) then 1 else 0 end) +
        (case when 'other' = any (issues) then 1 else 0 end)
  end
);

alter table core.health_observations
  add column spine_count integer
    constraint health_observations_spine_count_positive check (spine_count is null or spine_count > 0)
    constraint health_observations_spine_count_requires_spine_drop
      check (spine_count is null or 'spine_drop' = any (issues));

comment on column core.health_observations.spine_count is
  'Spines found during this observation; null when not counted. Not cumulative.';

create or replace view core.v_history_health_observations with (security_invoker = true) as
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
  ho.has_photo,
  ho.spine_count
from core.health_observations ho
join core.tanks t on t.id = ho.tank_id
join core.systems s on s.id = t.system_id
join core.animals a on a.id = ho.animal_id
left join core.v_profile_names pn on pn.id = ho.recorded_by;
