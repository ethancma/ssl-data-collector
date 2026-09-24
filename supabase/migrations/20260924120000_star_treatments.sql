-- Individual-star treatments with RPC-only writes and an immutable audit trail.

set local check_function_bodies = off;

create or replace function core.normalize_star_treatment_type(value text)
  returns text
  language plpgsql
  immutable
  strict
  set search_path = pg_catalog, core
  as $$
declare
  normalized_value text;
  canonical_key text;
begin
  normalized_value := pg_catalog.regexp_replace(pg_catalog.btrim(value), '[[:space:]]+', ' ', 'g');

  if normalized_value = '' or pg_catalog.length(normalized_value) > 100 then
    raise exception 'Treatment type must be between 1 and 100 characters.'
      using errcode = '23514';
  end if;

  canonical_key := pg_catalog.lower(
    pg_catalog.regexp_replace(normalized_value, '[[:space:]_-]+', '_', 'g')
  );

  if canonical_key = 'probiotics' then
    return 'probiotics';
  elsif canonical_key = 'reef_dip' then
    return 'reef_dip';
  end if;

  return normalized_value;
end;
$$;

revoke execute on function core.normalize_star_treatment_type(text)
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create table core.star_treatments (
  id serial primary key,
  animal_id int not null references core.animals (id) on delete restrict,
  tank_id int not null references core.tanks (id) on delete restrict,
  treatment_type text not null default 'probiotics',
  amount numeric,
  unit text,
  concentration numeric,
  concentration_unit text,
  notes text,
  administered_at timestamptz not null default now(),
  recorded_by int not null references core.profiles (id) on delete restrict,
  data_source text not null default 'live',
  entered_at timestamptz not null default now(),
  constraint star_treatments_treatment_type_normalized_check
    check (treatment_type = core.normalize_star_treatment_type(treatment_type)),
  constraint star_treatments_amount_positive_check
    check (amount is null or amount > 0),
  constraint star_treatments_concentration_positive_check
    check (concentration is null or concentration > 0),
  constraint star_treatments_value_required_check
    check (amount is not null or concentration is not null),
  constraint star_treatments_amount_unit_pair_check
    check ((amount is null) = (unit is null)),
  constraint star_treatments_concentration_unit_pair_check
    check ((concentration is null) = (concentration_unit is null)),
  constraint star_treatments_unit_check
    check (unit is null or (pg_catalog.btrim(unit) <> '' and pg_catalog.length(unit) <= 50)),
  constraint star_treatments_concentration_unit_check
    check (
      concentration_unit is null
      or (pg_catalog.btrim(concentration_unit) <> '' and pg_catalog.length(concentration_unit) <= 50)
    ),
  constraint star_treatments_notes_length_check
    check (
      notes is null
      or (pg_catalog.btrim(notes) <> '' and pg_catalog.length(notes) <= 5000)
    ),
  constraint star_treatments_data_source_check
    check (data_source in ('live', 'import', 'paper_backfill'))
);

create index star_treatments_animal_administered_idx
  on core.star_treatments (animal_id, administered_at desc);
create index star_treatments_tank_administered_idx
  on core.star_treatments (tank_id, administered_at desc);
create index star_treatments_type_administered_idx
  on core.star_treatments (treatment_type, administered_at desc);

create or replace function core.enforce_star_treatment_immutable_fields()
  returns trigger
  language plpgsql
  set search_path = pg_catalog, core
  as $$
begin
  if new.id is distinct from old.id
      or new.animal_id is distinct from old.animal_id
      or new.tank_id is distinct from old.tank_id
      or new.administered_at is distinct from old.administered_at
      or new.recorded_by is distinct from old.recorded_by
      or new.data_source is distinct from old.data_source
      or new.entered_at is distinct from old.entered_at then
    raise exception 'Star treatment identity, event time, and provenance are immutable.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function core.enforce_star_treatment_immutable_fields()
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger star_treatments_immutable_fields
  before update on core.star_treatments
  for each row execute function core.enforce_star_treatment_immutable_fields();

