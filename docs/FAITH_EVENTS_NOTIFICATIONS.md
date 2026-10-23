# Phase 10: Faith & Life, events and in-app notifications

This phase uses the existing Supabase project, authenticated private Realtime topics and canonical app URL **https://the-gathering3.vercel.app**. No LiveKit changes or new public Storage buckets are required. Prayer/event creation is limited to active adult community members; requests and events are never public internet content.

## 1. Check migration history first

Run in Supabase → SQL Editor → New query:

```sql
select version,name
from supabase_migrations.schema_migrations
where version like '20261029000%'
order by version;
```

Expected: **four records**, `202610290001` through `202610290004`. If all four exist, skip installation and verify the checks below. A GitHub push/Vercel build does not apply database migrations.

## 2. Install only pending versions

Copy the **entire** [`supabase/phase10-setup.sql`](../supabase/phase10-setup.sql) into a new SQL Editor query and click **Run** as project owner. It requires Phase 9, runs atomically, and safely skips recorded Phase 10 versions. The `pg_advisory_xact_lock` result is normal: it prevents simultaneous setup/reminder jobs and releases automatically at transaction completion.

If existing Phase 10 tables have no migration record, stop and inspect the schema/history. Do not delete tables or guess which versions ran. The preflight makes no destructive repair. A linked Supabase CLI project can use `supabase db push` only after reviewing pending versions and ensuring earlier manual migrations are correctly recorded.

Verify all values are **true**:

```sql
select
 to_regclass('public.prayer_requests') is not null as prayers_exist,
 to_regclass('public.events') is not null as events_exist,
 to_regclass('public.event_rsvps') is not null as rsvps_exist,
 to_regclass('public.notifications') is not null as notifications_exist,
 to_regclass('public.notification_preferences') is not null as preferences_exist,
 to_regprocedure('public.space_command(text,jsonb)') is not null as commands_exist,
 to_regprocedure('public.deliver_event_reminders(integer)') is not null as reminder_job_exists;
```

Recheck all four migration records. Confirm the latest Vercel Production deployment is Ready, then visit `/faith`, `/events` and `/notifications` on the canonical site.

## 3. Faith & Life

1. Join the intended community first; a public community's prayer space still requires active membership.
2. Open **Faith & Life**, select the community and expand **Submit a prayer request**.
3. Choose **Private to moderators** (the default), or **Visible to community members**, accept the kindness/confidentiality guidelines and submit.
4. A private request is readable only by its author and current, unblocked community owners/administrators/moderators. It is not sent to all members, friends, email addresses or push devices. Blocked moderators cannot read it. Ordinary members cannot list/read private requests through either the UI or direct APIs.
5. Add comments or **I am praying for you** encouragement. Private replies inherit the parent's access. Authors can edit visibility/body, mark answered or remove their request; removal clears its body and comments. Already downloaded public text cannot be retroactively recalled.
6. Moderators use **Request controls & sensitive-request moderation** to hide, reopen, mark answered, remove requests or remove comments. Acting on another member's request requires a reason; immutable operational audit rows contain action/reason, not a copy of prayer content. Authors cannot bypass a moderator's hidden state unless they independently hold the required community role.
7. An optional curated public-domain KJV selection rotates by UTC date and is shown only when enabled; no AI-generated request, authored encouragement or fabricated member is seeded. No daily email/push subscription is implied.

## 4. Events

Active community members can create gaming nights, voice hangouts and discussion gatherings. The creator hosts their event; current community moderators/administrators/owners can also manage it. Only those roles may edit/cancel an event. RSVP identity always comes from Supabase Auth.

- Choose a description and one of four locally rendered banner designs; arbitrary remote image URLs are not fetched.
- Enter start/end wall times in the selected **IANA time zone** (for example `America/New_York`). PostgreSQL validates and converts them to UTC. Spring-forward nonexistent times are rejected. Fall-back ambiguous wall times follow PostgreSQL's standard-time interpretation; select an unambiguous time when that distinction matters.
- Events may last up to seven days and start within the next year. Attendees see local times and the host's event time zone. Cancelled/ended events stop accepting RSVPs.
- RSVP Going, Interested, Cannot attend, or withdraw. Only Going RSVPs receive opted-in reminders/updates; individual guest identities are not exposed as a public roster.
- Link a gaming session you host or a permitted voice channel in the same community. Linked resource identifiers are omitted from DTOs for members who cannot access them, and are not selectable as raw event columns. A link/invitation never grants a slot, approval, community role or voice token.
- Edits/cancellations send generic updates only to Going attendees with event updates enabled. Event content is loaded through its current membership/block checks.

