-- maintenance_logs — log-entry-only capture of ad hoc maintenance events (filter change,
-- sump flush, other), following the chemical_additions pattern (text+CHECK vocab,
-- data_source + event/entered timestamps, recorded_by defaulted server-side,
-- contributor/admin RLS). Scoped down from the roadmap's full "Maintenance scheduling"
-- area (platform-architecture.md §4, §6) — no recurrence/due-date maintenance_tasks table,
-- no interval config, no due/overdue computation, just the event log.

create table core.maintenance_logs (
  id serial primary key,
  system_id int not null references core.systems (id) on delete cascade,
  task_type text not null check (task_type in ('filter_change', 'sump_flush', 'other')),
  performed_at timestamptz not null default now(),
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  notes text,
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now()
);

create index maintenance_logs_system_performed_idx
  on core.maintenance_logs (system_id, performed_at desc);

alter table core.maintenance_logs enable row level security;

grant select, insert, update, delete on core.maintenance_logs to authenticated;

create policy "maintenance_logs_read_active_member" on core.maintenance_logs
  for select to authenticated
  using (core.is_active_member());

create policy "maintenance_logs_insert_contributor" on core.maintenance_logs
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

create policy "maintenance_logs_admin_all" on core.maintenance_logs
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());
