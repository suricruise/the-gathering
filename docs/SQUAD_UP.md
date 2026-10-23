# Phase 8: Squad Up

## Production setup, step by step

Apply this phase after the completed Phase 7 social migrations. It reuses your current Supabase project and LiveKit project, keys, and always-on voice enforcement worker. No new API key is required.

1. Open **Supabase → SQL Editor → New query**.
2. Open [`supabase/phase8-setup.sql`](../supabase/phase8-setup.sql), click **Raw**, and copy the **entire file** into that query. Click **Run once**. This transaction installs four versioned migrations and records their versions. Do not rerun earlier phase installers.
3. Run this read-only check; every result should be **true**:

   ```sql
   select
     to_regclass('public.gaming_sessions') is not null as sessions_exist,
     to_regclass('public.gaming_session_members') is not null as members_exist,
     to_regclass('public.game_platforms') is not null as game_platforms_exist,
     to_regprocedure('public.squad_command(text,jsonb)') is not null as commands_exist,
     to_regprocedure('private.community_voice_admit(uuid)') is not null as community_voice_preserved,
     to_regprocedure('public.squad_cleanup(integer)') is not null as cleanup_exists;
   ```

4. In **Vercel → Deployments**, confirm the Phase 8 commit is **Ready** for **Production**. Open **https://the-gathering3.vercel.app/squad-up**, using the stable production address. Keep `APP_URL=https://the-gathering3.vercel.app`; preview deployment addresses do not pass the voice/upload origin check.
5. Create a small session, use a second member account to request/join, approve it if required, then open the session's voice panel. The existing voice worker must be healthy. Pending members cannot obtain voice tokens. A scheduled room normally opens 15 minutes before its start.
6. Schedule a private hourly job to run `npm run squad:cleanup -- --hosted` from this repository, with `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY` supplied securely. Each run processes up to 500 session records, removes invalid reservations, expires ended groups and purges retention-aged data. For a larger installation, run it more frequently. Request-time expiration and voice rejection work even if this job has not run.

If setup says **“Squad Up tables already exist”**, stop and check history instead of rerunning or deleting tables:

```sql
select version, name from supabase_migrations.schema_migrations
where version like '20261027000%' order by version;
```

Expected: **four rows**, `202610270001` through `202610270004`. Apply only missing versioned migration files, in order. A linked CLI project can use `supabase db push` after reviewing its pending migrations. Do not edit already applied migration files. No hosted migration is performed by a GitHub push or a Vercel build.

## Member experience

- `/squad-up`: real session cards; game, compatible platform, available-place, time, style and community filters; **My sessions** and **Community game nights** listings; stable 20-row cursor pagination; explicit refresh and loading/empty/error states.
- **Create a session**: game directory, host platform, supported cross-play preference, casual/competitive play, 2–50 total players, title/description, optional scheduled start, audience and host approval. Times entered on the device are converted to UTC; displays use UTC explicitly. The host reserves one place. Creation uses a stable retry ID.
- `/squad-up/:id`: scoped details, platform selection, request/join, withdraw, host approval/decline/removal/cancellation, reserved-player roster and the actual LiveKit group voice panel. A shareable page URL grants no additional access.
- Group voice stays connected through Next.js navigation. Its persistent status-bar link returns to the session. Reloading or closing the browser disconnects normally. Cancellation, removal, blocking, expiration and loss of audience eligibility revoke future tokens and refreshes; the existing worker removes stale provider participants/rooms.
- **Blocked members**: private list and unblocking. Blocks govern Squad Up discovery, membership and group voice. Blocking a host hides their sessions; shared squads withdraw the blocker, or remove the target when the blocker hosts. Unblocking does not restore a reservation. Phase 9 extends this same block list to friendships, private messages, profile/member discovery and invitation redemption. Community channel and feed audiences retain their existing permissions.

No sessions, hosts, memberships or voice connections are simulated or seeded. Counts represent reserved accepted places, not game presence or currently connected voice participants. Refresh to see other members' reservations; joining always rechecks the database. Expiration is enforced by the database clock after row-lock waits and also reflected on open cards/details.

## Audience and privacy

**Public** means all verified adult members, not anonymous internet users. **Friends-only** uses accepted friendships after Phase 9. Social follows alone do not grant entry. **Community-only** requires active membership in that community, including for public/discoverable communities. The host must stay eligible too. Only community moderators/administrators/owners can label a community session a **game night**.

Blocks work in both directions for joining and voice, including against existing accepted participants. Global bans, missing adult identity evidence, incomplete onboarding, deleted identities and community bans are checked on the server. Hosts cannot choose user IDs, roles, room names, token grants or arbitrary expiry times through client form fields. Host approval/removal controls do not alter community roles.

