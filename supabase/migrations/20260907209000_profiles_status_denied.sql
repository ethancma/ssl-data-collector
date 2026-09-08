-- Add 'denied' as an allowed core.profiles.status value, so admins can reject a
-- pending sign-up (as opposed to just leaving it pending indefinitely).

alter table core.profiles
  drop constraint profiles_status_check;

alter table core.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'denied'));
