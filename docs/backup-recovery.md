# Production Backup and Recovery

The GitHub Actions backup job is not production-ready until the setup and restore
gates below are complete. It reads the production database and private attachment
bucket, creates an encrypted archive, and writes that archive to private Cloudflare
R2. It does not configure hosted credentials or run a backup during code review.

## Provisioning

Create a GitHub Actions environment named `production-backups`, restricted to
`main`. Do not require manual approval for this environment: scheduled jobs cannot
complete while waiting for an environment reviewer. Restrict its secrets to the
minimum required operations. Set the repository Actions variable
`PRODUCTION_BACKUPS_ENABLED` to `true` only after all provisioning and restore
acceptance gates pass; otherwise scheduled and manually dispatched jobs are skipped.

Set these environment variables:

- `AGE_RECIPIENT`: the public age recipient generated for backup encryption.
- `R2_ACCOUNT_ID`: Cloudflare account identifier.
- `R2_BACKUP_BUCKET`: private R2 Standard bucket name.

Set these environment secrets:

- `SUPABASE_DB_URL`: percent-encoded direct Postgres connection string for the
  production project, or its IPv4-compatible **session** pooler URL on port 5432.
  Transaction pooler URLs are not supported. Use a database role authorized to
  dump all included schemas and database roles; confirm its privileges in an
  isolated rehearsal before provisioning the secret.
- `SUPABASE_SECRET_KEY`: project server-side secret key with read access to Storage.
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: R2 credentials limited to this
  bucket, with object list/read/write/delete permissions.

Store the age private key only in the approved password manager and a separate
recovery copy. Never put it in GitHub, CI, application configuration, or R2.
Keep the public recipient in GitHub Actions variables only.

Before enabling the schedule, verify that the R2 bucket is private and that its
credentials cannot access other buckets. Confirm that GitHub runners can reach the
database endpoint and that database egress, runner storage, runtime, and R2 capacity
are sufficient for the current data volume. Set up failure notifications and name a
primary and secondary owner.

## What the job captures

Each archive contains:

- Schema and data dumps for `auth`, `core`, `storage`, `supabase_migrations`, and
  `public`, plus the database role dump.
- Every object from the private `attachments` bucket.
- A manifest with the target project, bucket metadata, dump hashes, object hashes,
  attachment reconciliation counts, and object sizes.

The job refuses a different project target, a missing/public attachments bucket,
missing objects referenced by attachment rows, or attachment/object inventory changes
observed during the copy. It uploads nothing if those checks or the archive encryption
fails. The encrypted object is downloaded again and its bytes are hashed before
older archives are pruned. The two newest verified backups are retained across
weekly and manual runs; manual runs use a separate prefix but count toward the same
two-backup limit.

R2 keys are unique per workflow run. The job does not delete database rows or
Storage objects. Retention removes only old encrypted R2 archive keys after the new
archive has passed upload read-back verification. A manual run can therefore replace
the oldest weekly recovery point.

## First-run and restore acceptance

Do not treat a successful upload as proof of recoverability. Before production
approval:

1. Dispatch a manual backup from `main` only after all environment variables and
   secrets are provisioned. Confirm the run reports success and the object exists in
   the private R2 bucket.
2. With the private key held by the recovery owner, download the encrypted object
   using the Cloudflare dashboard or an approved R2 client. Decrypt it only on an
   access-controlled recovery machine; verify the archive listing and every
   `manifest.json` SHA-256 entry.
3. Restore into an isolated Supabase project with the compatible Supabase platform
   baseline. Never restore into Production during a drill. The exact restore ordering
   for managed `auth`/`storage` schemas, native roles, data, and migration history
   must be validated and documented from this first drill before the job is relied on.
4. Verify Auth accounts, all four application roles, RLS/grants, migration ledger,
   table row counts, attachment metadata, bucket privacy, photo ownership, object
   hashes, and representative application reads. Measure restore duration against
   the one-working-day target.
5. Record the tested backup key, commit, Supabase platform baseline, checks, row
   counts, hashes, elapsed time, operator, and any discrepancy. Do not include
   credentials or real user data in the record.

Repeat a restore drill quarterly. Keep the two newest points in R2 Standard and
verify that failures never trigger retention cleanup. A failed or missed scheduled
job requires an owner to investigate; R2 storage and billing alerts are not hard
limits or a substitute for monitoring.

## Limitations

This workflow is an initial implementation, not evidence that recovery is ready.
It has not been run against the hosted project, the managed-schema restore ordering
has not been proven, and a backup/restore drill has not been completed. Do not enable
the schedule or approve production until those gates pass. R2 object retention is
not a retention lock; compromised R2 credentials can still delete backups.
