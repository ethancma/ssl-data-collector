-- One-time cleanup: an earlier push predating the core/analytics schema rewrite left
-- these schemas on remote; drop them so the rest of this migration history can
-- (re)create them from a clean state. Safe to keep permanently — idempotent no-op
-- once nothing stale remains.
drop schema if exists analytics cascade;
drop schema if exists core cascade;

-- Same earlier push also created an `attachments` Storage bucket, which lives in
-- storage.buckets/storage.objects (outside the schemas above, so untouched by the
-- drops), and conflicts with the bucket the attachments migration (re)creates.
-- Clear any objects first (FK dependency), then the bucket row itself. Storage
-- guards these tables against direct deletes (protect_delete trigger); opt in
-- for this statement only via the documented escape hatch.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'attachments';
delete from storage.buckets where id = 'attachments';
