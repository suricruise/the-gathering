# Faith Circles foundation

“Grow in the Word. Grow Together.”

## What is available

Open **Faith Circles** in navigation (mobile: More). The landing page has approved featured study references, paginated Circle discovery, My Circles, current-study shortcuts, scheduled linked study Hangouts and prayer access. Each Circle is an explicit association with one existing community. Covers, membership, roles, channel permissions, private prayers and actual LiveKit controls remain owned by existing services.

Public Circles may be joined using the existing community command. Discoverable Circles require an invitation; private Circles are invisible until membership exists. Joining does not grant private-channel overrides. Leaving a Circle leaves its underlying community; the button uses the existing community workflow. Owners must transfer ownership before leaving.

## Database installation — pending production approval

The versioned additive migration is `202611170001_faith_circles_foundation.sql`. The single-purpose `supabase/faith-circles-setup.sql` applies just this migration and records its version. Recorded reruns skip; unrecorded pre-existing objects cause a refusal requiring inspection. Do not rerun old phase installers, reset tables or mark ambiguous migrations applied.

Back up first and inspect migration history before any hosted installation. No hosted migration or deployment was performed for this task. No automatic community creation, conversion or seed runs.

## Register an existing Circle

Initial registration is a trusted database-operator task, not a client-side publishing permission. Confirm the proposed leader, community, discussion and voice channels with the community owner before running SQL. Use the real username and existing community slug below; do not paste secrets or change platform roles.

```sql
begin;
do $$
declare leader uuid; community uuid; discussion uuid; hangout uuid;
begin
 select p.id into leader from public.profiles p join auth.users u on u.id=p.id
 where p.username='REPLACE_WITH_LEADER_USERNAME'
 and private.squad_live(p.id);
 select id into community from public.communities
 where slug='REPLACE_WITH_EXISTING_COMMUNITY_SLUG' and not archived;
 if leader is null or community is null or private.space_rank(leader,community)<10 then
  raise exception 'Use an existing verified, onboarded, active community member and community.';
 end if;
 select id into discussion from public.channels
 where community_id=community and name='REPLACE_WITH_TEXT_CHANNEL_NAME'
 and kind='text' and not disabled;
 select id into hangout from public.channels
 where community_id=community and name='REPLACE_WITH_VOICE_CHANNEL_NAME'
 and kind='voice' and not disabled;
 -- Links are optional, but reject misspellings when configuring both here.
 if discussion is null or hangout is null then
  raise exception 'Choose existing permitted text and voice channels.';
 end if;
 insert into private.faith_circle_leaders(user_id,approved) values(leader,true)
 on conflict(user_id) do update set approved=true;
 insert into public.faith_circles(community_id,leader_id,discussion_channel_id,
 hangout_channel_id,study_title,passage_reference,schedule_note,featured)
 values(community,leader,discussion,hangout,'REPLACE_WITH_STUDY_TITLE',
 'John 15:1-8','REPLACE_WITH_SCHEDULE_NOTE',false)
 on conflict(community_id) do update set leader_id=excluded.leader_id,
 discussion_channel_id=excluded.discussion_channel_id,
 hangout_channel_id=excluded.hangout_channel_id,
 study_title=excluded.study_title,passage_reference=excluded.passage_reference,
 schedule_note=excluded.schedule_note,enabled=true;
end $$;
commit;
```

The reference above is an example passage identifier, not a supplied study or Bible translation. Enter your own approved overview metadata. `featured=true` publishes a reference in the featured listing only to viewers authorized for the community. Study titles, reference and schedule are listing information for public/discoverable Circles; never put personal prayer details there. References currently accept English book names and a single chapter/verse range.

Leader approval does not grant community moderation or platform administration. Approval and association changes write existing protected audit logs. SQL-editor operations without an authenticated actor record a null/system actor; operator attribution must also be retained in the database provider's access logs. Self-service leader publishing with verified actor attribution remains a later stage.

## Pause, revoke and recovery

