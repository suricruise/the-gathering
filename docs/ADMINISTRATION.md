# Phase 11 — Administration and moderation

The real dashboard is `/admin`. Members can report concerns at `/reports` (chat messages, social posts, members and gaming sessions), and submit appeals at `/appeals`. Message, member and session screens link directly to a prefilled report form; existing social/DM report forms feed the same protected central queue. Published announcements appear on Home. No usage metrics, reports or accounts are fabricated.

## 1. Install the pending migrations

Use your existing Supabase project. Phase 10 must already be installed. First inspect history in **SQL Editor → New query**:

```sql
select version, name
from supabase_migrations.schema_migrations
where version like '20261030000%'
order by version;
```

If the history schema has never been used, skip this preflight and use the installer. There are five Phase 11 versions: `202610300001` through `202610300005`.

Open [`supabase/phase11-setup.sql`](../supabase/phase11-setup.sql), choose **Raw**, copy the **entire file**, paste it into a new Supabase SQL query and click **Run**. It installs only pending versions inside one transaction. Seeing `pg_advisory_xact_lock` is normal. Rerunning this installer safely skips recorded versions; do not repeatedly paste individual migrations. If tables exist without history, it stops without deleting data. Inspect the actual schema/history before recording a version; never drop production tables just to make setup run.

Verify:

```sql
select
 to_regclass('private.platform_roles') is not null as platform_roles_exist,
 to_regclass('private.moderation_cases') is not null as protected_cases_exist,
 to_regclass('private.admin_audit') is not null as audit_exists,
 to_regclass('public.moderation_appeals') is not null as appeals_exist,
 to_regclass('public.site_announcements') is not null as announcements_exist,
 to_regclass('public.community_settings') is not null as settings_exist,
 to_regprocedure('public.admin_command(text,jsonb)') is not null as commands_exist;
```

All seven should be `true`. The remaining private tables store retention policy and protected reported-media references.

## 2. Set the first platform owner securely

Community ownership does **not** make you platform owner. Sign up, verify email and complete onboarding first. In Supabase SQL Editor, replace `YOUR_USERNAME` below with your exact app username, then run the whole transaction. This operation is for a trusted database operator only; it is never exposed as a public app endpoint.

```sql
begin;
select pg_advisory_xact_lock(20261030);
do $$
declare selected_user uuid; existing_owner uuid;
begin
 select id into selected_user from public.profiles where username='YOUR_USERNAME';
 if selected_user is null or not private.squad_live(selected_user) then
  raise exception 'Use an existing verified, onboarded, active member username.';
 end if;
 select user_id into existing_owner from private.platform_roles where role='owner';
 if existing_owner is not null and existing_owner<>selected_user then
  raise exception 'An owner already exists. Use a separately reviewed operator ownership-transfer procedure.';
 end if;
 insert into private.platform_roles(user_id,role) values(selected_user,'owner')
 on conflict(user_id) do update set role='owner';
 insert into private.admin_audit(actor_id,target_id,action,reason)
 values(selected_user,selected_user,'owner.bootstrap','Trusted operator verified initial platform ownership');
end $$;
commit;
```

Open **https://the-gathering3.vercel.app/admin** in your usual browser. Refresh; the badge should say **Platform owner**. In **Members**, search by username, expand **Platform role**, choose administrator/moderator/member and enter a reason. You cannot change your own role, create another owner from the client or demote a platform peer/superior. Owner transfer is intentionally an operator procedure. Role changes do not depend on JWT metadata or signing out/in.

## 3. Confirm the production deployment

In Vercel, open **the-gathering3 → Deployments** and confirm the Phase 11 commit is **Ready** in Production. If automatic deployment does not appear, create a deployment using the exact published commit. Keep `APP_URL=https://the-gathering3.vercel.app`. No new browser secrets or service keys are required for ordinary admin actions. These use the authenticated Supabase client and database authorization, not a service-role bypass.

## Role boundaries

| Role | Scope and permissions |
| --- | --- |
| Platform owner | Platform administration plus appointing/removing platform administrators and moderators; no client owner transfer/self-role changes. |
| Platform administrator | Account suspension/ban/restoration for lower platform roles; communities, channels/access, announcements, retention, reports and appeals. Cannot appoint platform staff. |
| Platform moderator | Scoped usage metrics, reported-item evidence, report decisions, event visibility and voice removal. Cannot grant roles, suspend platform accounts or change platform configuration. |
| Community owner/administrator | Their community's settings, channels/access, announcements, lower community roles and members; reports and appeal review. Existing community owner-transfer controls remain. |
| Community moderator | Their community's reported content, lower-ranked members, event visibility and voice removal. No role grants/settings changes or DM evidence. |
| Standard member | Own reports/appeals, published audience-authorized announcements; no admin records/actions. |

All administrative mutations acquire the shared authorization lock and validate live permissions inside the same database transaction. Existing community role writes share that lock. Concurrent revocation wins before a waiting action rechecks privileges. Platform roles are independent private rows; community roles cannot grant platform access. User status changes set Supabase Auth's authoritative `banned_until`, so stale JWTs fail database membership and voice checks too. Bans are indefinite; suspensions are 1–365 days. A community ban never becomes a platform ban.

