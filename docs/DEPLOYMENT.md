# Production deployment guide — Phase 12 release candidate

**Production changes and live deployment require owner confirmation.** This guide is a preparation checklist, not evidence that production was changed or certified. See [launch readiness](LAUNCH_READINESS.md), [findings](SECURITY_REVIEW.md), [operations](OPERATIONS.md), [recovery](BACKUP_RECOVERY.md) and [user acceptance](USER_ACCEPTANCE.md).

## Required architecture

- Vercel: Next.js App Router server runtime, Node **24.x**, npm lockfile installation, `npm run build`. Framework preset **Next.js**; leave Output Directory at its Next.js default. Do not use `dist`, static export or an SPA rewrite. Optional local production preview: `APP_URL=http://127.0.0.1:4173 npm run preview -- --port 4173`.
- Supabase: Auth, PostgreSQL, private Storage, authorized private Realtime Broadcast. Apply all versioned migrations in filename order for a new project; never run older one-time phase installers over existing tables. Existing projects should inspect migration history and apply only pending versions.
- LiveKit Cloud or a properly secured LiveKit server, plus an **always-on independent voice enforcement worker**, outside Vercel request functions. Start command `npm run voice:worker -- --hosted`. The worker must use the same Supabase and LiveKit project as the app; its health is required for new admissions. No default voice recording.
- Private daily maintenance: moderation, chat-file, social-file and squad cleanup. Optional event reminder scheduler every five minutes. The included GitHub workflows need repository secrets/enable variables and are disabled on their schedules until enabled. Phase 12 adds completion heartbeats; use the new worker/scripts with the new schema.

## Environment variables

Store values in Vercel **Project → Settings → Environment Variables**, never source code or chat. Production and Preview scopes are separate.

| Variable | Exposure | Required value/purpose |
| --- | --- | --- |
| `APP_URL` | Server | `https://the-gathering3.vercel.app`, exact origin without a path/query; use the canonical site for auth, uploads and voice. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | HTTPS project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | Publishable/anon key only; never a secret/service-role key. |
| `SUPABASE_SECRET_KEY` | Server | Rotated Supabase secret/service-role key. |
| `LIVEKIT_URL` | Server (returned as connection destination after admission) | `wss://…` project endpoint, no path or credentials. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Server | Matching project credentials, secret at least 32 characters. |
| `OPS_HEALTH_TOKEN` | Server/uptime monitor | Independent random secret of at least 32 characters for `/api/ops/health`. Never `NEXT_PUBLIC_`. |

The voice worker needs the Supabase URL/server key and all three LiveKit values. Maintenance needs the Supabase URL/server key. Repository maintenance secrets are `GATHERING_SUPABASE_URL` and `GATHERING_SUPABASE_SECRET_KEY`. Set `ENABLE_MODERATION_CLEANUP=true` and, if wanted, `ENABLE_EVENT_REMINDERS=true` after configuration. Restrict who can read/change CI, hosting and database credentials.

`npm run build` validates supplied values without printing them. `npm run check:production` requires the entire deployment configuration and rejects local/insecure origins. Build-only unit CI uses an ephemeral canary, not a real service credential. Do not deploy CI canary configuration. Build success alone does not prove provider connectivity.

**A Supabase server secret was shared in the earlier setup conversation. Its rotation has not been independently verified. Rotate/revoke that key and update Vercel, the voice worker and all schedulers before public launch.** Revoke old keys after confirming replacement connectivity. Rotate any credential that has entered logs or an untrusted location. No recognized private credential patterns were found in tracked source/history during this phase.

## Supabase checklist

1. Confirm the intended project/region, administrator MFA, billing limits, restricted dashboard access and actual backup/PITR capability.
2. Configure Auth **Site URL** as the canonical `APP_URL`. Allow only the required exact production callback/confirmation/reset routes; staging uses its own origin. Remove obsolete preview wildcards. Verification is required; do not enable anonymous identities for member access.
3. Configure and verify production SMTP (sender/domain, SPF/DKIM/DMARC, verification and recovery links, quota/rate limits). The local Mailpit test is not a production mail test. Existing registration protections include server attempt budgets and provider rate limits; there is no CAPTCHA client integration. Do not enable a provider CAPTCHA requirement until the client integration is implemented and tested.
4. Keep `avatars`, `message-files`, `social-media` **private**. Browser direct writes are denied; uploads pass server validation and Auth/RLS before privileged storage operations. WebP image conversion strips metadata and limits dimensions; source/output sizes are bounded. Clips require permitted MP4 rights attestation; non-image downloads use safe dispositions. There is no antivirus service; determine whether to disable general attachments or add scanning for your launch threat model.
5. Disable public Realtime channels/subscriptions as documented in the messaging/people guides. Test private topic rejection from an unrelated account. Do not add broad authenticated/anonymous policies to fix access errors.
6. Confirm all app tables in `public`/`private` enable RLS. Only the explicit public profile/avatar projections permit anonymous definer execution. Never expose `private` as a public API schema.
7. Verify actual platform owner, support staff coverage, contact privacy defaults and evidence retention. Community ownership is separate from platform ownership.

