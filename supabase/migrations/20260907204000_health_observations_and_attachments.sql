-- health_observations (+ issues junction) and attachments — issue is multi-select so
-- it lives in its own junction table rather than an array column. attachments is a
-- generic parent_table/parent_id pointer, primarily used by health_observations but
-- also usable for scanned paper logs; backed by a private Storage bucket.

create table core.health_observations (
  id serial primary key,
  animal_id int not null references core.animals (id) on delete cascade,
  tank_id int not null references core.tanks (id),
  observed_at timestamptz not null default now(),
  severity text not null check (severity in ('low', 'medium', 'high')),
  notes text,
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now(),
  has_photo boolean not null default false
);

create index health_observations_animal_id_idx on core.health_observations (animal_id);
create index health_observations_tank_observed_idx
  on core.health_observations (tank_id, observed_at desc);

create table core.health_observation_issues (
  health_observation_id int not null references core.health_observations (id) on delete cascade,
  issue text not null
    check (issue in ('arm_drop', 'spine_drop', 'lesion', 'arm_curling', 'flattening', 'other')),
  primary key (health_observation_id, issue)
);

-- ---------------------------------------------------------------------------
-- attachments — generic photo/file pointer keyed by parent_table + parent_id.
-- parent_id is a plain int (no FK) since parent_table determines which table's
-- int-keyed PK it points to.
-- ---------------------------------------------------------------------------

create table core.attachments (
  id serial primary key,
  parent_table text not null,
  parent_id int not null,
  storage_path text not null,
  uploaded_by int not null default core.current_profile_id() references core.profiles (id),
  uploaded_at timestamptz not null default now()
);

create index attachments_parent_idx on core.attachments (parent_table, parent_id);

do $$
declare
  t text;
begin
  for t in select unnest(array['health_observations', 'health_observation_issues', 'attachments'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on core.health_observations to authenticated;

create policy "health_observations_read_active_member" on core.health_observations
  for select to authenticated
  using (core.is_active_member());

create policy "health_observations_insert_contributor" on core.health_observations
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

create policy "health_observations_admin_all" on core.health_observations
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

grant select, insert, update, delete on core.health_observation_issues to authenticated;

create policy "health_observation_issues_read_active_member" on core.health_observation_issues
  for select to authenticated
  using (core.is_active_member());

create policy "health_observation_issues_insert_contributor" on core.health_observation_issues
  for insert to authenticated
  with check (core.is_contributor());

create policy "health_observation_issues_admin_all" on core.health_observation_issues
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

grant select, insert, update, delete on core.attachments to authenticated;

create policy "attachments_read_active_member" on core.attachments
  for select to authenticated
  using (core.is_active_member());

create policy "attachments_insert_contributor" on core.attachments
  for insert to authenticated
  with check (core.is_contributor() and uploaded_by = core.current_profile_id());

create policy "attachments_admin_all" on core.attachments
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for attachment files — private; access mirrors the table RLS above.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_bucket_read_active_member" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and core.is_active_member());

create policy "attachments_bucket_insert_contributor" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and core.is_contributor());

create policy "attachments_bucket_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and core.is_admin())
  with check (bucket_id = 'attachments' and core.is_admin());