## Reports, evidence and appeals

Reports target an accessible existing object, not client-supplied evidence. The database captures at most 5,000 characters and up to four attached files of the reported item. Reported DMs are platform-staff-only and contain only that message, never conversation history. No email directory, public file URL, authentication secret or broad private-prayer access is provided. Reported photos/files/clips retain private storage references; an authenticated, scoped, audited server endpoint streams only that reported item. Non-image files download as attachments rather than execute inline. In the central queue, reviewers cannot decide their own reports or cases about themselves. Community peers/superiors cannot be actioned through the central queue. Moderated messages/media lose member access while the bounded snapshot remains available to authorized reviewers until expiry.

The dashboard requires a concise reason for every change and logs actor, target, scope and time. Queue reads are audited. Existing community, channel-message, social and faith/event audit surfaces feed central history too; legacy actions retain their existing action/reason metadata. Audit records are append-only to clients and have no message/prayer bodies. Keep reasons free of unnecessary personal information.

Members can submit one pending appeal at a time. Administrators review decisions in **Appeals**; community administrators can review cases within their own scope, while platform administrators handle account/DM cases. Acceptance records the decision; restoration is a separate explicit audited action. Members unable to authenticate during suspension need your verified operator support process: a platform administrator can use **Members → Lodge verified external appeal** after checking identity independently. No anonymous account-recovery or email support service is invented by this release. Establish and publish your support contact before public launch.

## Community and room controls

Choose a community using **Administrative scope**. Channel order is its numeric position; names remain unique within the community. Access overrides apply to member/moderator/administrator roles, while existing per-member overrides remain available in community controls. Explicit deny wins under existing rules; community administrators retain management access. Disabling a channel blocks raw RLS reads, posting, subscriptions and voice admission. Archival blocks community access, invitations, prayer/event access and linked community gaming sessions. Archived records remain available to authorized administrators for restoration.

Voice removal deletes the admission and applies a 15-minute room suspension. The existing independent LiveKit enforcement worker removes that identity from actual media rooms on its next pass (normally two seconds). Disabled/archived rooms and banned accounts are filtered from enforcement snapshots. The worker must remain healthy; this does not replace LiveKit with simulated audio.

Community settings provide guidelines and creation gates for prayer requests/events, enforced on legacy RPC callers too. Event hiding is moderation-controlled, so ordinary host edits cannot restore visibility. Announcements can be drafts, expire automatically and respect community membership/archive rules. They are displayed in-app, without unsolicited email/push notifications.

## Retention and maintenance

Evidence defaults to **90 days**, configurable **7–365** by platform administrators. Expired evidence/report explanations are concealed immediately on reads. Shortening policy also shortens existing deadlines; increasing it never recovers or extends existing snapshots. Schedule this private, service-authenticated job **daily** to physically erase expired text/media references and clear resolved appeal details older than a year:

```sh
npm run moderation:cleanup -- --hosted
```

Use server-only `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` through your scheduler's secret settings. Never expose a public unauthenticated cleanup endpoint. The job logs counts only. Continue scheduling `chat:cleanup` and `social:cleanup`: their database queries respect active evidence holds, then remove deleted/orphaned files after the hold expires. Published original media remains governed by its normal audience rather than being deleted just because a report expires. Existing reports imported during migration can preserve only content/files still available at that moment. Routine privacy blocks apply to ordinary member features; authorized moderation of a voluntarily reported item does not allow the subject to hide that evidence by blocking the reviewer. Service backups and storage retention need an operator policy as well; this application job does not erase provider backups. Minimal audit history is retained for accountability; export/retention of that metadata is an operator policy, not unrestricted personal-data storage.

An optional `.github/workflows/moderation-retention.yml` runs this maintenance daily. Set repository secrets `GATHERING_SUPABASE_URL` and `GATHERING_SUPABASE_SECRET_KEY`, then set repository variable `ENABLE_MODERATION_CLEANUP=true`. It stays disabled on its schedule until configured; manual dispatch also requires those secrets.

## Verification

```sh
npm test
npm run test:admin
npm run test:admin:api
npm run test:admin:setup
npm run test:e2e
npm run lint
npm run typecheck
npm run build
npm run test:bundle
```

Authorization tests use actual PostgreSQL roles and roll back fixtures. API tests exercise anonymous/member rejection, private evidence denial and concurrent role revocation with a stale session. Exact installer rehearsals cover fresh install, rerun, pending-only completion and ambiguous-history refusal. Desktop/mobile browsers exercise real metrics, community/channel creation/disable, reported evidence, removal, appeals, audit history and revocation. Existing authentication, chat, social, squads, friends, faith/events and LiveKit suites remain part of regression verification. Fixture/rehearsal scripts refuse non-loopback projects. Hosted activation must be verified separately.

## Community deletion and directory order

The Communities tab adds confirmed permanent deletion and platform-controlled display positions. See [community management](COMMUNITY_MANAGEMENT.md) for setup and scope rules.
