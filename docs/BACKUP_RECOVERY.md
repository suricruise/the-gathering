# Backup, recovery and rollback runbook

A PostgreSQL backup alone is **not** a complete Supabase backup: private Storage object bytes, Auth/provider settings, Realtime configuration, SMTP, secrets and the deployed app version need separate protection. LiveKit media is not recorded by this app, so there is no app voice-recording archive to restore.

## Establish the recovery policy before launch

Name an operator and backup owner. Approve retention, encryption, access controls, regions, budget and recoverable deletion policy. Suggested initial **targets**, not measured guarantees: database RPO ≤24 hours with daily backups (or a verified shorter PITR window), recovery RTO ≤4 hours, storage exports at least daily. Validate the chosen Supabase plan's actual capabilities, retention, regional availability and Auth coverage. Store encrypted off-project copies and test decryption/restore permissions. Backups contain private prayers, messages, email/age attestations and authentication material; do not put them in Git, CI artifacts or public buckets.

Keep a secure configuration inventory with the migration ledger, app/worker commit, provider project IDs/regions, DNS/domain configuration, SMTP templates, Realtime policies, bucket privacy and scheduler setup. Keep secrets in a proper secret manager; rotate replacement keys rather than restoring a compromised key into service. Preserve `supabase_migrations.schema_migrations` and migration checksums where the operator's normal migration process maintains them.

## Database backup

Use Supabase's supported managed backups/PITR or an approved `pg_dump` procedure with the proper privileged connection and SSL. Keep schema, data, RLS policies, function grants, triggers, role dependencies and migration history. Document separately which provider-managed Auth schemas/configuration the chosen export includes. Never assume dashboard settings or Storage bytes are part of an SQL dump. Do not run a local test script against a hosted connection.

## Storage backup

Export each of `avatars`, `message-files` and `social-media` through supported authenticated Storage APIs or provider tooling, with object paths, content types, sizes and SHA-256 manifests. Use bounded pagination, download private bytes securely and verify hashes. Never make a bucket public as a backup shortcut. Include objects currently retained by moderation evidence holds; deleting an original post does not necessarily release its safety hold yet. Encrypt manifests and payloads because paths and content can identify members.

Reconcile a backup taken across database/storage time boundaries: an object may be referenced but not yet copied, or copied but no longer referenced. Record the snapshot window, enumerate missing/orphaned objects and replay approved changes. Test a real photo/file download and an evidence-held deleted attachment after restore, not just a row count. Account deletion and evidence expiration must also propagate into backup expiration/recovery procedures under the approved legal policy.

## Isolated recovery drill

1. Obtain explicit approval for the drill target. Create an isolated staging project/database and private storage buckets; never overwrite production as a test.
2. Restore required database roles/extensions and the approved database snapshot. Validate schema history, RLS on every app table, function execute grants, ownership-deletion guards and private Realtime policies before any user is allowed in.
3. Restore Storage bytes and bucket privacy; verify manifests/hashes and account-isolated downloads. Reconfigure Auth site/redirect URLs, staging SMTP, Realtime, LiveKit credentials and secrets for the isolated environment. **Do not** allow a restored worker to operate on production LiveKit rooms.
4. Reconcile valid post-backup bans, blocks, account deletions, role revocations, evidence expiry and newly created/deleted media. Data restore must not silently resurrect deleted accounts or regain forbidden access. Reset/purge expired auth sessions and old notification delivery jobs as appropriate to the incident.
5. Run the user acceptance checklist with designated staging accounts, including unrelated-user reads, direct API/RLS attempts and two-device voice moderation. Verify health, mail and the first maintenance passes. Re-enable reminder delivery only after dedupe/recipient checks; do not accidentally send a historical queue.
6. Record actual elapsed time, recoverable snapshot age, missing bytes, authorization results and the operator sign-off. Remove the isolated environment/temporary decrypted copies under policy.

`npm run test:recovery` rehearses a full dump/restore into a new uniquely named **local** database, checks critical functions/RLS/private bucket metadata, and deletes the rehearsal DB and private temporary dump. It refuses non-loopback connections. It does not restore physical Storage bytes, provider configuration, hosted PITR or production DNS. Those remain explicit operator acceptance gates.

## Deployment rollback

Record the previously verified app and worker commits before promotion. Prefer Vercel rollback to a known compatible deployment while preserving additive schema/index/security improvements. Phase 12 keeps existing RPC signatures and adds a directory cursor field; authorization guards should remain. Verify compatibility in staging. Older app versions lack the early ownership-deletion preflight and may clean some files before the new database rejects deleting an owner, so suspend owner-deletion activity during mixed-version/rollback windows and deploy a compatible fix promptly.

Never drop app tables, disable RLS, remove evidence holds or delete the ownership guard to make rollback succeed. An unsuccessful installer transaction rolls back; the pending-only installer can be rerun after correcting prerequisites. Do not mark migrations applied merely because some table names exist. Destructive schema rollback needs its own reviewed migration, complete backups and owner confirmation. Recovery from data corruption is an isolated restore/PITR and reconciliation operation, not a blind SQL rollback.
