# Stage 8: channel management and community moderation

## Where to find it

Open Discover → your community → **Manage channels & moderation**, or use the settings icon beside the community name in chat, then that link. Community owners/administrators can create text or existing LiveKit voice channels, change names/topics, assign categories, set numeric order, and configure attachments and notification defaults. Category names and order are editable on the same page.

Use existing **Community settings** role/member access overrides to grant private-channel access and configure posting/connect permissions. Explicit denies continue to win for ordinary members; community owners and administrators retain their existing access behavior. Platform administrators can select a community in `/admin`, open Channels & voice, then **Advanced channel settings & moderation**. This uses the community UUID and works for private communities without granting membership or changing platform roles. Existing administrative role access controls remain available there.

Community moderators may restrict a lower-ranked member's posting for 1 minute–7 days and remove restrictions. This applies to text sends, thread replies, typing and new attachment uploads/assignment in that community. Reading, friends, other communities and voice are unaffected. Existing edit/reaction posting gates also respect the restriction; authors can still remove their own content. Existing per-message permission checks continue to govern edits/deletes and pins. Peer/superior roles, community owners, self-targeting, unrelated members and protected platform staff cannot be restricted. Platform bans/suspensions continue to use the existing global account-status controls and immediately revoke channel and voice authorization.

Use the message action menu for Delete, Pin/Unpin and Report. Use member profile safety controls or `/reports` to report a member. `/admin` is the existing authorized reports/evidence/history interface; the new page links to it rather than creating another report queue. Select the appropriate community scope to review its reports/history. Sensitive channel changes also appear in community security activity.

## Lifecycle safeguards

Archive requires typing the exact channel name and a reason. It disables new access, sends and voice admissions while preserving every existing message, file, reply, role override and stable ID. Restore is explicit. Keep at least one active text channel.

Delete is available only for an archived, empty channel with no attachments, event links or unexpired voice admissions. It requires the channel name and a reason. **Deletion is a retained tombstone, not a SQL DELETE:** the channel disappears from supported member and management navigation, and its name stays reserved. No message history or community records are destroyed. A trusted operator can inspect/recover retained records through a separately reviewed maintenance procedure; there is no browser restore for deleted channels. Do not purge records or remove lifecycle columns as a rollback shortcut.

Changing channel type is rejected by the new manager; create a separate text/voice channel instead. Existing administrative APIs remain intact. Legacy disable/enable controls cannot override an archive/deletion gate.

## Security and transport

`channel_management` derives the actor from Auth, checks current verified/live status, community/platform rank and target scope inside a transaction, shares the existing administrative advisory lock and locks the community before mutating channels/restrictions. There is no role-assignment operation or actor argument. Every sensitive change records actor, scope, action, target, reason and timestamp in existing protected audit stores. Keep reasons factual and avoid unnecessary sensitive personal information. Restriction storage has RLS and no browser grants; management returns only a bounded roster and restriction expiry, not private reasons or emails.

Existing `channel_access` keeps its OID and all existing private/view/post/connect/disabled/archive/ban gates. A new `attach` permission additionally enforces the channel attachment policy. Both the upload route and database attachment registration/assignment validate it; staging a file before a policy change does not bypass enforcement. Trusted service/maintenance operations retain their existing access, while browser writes remain revoked. Chat authorization is rechecked after the channel write lock, avoiding a stale permission check when settings change concurrently.

Lifecycle/attachment changes and posting restrictions invalidate private Broadcast epochs. Old topics cannot authorize new channel reads. Existing clients reauthorize and refresh composer permissions, including disabled attachment controls. Existing periodic authorization handles expiry/recovery. Archived/deleted gates also apply to private recipient checks and the existing LiveKit worker/token path. The persistent VoiceProvider, microphone capture, room IDs/grants and server SDK are unchanged.

Notification defaults apply only when the member has no explicit channel/community choice. Community mute still wins; personal choices, global consent, blocks and recipient rate limits remain authoritative. Existing channels default to `inherit`; there is no notification opt-in backfill.

## Database installation and release

Version: `202611120001_channel_management.sql`. Additive fields/indexes, one private restriction table, guarded RPCs/triggers; no destructive migration, backfill, seed or record removal. Apply after Stage 7.

1. Review the migration and backup/recovery procedures in `docs/DEPLOYMENT.md` and `docs/BACKUP_RECOVERY.md`.
2. Obtain explicit approval for hosted database changes and live deployment. Local implementation does not authorize those actions.
3. In Supabase SQL Editor run **only** `supabase/channel-management-setup.sql` (the complete file), or apply the pending version through the normal migration pipeline. Do not rerun old phase setup scripts.
4. The installer records the migration and skips recorded reruns. Objects without a matching record deliberately stop for operator inspection; do not reset/drop tables or invent a migration record.
5. Verify `public.channel_management(uuid,text,jsonb)` exists, the new fields are present, and an authenticated member is denied management. Then deploy the reviewed application build to Vercel.
6. Confirm Vercel Ready, test owner/moderator/member/platform administrator accounts, a private channel, archived-channel denial, attachment policy changes and an active voice connection while navigating text channels. Check worker health.

No new environment variables, provider credentials or public buckets are required. If the migration is missing, the management page shows an unavailable state. Install it before deploying this application's new attachment capability checks.

Rollback: prefer a forward correction; previous app builds can coexist with additive fields and current RPCs. Retain lifecycle/restriction enforcement even when rolling the UI back, so old controls cannot resurrect deleted channels or bypass a restriction. Do not drop columns/tables containing moderation state, replay old function bodies, reset topics or run an earlier installer over this version. Review any data restoration separately with production approval.

## Verification

Local verification passes lint, typecheck, 326 unit tests in 53 files, production build, client-bundle/source/history credential scans, 202 database/actual-service/installer checks and six voice-worker tests. Eight distinct desktop/mobile production-build browser scenarios pass across the broader regression run (six existing scenarios) and a corrected focused management rerun (2/2). The broader run exposed a hidden-disclosure test locator issue; this was corrected without changing authorization. Full results and the earlier server-action validation fix are recorded in DEVELOPMENT_LOG.md. Tests use loopback-only database/Auth/Realtime/LiveKit services and isolated fixtures; transactions/fixtures are cleaned up without touching hosted data.

- Unit validation and server-action tests cover forbidden actor/role inputs, required confirmation/reason, duration bounds, React form metadata, Auth requirement and failed RPC feedback.
- `test:channels:management`: normal member/moderator/community owner/platform administrator, cross-community denial, private/posting overrides, voice definition, scope/role protection, restriction expiry, staged-file bypass, defaults/opt-outs, archive/delete/history protection, platform bans, audit grants.
- `test:channels:management:setup`: fresh additive installer, recorded rerun and ambiguous-history refusal inside a rollback transaction.
- Existing communities, messaging, private Realtime, administration, real LiveKit, interactions, threads and navigation suites remain regression coverage.
- Production-build Playwright covers management with two authenticated accounts on desktop/mobile, attachment-control invalidation, restriction/release, denied member management, persisted sends, keyboard/a11y/responsive layout; existing chat/voice scenarios cover preserved behavior.

Remaining limits: physical phone/Safari microphone/background behavior and hosted acceptance are not established by local Chromium tests. Management lists the first 200 active members; use existing member search/admin tools for larger rosters. Permanent media/history purging is intentionally outside channel deletion. Existing reports/evidence retention, appeal procedures and voice worker availability still apply.