## 5. Notification preferences and invitations

Open the bell or `/notifications`. Preferences include friend updates, replies, mentions, community invitations, event reminders/updates, gaming invitations, moderator notices and optional Scripture. Replies/friend updates and scoped moderator notices start enabled. Mentions, invitations, reminders and Scripture start disabled, except previously opted-in event reminder preferences are carried forward.

Notifications contain **fixed generic labels and resource identifiers**, never private prayer text, comment bodies, event descriptions, invitation bearer tokens or private moderator-notice bodies. Opening content performs a fresh authorization check. Preferences and blocks apply to both current display and new delivery. Read acknowledgement can affect only the caller's entries. The existing friend-request notification view remains compatible; the bell counts all permitted in-app updates plus unmuted DM unread messages.

- Replies/mentions are supported in authorized community channels, social posts/comments and prayers. Mentions require opt-in, explicit `@username`, and current access, with at most five unique recipients per content item. Edits do not resend mention notifications.
- Expand **Invitations & moderator notices**. Community staff may invite accepted friends who opt into community invitations. A private token is stored only in an inaccessible operational table; the intended recipient redeems it through the original community membership/ban/block checks.
- Gaming-session hosts may invite eligible accepted friends who opt into gaming invitations. Acceptance opens the session; joining still uses the existing transactional membership, approval, capacity and voice rules.
- A mutual block declines pending targeted invitations in both directions; unblocking does not revive them. Expired, banned, blocked or role-revoked invitations cannot be accepted.
- Community moderators may send a private notice to a current community member who permits moderator notices. The body is fetched separately and is readable only by the recipient; no broad DM-read privilege is granted.

## 6. Enable scheduled in-app reminders

The database job is real and service-only. It creates one in-app reminder per Going attendee and event revision, within one hour before the start. Both the notification preference and existing account event-reminder preference must be enabled. Repeated/concurrent runs deduplicate. Cancelled events, withdrawn RSVPs, blocks, bans and lost community membership suppress reminders.

A scheduler is required; Vercel page requests are not a reliable clock. Choose one:

**GitHub Actions workflow (included, off by default):**

1. Repository → Settings → Secrets and variables → Actions. Add repository secrets `GATHERING_SUPABASE_URL` and `GATHERING_SUPABASE_SECRET_KEY` securely. Never paste the secret into an issue, SQL query or chat.
2. Add repository variable `ENABLE_EVENT_REMINDERS` with value `true`.
3. Open Actions → **In-app event reminders** → Run workflow for a first check.
4. The workflow schedules approximately every five minutes. GitHub may delay scheduled jobs; the reminder window and database deduplication tolerate late/repeated execution.

**Another private scheduler:** run `npm run notifications:reminders -- --hosted` every five minutes with `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY` supplied securely. No unauthenticated public cron endpoint is created. Each pass handles up to 500 eligible RSVPs; use a larger explicit RPC limit (maximum 5,000) or more frequent passes for larger communities.

No email or push is sent. A private, RLS-protected delivery-outbox table establishes a future transport boundary; it starts empty/disabled. Future providers need explicit transport consent, verified destinations, credentials, unsubscribe handling and separate delivery workers before activation.

## 7. Two-account acceptance and automated checks

- Use an ordinary author and a community moderator: submit a private prayer, confirm moderator access, then remove the moderator role and confirm access immediately fails. A different ordinary member must not see the prayer or its comments.
- Reply privately and inspect the recipient's notification page: it must contain a generic update, not any private content. Opt out and verify both old display and new delivery are suppressed.
- Create an event, RSVP Going from another account, enable reminders, run the private reminder job, and confirm one generic reminder. Repeat the job, update/cancel the event, withdraw and block to verify deduplication and access changes.
- Verify unauthorized event updates and cross-account notification reads/acknowledgements fail. Test invitation opt-ins, expiration and original join/voice enforcement.

```sh
npm test
npm run test:spaces
npm run test:spaces:realtime
npm run test:spaces:setup
npm run test:e2e
npm run lint
npm run typecheck
npm run build
npm run test:bundle
```

Fixture/DDL rehearsal scripts refuse non-loopback databases and roll back or remove local fixtures. Hosted migration/deployment acceptance must be performed separately; local success does not claim production SQL has been applied. Existing voice/chat/social/squad maintenance remains required.