create table core.star_treatment_audit_log (
  id bigserial primary key,
  treatment_id int not null,
  actor_profile_id int not null,
  actor_snapshot jsonb not null,
  action text not null check (action in ('create', 'update', 'hard_delete')),
  correction_reason text,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  transaction_id bigint not null default pg_catalog.txid_current(),
  before_data jsonb,
  after_data jsonb,
  constraint star_treatment_audit_reason_check
    check (
      (action = 'create' and correction_reason is null)
      or (
        action in ('update', 'hard_delete')
        and correction_reason is not null
        and pg_catalog.btrim(correction_reason) <> ''
        and pg_catalog.length(correction_reason) <= 1000
      )
    ),
  constraint star_treatment_audit_images_check
    check (
      (action = 'create' and before_data is null and after_data is not null)
      or (action = 'update' and before_data is not null and after_data is not null)
      or (action = 'hard_delete' and before_data is not null and after_data is null)
    )
);

create index star_treatment_audit_treatment_idx
  on core.star_treatment_audit_log (treatment_id, occurred_at desc);

create or replace function core.reject_star_treatment_audit_mutation()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, core
  as $$
begin
  raise exception 'Star treatment audit rows are immutable.'
    using errcode = '42501';
end;
$$;

revoke execute on function core.reject_star_treatment_audit_mutation()
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create trigger star_treatment_audit_immutable
  before update or delete or truncate on core.star_treatment_audit_log
  for each statement execute function core.reject_star_treatment_audit_mutation();

create or replace function core.write_star_treatment_audit(
  p_treatment_id int,
  p_actor_profile_id int,
  p_action text,
  p_correction_reason text,
  p_before_data jsonb,
  p_after_data jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = pg_catalog, core
  as $$
declare
  actor_snapshot_value jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'profile_id', profile.id,
    'auth_user_id', profile.auth_user_id,
    'email', profile.email,
    'display_name', profile.display_name,
    'role', profile.role,
    'status', profile.status
  )
  into actor_snapshot_value
  from core.profiles as profile
  where profile.id = p_actor_profile_id;

  if actor_snapshot_value is null then
    raise exception 'The audit actor profile does not exist.'
      using errcode = '23503';
  end if;

  insert into core.star_treatment_audit_log (
    treatment_id,
    actor_profile_id,
    actor_snapshot,
    action,
    correction_reason,
    before_data,
    after_data
  )
  values (
    p_treatment_id,
    p_actor_profile_id,
    actor_snapshot_value,
    p_action,
    p_correction_reason,
    p_before_data,
    p_after_data
  );
end;
$$;