## Apply Phase 12 after approval

1. Review the single migration `supabase/migrations/202610310001_launch_operations.sql` and the exact pending-only installer `supabase/phase12-setup.sql`.
2. Back up the database **and private storage bytes**; record the pre-release commit and provider recovery points. Rehearse staging recovery before the production window.
3. Inspect `supabase_migrations.schema_migrations`. If `202610310001` is recorded, the installer skips it. If Phase 12 objects exist without a record, stop and inspect; do not drop tables or mark unverified SQL applied.
4. Assess production table sizes and index build time. This migration transactionally creates missing FK/scope indexes, so plan a maintenance window on populated databases. Do not blindly change to `CONCURRENTLY` inside a transaction. The local fixture timings are not a production load test.
5. With owner approval, run the **entire** Phase 12 installer through trusted SQL Editor or the normal approved migration process. `pg_advisory_xact_lock` output is normal. It preserves Phase 11 data and adds ownership-deletion guards, a paginated member-directory sequence, indexes, private maintenance heartbeats and service-only health RPCs.
6. Update the app/worker/maintenance together. Do not permit owner deletion during a mixed-version release window: older app versions do not perform the early ownership preflight, although the database still blocks orphaning at deletion.
7. With separate deployment approval, publish/promote the reviewed commit. Check Vercel's exact commit and **Ready / Production** status; do not assume a Git push completed deployment. Check the canonical domain, not a deployment-specific preview URL.
8. Run all [user acceptance](USER_ACCEPTANCE.md) checks on staging, then approved production smoke tests with designated accounts. Registration/recovery, cross-account authorization, real devices/microphones and moderation are release gates.
9. Configure private uptime monitoring: `/api/health` is liveness only; `/api/ops/health` requires the secret bearer token and must return 200 with all dependency checks true. Alert on 503, stale worker or overdue maintenance. Keep health response bodies/log drains restricted.

## Caching and resource use

Member pages and APIs are dynamic/private and must not be CDN-cached across accounts. Attachment/evidence responses use no-store; no public signed media URLs are issued. Public static assets/fonts may use framework caching. The release adds bounded admin-member cursor pages; chat history remains 40-message pages, with stable-ID reconnect reconciliation. Thread and root history indexes avoid loading/sorting a whole history for the first page.

Plan quotas from actual workload, not a fictional capacity promise. Example assumptions: 100 members × 50 messages/day × 2 KB serialized text ≈ 10 MB/day before indexes/WAL/backups. A 1 MB photo viewed by 100 authorized members is roughly 100 MB egress; private/no-store access favors privacy over shared CDN hits. Four files at the 3 MB cap can approach 12 MB per post/report hold. Voice bandwidth varies with codec, speaking time, subscribed peers and TURN relay use; measure real LiveKit participant-minutes/egress. Polling (typically 15 seconds), personal/channel Broadcast invalidations and enforcement checks also consume connection/database quotas. Establish alerts at agreed budget thresholds and run a separate representative load test before increasing membership. Provider pricing and limits must be verified against the chosen plans.

## Release and rollback policy

Use protected branches and require the verification workflow plus integration evidence before promotion. The included CI workflow runs lint, types, unit tests, secret-pattern history scan, dependency audit, production build and bundle scan on PR/manual dispatch. Full local Docker/WebRTC suites remain an explicit gate; they are not silently replaced by unit CI. No workflow here deploys automatically. Existing Vercel Git integration may deploy `main`, so pushing/merging to it is a live action requiring confirmation.

Prefer rolling the app back to a verified compatible commit while keeping additive security guards/indexes. Do not drop user tables, evidence holds or deletion protection as a rollback shortcut. Verify old-client RPC compatibility on staging; account-owner deletion may return an error on older UIs. If data recovery is required, follow the isolated-restore/PITR procedure; restoring old data can undo valid deletions/blocks and requires a reconciliation plan. Never run a restore over production without explicit owner approval.
