-- Daily AM/PM checks — the first operational log table and the pattern all other
-- log tables follow: text+CHECK vocab, data_source + event/entered timestamps,
-- recorded_by defaulted server-side to the caller's core.profiles row, and
-- role-gated RLS.

set local check_function_bodies = off;

-- Active member who may write logs (everyone active except read-only viewers).
create or replace function core.is_contributor()
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

create table core.daily_checks (
  id serial primary key,
  system_id int not null references core.systems (id) on delete cascade,
  check_type text not null check (check_type in ('AM', 'PM')),
  water_running boolean not null,
  temperature numeric(5, 2),
  notes text,
  recorded_by int not null default core.current_profile_id() references core.profiles (id),
  checked_at timestamptz not null default now(),
  data_source text not null default 'live'
    check (data_source in ('live', 'historical_import', 'paper_backfill')),
  entered_at timestamptz not null default now()
);

create index daily_checks_system_checked_idx
  on core.daily_checks (system_id, checked_at desc);

do $$
declare
  t text;
begin
  for t in select unnest(array['daily_checks'])
  loop
    execute format('alter table core.%I enable row level security', t);
  end loop;
end;
$$;

grant select, insert, update, delete on core.daily_checks to authenticated;

create policy "daily_checks_read_active_member" on core.daily_checks
  for select to authenticated
  using (core.is_active_member());

create policy "daily_checks_insert_contributor" on core.daily_checks
  for insert to authenticated
  with check (core.is_contributor() and recorded_by = core.current_profile_id());

-- Corrections/deletes are admin-only (technicians/volunteers are insert + read).
create policy "daily_checks_admin_all" on core.daily_checks
  for all to authenticated
  using (core.is_admin())
  with check (core.is_admin());