revoke execute on function core.write_star_treatment_audit(int, int, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

create or replace function core.create_star_treatment(
  p_animal_id int,
  p_tank_id int,
  p_amount numeric default null,
  p_unit text default null,
  p_concentration numeric default null,
  p_concentration_unit text default null,
  p_treatment_type text default 'probiotics',
  p_notes text default null,
  p_administered_at timestamptz default pg_catalog.now()
)
  returns core.star_treatments
  language plpgsql
  security definer
  set search_path = pg_catalog, core
  as $$
declare
  actor_profile core.profiles%rowtype;
  animal_tank_id int;
  animal_status text;
  animal_tracking_type text;
  species_category text;
  normalized_type text;
  normalized_unit text;
  normalized_concentration_unit text;
  normalized_notes text;
  created_treatment core.star_treatments%rowtype;
begin
  select profile.*
  into actor_profile
  from core.profiles as profile
  where profile.auth_user_id = auth.uid()
    and profile.status = 'active'
    and profile.role in ('admin', 'technician', 'volunteer');

  if not found then
    raise exception 'An active Admin, Technician, or Volunteer profile is required.'
      using errcode = '42501';
  end if;

  if p_administered_at is null then
    raise exception 'Administered time is required.' using errcode = '23502';
  end if;

  if (p_administered_at at time zone 'America/Los_Angeles')::date
      <> (pg_catalog.statement_timestamp() at time zone 'America/Los_Angeles')::date then
    raise exception 'Live star treatments must use the current America/Los_Angeles date.'
      using errcode = '23514';
  end if;

  select animal.tank_id, animal.status, animal.tracking_type, species.category
  into animal_tank_id, animal_status, animal_tracking_type, species_category
  from core.animals as animal
  join core.species as species on species.id = animal.species_id
  where animal.id = p_animal_id
  for share of animal, species;

  if not found then
    raise exception 'The selected animal does not exist.' using errcode = '23503';
  end if;

  if animal_status <> 'active'
      or animal_tracking_type <> 'individual'
      or species_category <> 'star' then
    raise exception 'The selected animal must be an active, individually tracked star.'
      using errcode = '23514';
  end if;

  if animal_tank_id <> p_tank_id then
    raise exception 'The selected tank does not match the star''s current tank.'
      using errcode = '23514';
  end if;

  if p_amount is null and p_concentration is null then
    raise exception 'Amount or concentration is required.' using errcode = '23514';
  end if;

  if p_amount is not null and p_amount <= 0 then
    raise exception 'Amount must be positive.' using errcode = '23514';
  end if;

  if p_concentration is not null and p_concentration <= 0 then
    raise exception 'Concentration must be positive.' using errcode = '23514';
  end if;

  normalized_type := core.normalize_star_treatment_type(p_treatment_type);

  if p_amount is null then
    normalized_unit := null;
  elsif p_unit is null then
    normalized_unit := 'mL';
  else
    normalized_unit := pg_catalog.regexp_replace(pg_catalog.btrim(p_unit), '[[:space:]]+', ' ', 'g');
    if normalized_unit = '' or pg_catalog.length(normalized_unit) > 50 then
      raise exception 'Amount unit must be between 1 and 50 characters.' using errcode = '23514';
    end if;
  end if;

  if p_concentration is null then
    normalized_concentration_unit := null;
  elsif p_concentration_unit is null then
    normalized_concentration_unit := 'ppm';
  else
    normalized_concentration_unit := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_concentration_unit),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if normalized_concentration_unit = '' or pg_catalog.length(normalized_concentration_unit) > 50 then
      raise exception 'Concentration unit must be between 1 and 50 characters.' using errcode = '23514';
    end if;
  end if;

  normalized_notes := nullif(pg_catalog.btrim(p_notes), '');

  insert into core.star_treatments (
    animal_id,
    tank_id,
    treatment_type,
    amount,
    unit,
    concentration,
    concentration_unit,
    notes,
    administered_at,
    recorded_by,
    data_source
  )
  values (
    p_animal_id,
    p_tank_id,
    normalized_type,
    p_amount,
    normalized_unit,
    p_concentration,
    normalized_concentration_unit,
    normalized_notes,
    p_administered_at,
    actor_profile.id,
    'live'
  )
  returning * into created_treatment;

  perform core.write_star_treatment_audit(
    created_treatment.id,
    actor_profile.id,
    'create',
    null,
    null,
    pg_catalog.to_jsonb(created_treatment)
  );

  return created_treatment;
end;
$$;

create or replace function core.update_star_treatment(
  p_treatment_id int,
  p_treatment_type text,
  p_amount numeric,
  p_unit text,
  p_concentration numeric,
  p_concentration_unit text,
  p_notes text,
  p_correction_reason text
)
  returns core.star_treatments
  language plpgsql
  security definer
  set search_path = pg_catalog, core
  as $$
declare
  actor_profile core.profiles%rowtype;
  previous_treatment core.star_treatments%rowtype;
  updated_treatment core.star_treatments%rowtype;
  normalized_type text;
  normalized_unit text;
  normalized_concentration_unit text;
  normalized_notes text;
  normalized_reason text;
begin
  select profile.*
  into actor_profile
  from core.profiles as profile
  where profile.auth_user_id = auth.uid()
    and profile.status = 'active'
    and profile.role in ('admin', 'technician', 'volunteer');

  if not found then
    raise exception 'An active Admin, Technician, or Volunteer profile is required.'
      using errcode = '42501';
  end if;

  normalized_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_correction_reason),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if normalized_reason = '' or pg_catalog.length(normalized_reason) > 1000 then
    raise exception 'Correction reason must be between 1 and 1000 characters.'
      using errcode = '23514';
  end if;

  select treatment.*
  into previous_treatment
  from core.star_treatments as treatment
  where treatment.id = p_treatment_id
  for update;

  if not found then
    raise exception 'Star treatment % does not exist.', p_treatment_id using errcode = 'P0002';
  end if;

  if p_amount is null and p_concentration is null then
    raise exception 'Amount or concentration is required.' using errcode = '23514';
  end if;

  if p_amount is not null and p_amount <= 0 then
    raise exception 'Amount must be positive.' using errcode = '23514';
  end if;

  if p_concentration is not null and p_concentration <= 0 then
    raise exception 'Concentration must be positive.' using errcode = '23514';
  end if;

  normalized_type := core.normalize_star_treatment_type(p_treatment_type);

  if p_amount is null then
    normalized_unit := null;
  elsif p_unit is null then
    normalized_unit := 'mL';
  else
    normalized_unit := pg_catalog.regexp_replace(pg_catalog.btrim(p_unit), '[[:space:]]+', ' ', 'g');
    if normalized_unit = '' or pg_catalog.length(normalized_unit) > 50 then
      raise exception 'Amount unit must be between 1 and 50 characters.' using errcode = '23514';
    end if;
  end if;

  if p_concentration is null then
    normalized_concentration_unit := null;
  elsif p_concentration_unit is null then
    normalized_concentration_unit := 'ppm';
  else
    normalized_concentration_unit := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_concentration_unit),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if normalized_concentration_unit = '' or pg_catalog.length(normalized_concentration_unit) > 50 then
      raise exception 'Concentration unit must be between 1 and 50 characters.' using errcode = '23514';
    end if;
  end if;

  normalized_notes := nullif(pg_catalog.btrim(p_notes), '');

  update core.star_treatments
  set treatment_type = normalized_type,
      amount = p_amount,
      unit = normalized_unit,
      concentration = p_concentration,
      concentration_unit = normalized_concentration_unit,
      notes = normalized_notes
  where id = p_treatment_id
  returning * into updated_treatment;

  perform core.write_star_treatment_audit(
    updated_treatment.id,
    actor_profile.id,
    'update',
    normalized_reason,
    pg_catalog.to_jsonb(previous_treatment),
    pg_catalog.to_jsonb(updated_treatment)
  );

  return updated_treatment;
