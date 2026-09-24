-- Run manually in the linked project's Supabase SQL Editor.
-- This removes only app-owned schemas and the empty attachments bucket.
-- auth.users and other Supabase-managed schemas remain intact.

begin;

drop schema if exists analytics cascade;
drop schema if exists core cascade;

set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'attachments';
delete from storage.buckets where id = 'attachments';

commit;
