# Phase 6: real LiveKit voice

Faith Circles live study scheduling uses the existing voice system: see [Study Hangouts](FAITH_STUDY_HANGOUTS.md) for the separate `202611220001` update and privacy/operating instructions.

Voice uses actual WebRTC media through LiveKit, not simulated participants or a Supabase audio transport. Persistent rooms are existing community channels of kind `voice`. Text messaging, authentication, and community controls retain their existing services.

## Production setup: Supabase, LiveKit, Vercel, and one worker

1. Finish the Phase 5 database setup first. In Supabase SQL Editor, paste the **entire** [`supabase/phase6-setup.sql`](../supabase/phase6-setup.sql) file and click **Run once**. This applies three versioned migrations in one transaction and records migration history. Do not rerun Phase 3–5 installers. If voice tables already exist, inspect migration history and apply only missing versioned migrations; never delete live data to rerun the installer. CLI operators with reconciled migration history can instead run `supabase db push`.
2. Create a [LiveKit Cloud](https://cloud.livekit.io/) project, or deploy a supported LiveKit server with trusted TLS, reachable WebRTC UDP/TCP ports and TURN for restrictive networks. LiveKit is an additional service; Supabase/Vercel do not host the media server. Keep recordings, automatic egress and agent dispatch disabled in the LiveKit project. No egress or recording is requested by the application.
3. In Vercel **Settings → Environment Variables**, add **server-only** `LIVEKIT_URL` (the project's `wss://…livekit.cloud` URL), `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Keep the existing Supabase variables and production `APP_URL`. The secret must have at least 32 characters. Never prefix these credentials with `NEXT_PUBLIC` or paste secrets into chat. The URL and a member's short-lived token are returned only after authorization.
4. Deploy an **always-on private worker**, for example as a Railway/Render background worker, Fly.io process, or supervised container. Inject `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` securely. Use Node 22.12+ (Node 24 recommended), `npm ci`, and start `npm run voice:worker -- --hosted`. Alternatively build the supplied `Dockerfile.voice-worker`. The worker needs outbound HTTPS to Supabase and LiveKit, no public inbound endpoint. Never put a service key in browser code.
5. Enable automatic restarts and monitoring for the worker. It reconciles the real provider participants against current database authorization every **two seconds**, serially. New admissions fail closed if no successful enforcement pass occurred in **15 seconds**. A successful snapshot, provider reconciliation, and heartbeat are all required. Vercel request handlers or a minute-based Cron are **not** replacements for this worker.
6. Redeploy the current GitHub `main` application on Vercel. Under **Voice lounge**, choose a room, then **Join with microphone** or **Join muted**. Grant microphone permission when prompted. If the browser blocks playback, click **Enable voice audio playback**. Join muted does not request microphone access until unmuting.
7. Use two verified accounts on **two physical devices**, with headphones, to complete the acceptance check below. Real device microphones, acoustic output and your production TURN/network path require this final deployment check; automated browser media tests cannot certify those hardware/network paths.

### Check setup without changing data

In Supabase SQL Editor, these read-only queries confirm installation and worker health:

```sql
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20261025000%'
ORDER BY version;
-- Expect 202610250001, 202610250002, 202610250003.

SELECT checked_at,
       checked_at > now() - interval '15 seconds' AS healthy
FROM private.voice_worker;
-- Expect healthy = true while the worker is running successfully.
```

New worker logs identify `stage=supabase-snapshot`, `stage=livekit-list-rooms` (or another LiveKit operation), or `stage=supabase-heartbeat`, with only allowlisted codes/statuses. Supabase failures require checking the worker's project URL, current server-only key and migrations. LiveKit authentication failures require matching the URL/key/secret to the same project. A **Voice enforcement healthy** recovery message confirms a complete pass. In Render, select live/recent logs after redeploying; a fixed older time range will not show the new diagnostics.

A startup log alone does not prove enforcement is healthy. If `healthy` is false, fix the worker's credentials/connectivity/migrations before joining rooms. If a session is abandoned without a leave acknowledgement, its reservation expires after 120 seconds; repeated joining does not bypass that reservation.

### Example: a Render background worker

1. In Render, choose **New → Background Worker** and connect `suricruise/the-gathering`, branch `main`.
2. Choose the **Node** runtime. Set build command to `npm ci` and start command to `npm run voice:worker -- --hosted`.
3. Add the five environment variables from step 4 above using Render's secure environment settings. Use the **same Supabase and LiveKit projects as Vercel**. Do not put their values in a repository file.
4. Deploy it and confirm the log says **Voice enforcement worker started**. Repeated **Voice enforcement failed** means a missing migration, invalid credentials, or provider/database connectivity issue; fix that before testing joins.
5. Keep this worker running continuously with automatic restarts. After it is healthy, redeploy Vercel and join a room. The worker is a separate service from the Vercel website.

An existing `the-gathering` community receives The Lounge, Squad Up, Minecraft, Valorant and Rocket League room definitions idempotently. No identities, joins, occupancy or recordings are invented. Owners/administrators can create additional game-specific and private voice channels through community channel settings. Approved community creators can create their private communities and grant `view`/`connect` permissions. Existing room limits default to 12 (range 2–50).

## Authorization and lifecycle

- `POST /api/voice/token` accepts **only** a channel UUID, checks trusted Origin, a bounded actual body, verified `Supabase.auth.getUser()`, and a separately committed per-user HTTP budget. The security-definer admission RPC checks live identity eligibility, active membership, private channel grants/denials, room suspensions/lock, worker health and capacity under database locks. Client identities, names, room names, roles and grants are never accepted.
- Identity is the stable `auth.users.id`. The server derives display name, a private session ticket and an opaque room name from the channel and room epoch. Initial join tokens last **60 seconds**, authorize one room, permit subscription and microphone-only publication, and deny data publication, camera, screen share, room administration, room creation grants, own metadata updates and recording. API secrets never reach the client. The client token is held in memory.
- Provider tokens authorize an existing connection; expiration alone does **not** disconnect participants. LiveKit can refresh transport tokens for established connections with its provider-defined lifetime; the original 60-second expiry is not a guarantee that all refreshed credentials expire then. The independent worker uses its service-only snapshot to remove invalid identities/tickets through LiveKit's server SDK, including bans, suspended accounts, lost grants, membership changes, deleted channels/users, expired sessions and moderator removals. Removal requests include `revokeTokenTs`; token-revocation guarantees vary with provider/server version. On self-hosted versions that do not retain token revocations, a stolen unexpired token can briefly reconnect before the next reconciliation. Keep the worker healthy, use short tokens and a current LiveKit service. This is eventual server enforcement (normally one polling interval plus provider latency), not instantaneous synchronous authorization of every media packet.
- Sessions are limited to one active room per identity. Serialized reservations and LiveKit's own `maxParticipants` both enforce capacity. Unacknowledged reservations expire after 120 seconds. The authorized client refreshes its reservation every five seconds. Failed attempts, including denied room access, consume the separate HTTP budget: 10 token attempts/minute, 20 control attempts/minute, 60 session/leave requests/minute; database commands have additional limits. Budget rows are pruned after one day.
- The worker updates its heartbeat only after all provider operations succeed. A worker outage prevents new admissions after 15 seconds; the application disconnects existing sessions after three unsuccessful five-second checks. Browser checks are defense in depth. Existing hostile provider connections require a functioning server worker: monitor it and stop rooms/revoke credentials in the provider console during a sustained enforcement outage. This operational dependency must not be omitted at deployment.
- Moderator removal independently verifies channel access and community rank, rejects self/peer/superior removal, audits the action, and creates a 15-minute room-specific suspension before requesting provider removal. Failed provider removal remains denied in the database and is retried by the worker. Only owners/administrators can change limits or lock rooms. Saving room settings rotates the room epoch, disconnects everyone and requires explicit rejoin. Community bans remain stronger than a room suspension.
- Private user sessions, worker state, suspension records and budgets have RLS enabled and no ordinary direct access. Only service-role RPCs expose enforcement data. The public settings table exposes rows only through channel connect permission and has no client write grants. No webhook or public maintenance endpoint is needed.
- The persistent member layout owns one LiveKit `Room` and official React room context/audio renderer. Client navigation retains its connection. Leaving, member-layout unmount and page closure release media and subscriptions; best-effort leave and reservation expiry clean up abandoned sessions. SDK reconnection states reflect the transport; there is no simulated success or background automatic rejoin after moderation.
- Deafen mutes the local microphone and remote audio subscriptions, restoring the previous microphone preference on undeafen. Device selection uses the official SDK hooks; browsers without output selection use system audio routing. Mobile OS backgrounding can suspend WebRTC; foreground reconnect or explicitly rejoin if disconnected.

## Local real-service verification

```sh
npm ci
npm run db:test-stack
npm run test:gateway
# In another terminal:
npm run voice:local
# Use ignored local environment values, not injected hosted variables:
node --env-file=.env.local scripts/voice-worker.mjs
# In a third terminal (gateway and worker remain running):
npm run test:voice
npm run test:voice:setup
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run build
npm run test:bundle
```

If your shell already has hosted Supabase variables, unset them before loading `.env.local`; Node's `--env-file` intentionally does not override existing environment variables. The local worker refuses non-loopback projects without `--hosted`. Browser/database fixture scripts also refuse hosted projects. Never add `--hosted` to a test just to bypass this check.

`voice:local` runs the real pinned `livekit/livekit-server:v1.9.11`, bound/advertised to loopback with loopback ICE candidates. The local-only keys are random, saved in ignored `.local-stack/voice.json`/`.env.local` and never printed. Local media testing is intentionally not publicly reachable. Stop it with `docker stop gathering-test-livekit` and stop the worker with Ctrl+C. Automated voice browser tests create a deterministic WAV microphone fixture and use actual Chromium microphone permission overrides, separate authenticated contexts, real WebRTC, and decoded remote audio energy assertions. No token endpoint or media server is mocked in those flows.

### Physical-device acceptance checklist

1. On HTTPS production, sign in as two different verified adult community members on two devices. Open the same voice channel, join and allow microphone access. Confirm both names appear and each person hears the other.
2. Mute/unmute each microphone, select available input/output devices, deafen/undeafen, and confirm the other listener hears the correct result. Test denied microphone permission, then recover through browser settings or join muted.
3. Click internal navigation links and verify voice remains connected. Test a brief Wi-Fi interruption and confirm reconnect state and resumed audio; leave explicitly and confirm microphone capture stops.
4. Remove a lower-ranked member as moderator and confirm provider disconnection and denied rejoin. Ban a connected member or revoke a private connect grant and verify the worker removes them even if their app is not actively polling. A nonmember must fail token requests and cannot access private room metadata.
5. Lock a room or lower its capacity, confirm existing connections close, and test the participant limit using distinct identities. Check browser autoplay prompts, mobile foreground/background transitions, Wi-Fi/cellular and a restrictive network that requires TURN.

## Verification results

The local implementation passed 124 unit/server/component tests, all 77 retained database checks, all 23 retained API/Realtime checks, 18 voice security/provider checks, and the fresh SQL installer check. All 54 desktop/mobile browser cases passed; both voice flows passed again after the final pending-publication safeguard. Lint, typecheck, production build and client bundle secret scans passed. See `DEVELOPMENT_LOG.md` for details. Physical-device and hosted-network acceptance remains the deployment checklist above.

## Verified SDK APIs and references

Implementation verified the installed, current registry packages: `livekit-client` **2.23.0**, `@livekit/components-react` **2.9.24**, `livekit-server-sdk` **2.19.2**. Consulted upstream component sources and installed declaration/source files for `RoomContext`, `RoomAudioRenderer`, `StartAudio`, connection/participant/speaking/quality/media-device hooks; Node `AccessToken`, microphone source grants and `RoomServiceClient` create/list/remove/delete operations. SDK grants serialize microphone sources as the JWT string `microphone`.

- [LiveKit authentication and tokens](https://docs.livekit.io/home/get-started/authentication/)
- [React components](https://docs.livekit.io/reference/components/react/)
- [Room management](https://docs.livekit.io/home/server/managing-rooms/)
- [Participant management](https://docs.livekit.io/home/server/managing-participants/)
- [Self hosting and ports](https://docs.livekit.io/home/self-hosting/deployment/)
- [Node SDK source](https://github.com/livekit/node-sdks/tree/main/packages/livekit-server-sdk/src)
- [React component source](https://github.com/livekit/components-js/tree/main/packages/react/src)

No recording/egress, transcription, screen sharing, voice DMs, load capacity certification or physical-device sign-off is included in this phase's automated checks.