end;
$$;

create or replace function core.hard_delete_star_treatment(
  p_treatment_id int,
  p_correction_reason text
)
  returns void
  language plpgsql
  security definer
  set search_path = pg_catalog, core
  as $$
declare
  actor_profile core.profiles%rowtype;
  deleted_treatment core.star_treatments%rowtype;
  normalized_reason text;
begin
  select profile.*
  into actor_profile
  from core.profiles as profile
  where profile.auth_user_id = auth.uid()
    and profile.status = 'active'
    and profile.role in ('admin', 'technician');

  if not found then
    raise exception 'An active Admin or Technician profile is required.'
      using errcode = '42501';
  end if;

  normalized_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_correction_reason),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if normalized_reason = '' or pg_catalog.length(normalized_reason) > 1000 then
    raise exception 'Correction reason must be between 1 and 1000 characters.'
      using errcode = '23514';
  end if;

  select treatment.*
  into deleted_treatment
  from core.star_treatments as treatment
  where treatment.id = p_treatment_id
  for update;

  if not found then
    raise exception 'Star treatment % does not exist.', p_treatment_id using errcode = 'P0002';
  end if;

  perform core.write_star_treatment_audit(
    deleted_treatment.id,
    actor_profile.id,
    'hard_delete',
    normalized_reason,
    pg_catalog.to_jsonb(deleted_treatment),
    null
  );

  delete from core.star_treatments where id = p_treatment_id;
end;
$$;

alter table core.star_treatments enable row level security;
alter table core.star_treatment_audit_log enable row level security;

revoke all on table core.star_treatments
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.star_treatments_id_seq
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

grant select on table core.star_treatments to admin, technician, volunteer;

create policy "star_treatments_admin_technician_select"
  on core.star_treatments for select to admin, technician
  using (core.is_contributor());
create policy "star_treatments_volunteer_select"
  on core.star_treatments for select to volunteer
  using (core.is_contributor());

revoke all on table core.star_treatment_audit_log
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke all on sequence core.star_treatment_audit_log_id_seq
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

grant select on table core.star_treatment_audit_log to admin;

create policy "star_treatment_audit_admin_select"
  on core.star_treatment_audit_log for select to admin
  using (core.is_admin());

revoke execute on function core.create_star_treatment(int, int, numeric, text, numeric, text, text, text, timestamptz)
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.update_star_treatment(int, text, numeric, text, numeric, text, text, text)
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;
revoke execute on function core.hard_delete_star_treatment(int, text)
  from public, anon, authenticated, service_role, admin, technician, volunteer, viewer;

grant execute on function core.create_star_treatment(int, int, numeric, text, numeric, text, text, text, timestamptz)
  to admin, technician, volunteer;
grant execute on function core.update_star_treatment(int, text, numeric, text, numeric, text, text, text)
  to admin, technician, volunteer;
grant execute on function core.hard_delete_star_treatment(int, text)
  to admin, technician;

comment on table core.star_treatment_audit_log is
  'Immutable star-treatment mutation audit. Treatment and actor identities are retained as snapshots without foreign keys.';