Set `public.faith_circles.enabled=false` for the selected community to pause a Circle without removing its community, messages or memberships. Revoke a leader with `private.faith_circle_leaders.approved=false`; reads immediately hide that leader’s Circles. A leader who loses active membership or whose account is deleted cannot continue exposing a Circle. Account deletion also disables its association and preserves the community; existing ownership-transfer requirements still apply.

For an application rollback, revert app changes and leave the additive metadata tables in place. Do not drop community, Auth, channel, messaging or voice objects. Back up new Circle metadata before any separately reviewed schema rollback.

## Privacy and operational limits

- Authentication identity comes from Supabase Auth; no client actor/role input.
- Raw metadata and approvals have RLS plus no ordinary client grants. Bounded authenticated RPCs return a safe projection.
- Existing block, ban, suspension, channel, profile and event authorization applies on each read. No new Realtime topics or voice-token grants are introduced.
- Public metadata never includes restricted discussion/voice IDs or private leader profile information. Joined users see only permitted channel links.
- Existing scoped Faith & Life offers community or private-to-moderators prayers. No prayer contents are copied into Circle cards, progress or notifications.
- My Circles and upcoming Hangouts currently use the first 12 joined Circles; Explore is cursor-paginated. Featured shows up to 6. Scheduled Hangouts must be existing scheduled events linked to the configured voice room; this is not a claim that a room is live.
- No new Bible API/key or translation license is required. Only references are supplied; members consult their own Bible.
- No lesson editor, seven-step guided session, private answers, saved study progress, automated study reminders or browser leader-publishing controls exist yet. Their proposed data/privacy model is in `FAITH_CIRCLES_BLUEPRINT.md`.
- Physical-device audio and hosted deployment configuration still require release acceptance. The persistent existing voice provider is unchanged.

## Validation commands

Local stack only: `node scripts/test-faith-circles.mjs` (transactional fixtures rolled back), `npm run test:communities`, `npm run test:messaging`, `npm run test:spaces`.

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:bundle`; with a verified isolated local environment and server: `npx playwright test e2e/faith-circles.spec.ts e2e/premium-community.spec.ts`.

The browser scenario creates actual local authenticated accounts, joins/leaves a real fixture community, opens its existing live chat, checks private Circle denial, scoped prayer navigation, responsive overflow and accessibility. It does not pretend to test future guided sessions or actual microphone audio.

## Executed validation (2026-10-26)

- Lint, TypeScript and optimized production build passed; production server started successfully.
- 376 unit tests in 66 files passed, including authentication/DTO/pagination/error handling and joined-Circle navigation context.
- 20 new transactional PostgreSQL checks passed: private/nonmember denials, leader approval/revocation, mutual blocks, bans/suspension, private channel inheritance, invalid associations, raw-table/grant denial, safe public projection, cursors, scheduled event access, audit records, account deletion and read throttling.
- Three installer checks passed: exact migration parity, recorded rerun skips, ambiguous state refuses reset. The migration was installed successfully on the isolated local stack; no hosted installation was attempted.
- Existing community (32), messaging (24) and Spaces/prayer/event/notification (26) database checks passed.
- Faith Circle desktop/mobile browser scenarios passed after the scheduled-event RPC fix: real accounts, existing join/leave commands, live chat access, private Circle denial, prayer navigation, permitted scheduled events, screenshots, no horizontal overflow and zero targeted axe WCAG A/AA violations on the Circle detail page.
- Existing premium community desktop/mobile browser scenarios passed (overview activity, roles, private channels and real chat).
- Existing desktop/mobile LiveKit scenarios passed with actual decoded audio between two authenticated local browsers, navigation, mute, reconnect and revocation. Chromium uses synthetic microphone input; physical devices, Safari and hardware audio were not tested.
- Client-bundle server-secret check passed.

Early test runs caught invalid fixture interests/statuses, a stale chat locator, a missing server-only test boundary mock and a direct event-table read incompatible with existing access restrictions. These were fixed and affected checks rerun; authorization was not weakened.

Screenshots from actual local test fixtures are under `docs/qa/faith-circles/`. They contain no production member or community data. Screenshot review supplements automated overflow/axe tests; it is not full accessibility certification or a pixel-regression suite.
