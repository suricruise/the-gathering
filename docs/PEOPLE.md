# Friends, member discovery and private messages

Phase 9 uses the existing Supabase project and private Realtime service. There are no new secrets or Storage buckets to configure. Use the production address **https://the-gathering3.vercel.app**, especially for existing voice/media features.

## Step 1: check before installing

In Supabase → SQL Editor → New query, run this safe read-only check:

```sql
select version, name
from supabase_migrations.schema_migrations
where version like '20261028000%'
order by version;
```

Expected records: **202610280001**, **202610280002**, **202610280003**. If all three are present, go to Step 3. The SQL Editor applies migrations; publishing to GitHub or deploying Vercel alone does not.

## Step 2: apply pending Phase 9 migrations

Open [`supabase/phase9-setup.sql`](../supabase/phase9-setup.sql), copy the **entire file**, paste into a new SQL Editor query and click **Run** as the project owner. This installer is safe to rerun: it skips recorded migrations and applies only pending Phase 9 versions in order. It does not overwrite member data. It requires Phase 8 first.

If it reports **tables exist without a migration record**, stop: do not drop tables, mark versions applied speculatively, or paste individual fragments. Inspect the migration history and actual functions before repairing the record. The script changes nothing when this preflight fails.

For a linked Supabase CLI project, review `supabase migration list` before `supabase db push`. All prior manual baseline migrations must be recorded correctly before using the CLI.

Verify:

```sql
select
 to_regclass('public.friendships') is not null as friendships_exist,
 to_regclass('public.member_privacy') is not null as privacy_exists,
 to_regclass('public.conversations') is not null as conversations_exist,
 to_regclass('public.direct_messages') is not null as messages_exist,
 to_regprocedure('public.people_command(text,jsonb)') is not null as commands_exist,
 to_regprocedure('public.people_topic_allowed(text)') is not null as private_realtime_exists;
```

All six values should be **true**. Recheck the three migration history records from Step 1.

## Step 3: verify Vercel and discoverability

1. Confirm the latest Vercel **Production** deployment is **Ready**.
2. Sign in at `/messages` → **Privacy**. Discovery and online status start **off** for every member; incoming DMs default to **friends only**.
3. To appear in searches, enable **Allow member discovery** and save. Your profile must also be **members** or **public** under `/profile` → profile editing. A private profile stays outside discovery even when its discovery checkbox is enabled.
4. To share online status, enable **Share online status with friends**. Only accepted friends can see it; everyone else sees **Status hidden**. Offline status may take up to 90 seconds after closing a tab. We do not expose last-seen timestamps.
5. Ask a second account to enable discovery too. Under **Discover**, search a username prefix (2–24 letters/numbers/underscores), or choose **Shared interests**. Search is capped and cursor-paginated. Emails are never used or returned.

## Step 4: test with two accounts

1. Send a friend request. The recipient sees a real notification and an incoming request; they can accept or decline. The sender can cancel. Crossing requests never silently accept a friendship.
2. Accept, then choose **Message**. Both accounts open the same private one-to-one conversation.
3. Send messages in both directions. **Live** means an actual private Realtime subscription succeeded. Reconnect/reload and retry without duplicate messages; older history loads in pages of 50. A long offline gap resets to the latest page so an incomplete middle is never presented as continuous history.
4. Open **Conversations**, mute a conversation, and send again. The conversation keeps its unread count, but muted unread messages do not contribute to the bell badge. Counts advance only when the conversation is visible and scrolled to the latest messages. There are no email/push notification claims.
5. Change the recipient's DM policy to **Nobody**. New messages are rejected immediately by the server, including in existing conversations. Participant history remains available until a block/account restriction applies.
6. Report a received message with a reason. The report enters the private operator review queue. Reports are not shared with the sender or ordinary community moderators.
7. Block the other account. Both directions lose friendship, request, discovery, DM history/write and new Realtime subscription access. Shared Squad Up membership/voice separation continues working. Unblocking from **Blocks** restores neither friendships nor squad reservations.
8. Try the conversation URL in a third unrelated account: it must be unavailable. Direct REST reads and private topic subscription attempts are independently protected.

Friends-only Squad Up now requires an **accepted friendship**. Reciprocal social follows alone no longer grant access. Member search and contact privacy do not make private profiles public. Existing public/community feed and channel audiences retain their separate access rules.

## Abuse controls and operations

Server Zod validation rejects identity/role injection, unsupported commands, invalid IDs/cursors, oversized messages and control characters. Database constraints and identity-derived definer commands independently protect direct API calls. Raw client writes/edits/deletes are not granted.

Database budgets bound friend requests to **10/hour**, sends to **30/minute**, username/discovery searches to **30/minute**, presence to **6/minute**, and other operations to **30/minute**. Server actions commit attempt-budget checks before mutations so a rejected command cannot undo all request accounting. Those checks count against the shared control budget, so combined activity can be limited before an individual operation quota is reached. Lists are bounded to 500 friendships, 100 own blocks, 500 conversations, 50 recent notifications, and 20 discovery cards per page. Deploy an edge/WAF policy if additional anonymous/network-level denial-of-service protection is needed; database quotas are authenticated application abuse controls.

Messages are participant-only, not end-to-end encrypted. Trusted operators can review reported evidence with Supabase SQL Editor/service-role access. **Do not grant normal users or community moderators broad DM reads.** A review query should join only reported messages:

```sql
-- Project owner/service operator only. Never expose this as an anonymous API.
select r.id, r.reason, r.status, r.created_at, m.body, m.sender_id
from public.direct_message_reports r
join public.direct_messages m on m.id = r.message_id
where r.status = 'pending'
order by r.created_at
limit 50;
```

Update a reviewed report by its exact UUID, with status `reviewed`, `actioned` or `dismissed`; use the existing account suspension controls where necessary. Community invitations are bearer links, so a block is checked between their issuer and recipient **at redemption**, rather than guessing who may use a shareable link. Blocking does not retroactively remove ordinary shared-community membership or hide previously downloaded content.

No new periodic cleanup service is required: budget rows have fixed `(user,operation)` keys and roll their windows, and account deletion cascades contact data. Existing voice/social/chat/squad maintenance jobs remain required. Configure additional retention policies according to the product's data-retention requirements; no automatic DM retention period is claimed.

## Automated checks

```sh
npm test
npm run test:people
npm run test:people:realtime
npm run test:people:setup
npm run test:e2e
npm run lint
npm run typecheck
npm run build
npm run test:bundle
```

Database, API, concurrency and installer scripts refuse non-loopback databases; test fixtures are rolled back or removed. The real Realtime checks cover denied subscriptions, committed live invalidations, stable retry/reconnect IDs, concurrent opens/retries, block/send races and shared API budgets. Browser tests use two actual authenticated accounts and real private subscriptions on desktop/mobile, plus accessible controls, safe Markdown, mute, report and privacy flows. Hosted acceptance must be performed separately; local success is not a claim that production SQL was applied.

## Recorded validation

- 185 unit/server/component tests, lint, typecheck, production build and client-secret scan passed.
- 25 PostgreSQL authorization/privacy/spam checks, eight real private Realtime/API/concurrency checks and four installer rehearsal cases passed.
- Production regression: all 58 earlier desktop/mobile scenarios passed. The two new contact scenarios caught a privacy-tab selection race, which was fixed; the final targeted production rerun passed both desktop and mobile flows (30.3 seconds). All 60 unique scenarios are therefore covered across the regression and final rerun; no checks were disabled or skipped.
- Prior database, API, concurrent capacity, installer and LiveKit checks also passed. These are local production-build results; hosted migrations/live acceptance are operator steps above.