A private profile or disabled **Show gaming activity** setting hides host identification on discovery cards. Identified discovery hosts require both an appropriately visible profile and that activity preference. Creating a session explicitly shares its chosen title, game, description and schedule with its audience. Joining explicitly shares the display name with the host and accepted group; pending requests are shown only to their author and host. Outsiders receive aggregate reserved-place counts, never a roster. Avatar access retains the existing profile-visibility policy. Host IDs/voice epochs are not selectable through ordinary raw session-table reads. User preferences, emails, DOB and server credentials never appear in session DTOs.

Audience changes (unfollow, bans or lost community membership) revoke access immediately on the next request. Existing reservations remain capacity-counted until withdrawal, host removal or maintenance, so renewed eligibility cannot overbook a group. Cleanup removes invalid accepted/pending reservations. Missing and inaccessible session URLs share the same unavailable page.

## Games and compatibility

`game_platforms` connects the existing game/platform catalogs. Matching platform always qualifies; cross-play additionally requires matching non-null compatibility pools for that game. Valorant PC and console pools are separate; unsupported cross-play cannot be enabled. Joining records the member's selected compatible platform, which the server validates. A platform filter includes compatible cross-play sessions.

Directory entries are operator-maintained metadata, not detection of a player's device, game ownership or provider account. Members must still check editions, generations, regions and the game's current service availability. Minecraft's shared pool refers to compatible Bedrock editions, not Java-to-console play. Operators can maintain the mappings in SQL Editor as games change; no member can write the catalog.

## Configurable rules and cleanup

The operator-only singleton has bounded defaults:

| Setting | Default | Accepted range |
| --- | --- | --- |
| `duration_minutes` | 360 | 30–1440 |
| `max_schedule_days` | 30 | 1–90 |
| `max_active_per_host` | 5 | 1–20 |
| `voice_early_minutes` | 15 | 0–60 |
| `retention_days` | 30 | 1–365 |

Example operator update:

```sql
update private.squad_config
set duration_minutes=360, max_schedule_days=30,
    max_active_per_host=5, voice_early_minutes=15, retention_days=30
where id=true;
```

Expiry is calculated at creation from the scheduled start (or current time) plus the configured duration; changing duration/scheduling rules affects new sessions. The voice opening window and retention setting are read from current configuration. Retention purges ended sessions and old private audit records; live group enforcement does not depend on cron. Account deletion cascades owned sessions/memberships and the worker removes obsolete group rooms. There is no recording by default.

## Authorization and concurrency

Eight tables enable RLS: `game_platforms`, `gaming_sessions`, `gaming_session_members`, `member_blocks`, plus private configuration, budgets, audit and group voice reservations. Ordinary table writes and private operational reads are denied. Security-definer RPCs have fixed search paths and explicit grants. Members cannot bypass host approval by inserting a membership or invoking an internal community voice function.

Reservations lock their session row. Composite membership keys prevent duplicates; approvals and joins use the same capacity check. Ordered user advisory locks serialize blocks with joins/approvals across shared sessions. The database uses actual wall-clock time after acquiring locks, so a request that waited past expiry is rejected. HTTP attempt budgets commit separately from mutation transactions: 5 creation, 30 joining/withdrawal/host actions and 20 blocking operations per minute, with separate direct-RPC budgets. Hosts have a configurable active-session cap and approval queues cap at 50 pending requests.

Group voice uses private reservations separate from community channels. The public voice RPCs dispatch to the original, now private, community functions or to group-specific authorization. Both share the same authenticated identity lock, preventing concurrent community/group token requests from reserving two voice rooms. Tokens retain microphone-only, room-scoped, 60-second minimum grants. The worker's service-only snapshot combines both kinds of authorized rooms; no channel permission is broadened. The existing two-second enforcement interval and 15-second health gate remain required infrastructure.

## Verification

Use the loopback-only stack and fixtures:

```sh
npm run db:test-stack
npm run test:gateway # separate terminal
npm run voice:local
npm run voice:worker # separate terminal with local credentials
npm run test:squads
npm run test:squads:setup
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
npm run test:bundle
```

Authorization checks cover audiences, privacy, ownership, platform pools, pending/full groups, cancellations, actual expiry, configuration, retention and voice eligibility. Separate committed concurrent connections race eight joins, approvals, cancellation, expiration while waiting, blocks and cross-resource voice requests. The installer is rehearsed against a pre-Phase-8 state inside a rolled-back local transaction. Browser flows use two real authenticated accounts and the real LiveKit service, exercise approval/join/withdrawal/voice/cancellation and private scheduled game nights, and check responsive layouts, keyboard navigation and axe accessibility. Prior authentication, community, messaging, social and actual audio tests remain in the suite. Hosted acceptance still requires the production migration and infrastructure.
