-- Reproducible local/dev fixtures, run automatically after every migration during
-- `supabase db reset --local` (wired via [db.seed] sql_paths in supabase/config.toml).
-- NOT applied to the remote/hosted project by `supabase db push` — seed.sql is a
-- local-dev-only Supabase CLI convention. See supabase/seeds/README.md for how
-- one-time historical-data imports (which DO need to land on remote) are handled
-- instead.
--
-- Creates four seeded test accounts (email/password stand-ins for Google OAuth),
-- one per native role, pre-approved so e2e/manual QA can log
-- in immediately). Idempotent: safe to run on every reset.

begin;

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-000000000001';
  tech_id uuid := '00000000-0000-0000-0000-000000000002';
  volunteer_id uuid := '00000000-0000-0000-0000-000000000003';
  viewer_id uuid := '00000000-0000-0000-0000-000000000004';
  -- Local/dev-only credential, never used against the hosted project (see
  -- test-accounts.md's rules). Fine to keep in plain sight here.
  test_password text := 'ssl-test-password';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'test-admin@ssl.dev', extensions.crypt(test_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', tech_id, 'authenticated', 'authenticated',
      'test-tech@ssl.dev', extensions.crypt(test_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', volunteer_id, 'authenticated', 'authenticated',
      'test-volunteer@ssl.dev', extensions.crypt(test_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', viewer_id, 'authenticated', 'authenticated',
      'test-viewer@ssl.dev', extensions.crypt(test_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '')
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    updated_at = now();

  -- Required so GoTrue treats these as email/password-authenticated identities.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values
    (gen_random_uuid(), admin_id, admin_id::text,
      jsonb_build_object('sub', admin_id::text, 'email', 'test-admin@ssl.dev'),
      'email', now(), now(), now()),
    (gen_random_uuid(), tech_id, tech_id::text,
      jsonb_build_object('sub', tech_id::text, 'email', 'test-tech@ssl.dev'),
      'email', now(), now(), now()),
    (gen_random_uuid(), volunteer_id, volunteer_id::text,
      jsonb_build_object('sub', volunteer_id::text, 'email', 'test-volunteer@ssl.dev'),
      'email', now(), now(), now()),
    (gen_random_uuid(), viewer_id, viewer_id::text,
      jsonb_build_object('sub', viewer_id::text, 'email', 'test-viewer@ssl.dev'),
      'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  -- core.handle_new_user() (see 20260907200000_core_foundation.sql) already fired off
  -- the inserts above and created a pending, roleless profile per account — promote
  -- them to the active role each test account is supposed to have.
  update core.profiles set role = 'admin', status = 'active',
      display_name = coalesce(display_name, 'Test Admin')
    where auth_user_id = admin_id;
  update core.profiles set role = 'technician', status = 'active',
      display_name = coalesce(display_name, 'Test Technician')
    where auth_user_id = tech_id;
  update core.profiles set role = 'volunteer', status = 'active',
      display_name = coalesce(display_name, 'Test Volunteer')
    where auth_user_id = volunteer_id;
  update core.profiles set role = 'viewer', status = 'active',
      display_name = coalesce(display_name, 'Test Viewer')
    where auth_user_id = viewer_id;
end;
$$;

commit;
