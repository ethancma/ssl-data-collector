-- Run manually in the linked project's Supabase SQL Editor only after the
-- amended migrations have recreated core.profiles. The matching auth.users
-- rows remain intact during the schema rebuild.

begin;

insert into core.profiles (
  id,
  auth_user_id,
  email,
  display_name,
  role,
  status,
  created_at,
  updated_at
)
values
  (
    1,
    '2139a1c0-ddbe-4103-90dc-66bcce2b2b95'::uuid,
    'test-tech@ssl.dev',
    'Test Technician',
    'technician',
    'active',
    '2026-09-24 19:37:25.945896+00'::timestamptz,
    '2026-09-24 19:37:25.945896+00'::timestamptz
  ),
  (
    2,
    '5cf76a2c-75d7-4c5a-bba5-4e81fc90a879'::uuid,
    'test-admin@ssl.dev',
    'Test Admin',
    'admin',
    'active',
    '2026-09-24 19:37:25.945896+00'::timestamptz,
    '2026-09-24 19:37:25.945896+00'::timestamptz
  ),
  (
    3,
    '7d44a706-21a8-4536-b009-f631bc82a894'::uuid,
    'test-volunteer@ssl.dev',
    'Test Volunteer',
    'volunteer',
    'active',
    '2026-09-24 19:37:25.945896+00'::timestamptz,
    '2026-09-24 19:37:25.945896+00'::timestamptz
  ),
  (
    4,
    '4783538f-a3dc-4df8-98d5-514a59668ba8'::uuid,
    'm@sample.com',
    null,
    null,
    'pending',
    '2026-09-24 19:37:25.945896+00'::timestamptz,
    '2026-09-24 19:37:25.945896+00'::timestamptz
  )
on conflict (auth_user_id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

select setval(
  pg_get_serial_sequence('core.profiles', 'id'),
  (select max(id) from core.profiles),
  true
);

commit;
