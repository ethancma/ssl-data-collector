-- Fallback only: run manually in the linked project's Supabase SQL Editor after
-- `supabase db reset --linked` rebuilt core. auth.users survives the reset, but the profiles
-- table is empty, so every user would be locked out.
-- Edit admin_email, then run the whole file.

begin;

-- Every auth user gets a pending, roleless profile (what a first sign-in creates).
insert into core.profiles (auth_user_id, email)
select u.id, u.email
from auth.users u
where not exists (select 1 from core.profiles p where p.auth_user_id = u.id);

-- Activation is server-managed: the guard only allows it for the postgres role when
-- core.invitation_write names that auth user.
select set_config('core.invitation_write', u.id::text, true)
from auth.users u
where u.email = 'admin_email@example.com';

update core.profiles
set role = 'admin', status = 'active'
where email = 'admin_email@example.com';

commit;

-- Expect no rows in the first query and one active admin in the second.
select u.id, u.email from auth.users u where not exists (select 1 from core.profiles p where p.auth_user_id = u.id);
select id, email, role, status from core.profiles order by id;
