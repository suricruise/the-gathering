# Premium Digital Lounge — Phase 5 Hangouts

## Scope and preserved architecture

`/voice` remains the existing route and now presents the Hangouts dashboard. It uses the persistent member-layout LiveKit provider, official installed LiveKit React hooks/Node SDK, current channel/membership permissions, token endpoint, admission/capacity locks, server grants, private session tickets, enforcement worker and moderation controls. No community/channel/member/message records, voice identities or provider accounts are replaced. No Phase 5 migration, environment variable or bucket is required.

The dashboard includes actual happening-now rooms, rooms in joined communities, successful recent joins from the current tab, live suggestions and existing authorized scheduled Gatherings. Existing Squad Up session rooms remain available through their established route and audience/host controls; they are not exposed as unrestricted community rooms.

Room cards show actual channel name/topic, parent community/authorized artwork, visibility, available capacity, observed LiveKit participant count and permitted avatar previews. Join Hangout uses the existing provider and token endpoint, muted by default; it does not treat opening a link or receiving a token as connection success. Open room uses the existing channel route for device, microphone, deafen, leave and moderator controls. Joining another room is disabled until the current session ends. Unavailable provider activity leaves counts unknown and dashboard joining disabled; members can open existing room controls to inspect infrastructure/permissions. No simulated participant or connection is added.

The room interface is styled as an avatar grid with genuine SDK speaking, track-muted and connection-quality indicators. Avatars/role/profile shortcuts are fetched through the existing channel member directory and private avatar endpoint, with initials as a fallback. Only current SDK participants render; permitted directory metadata cannot create a connected participant. Existing microphone/output selectors, autoplay enable action, deafen behavior, participant removal, room lock/capacity controls and server-side rank checks remain. The original compact persistent connection panel remains mounted while navigating.

## Data, privacy and limits

- The directory verifies Supabase identity, request budget, joined communities and normal authenticated channel RLS; it only reads up to 200 visible voice channels. Current connect permission is checked in batches of at most six. No caller-selected actor, LiveKit room name or token grant is accepted.
- LiveKit room counts are matched server-side using existing channel/epoch definitions. Opaque room keys, epochs, API credentials, session tickets and tokens are not returned by the directory. Rooms lacking connect permission have unknown activity/capacity and cannot be joined from the dashboard.
- Previews are bounded to four live rooms and up to four avatars each, drawn from real SDK identities intersected with the existing current channel member-directory projection (up to 51 sampled rows). That directory enforces membership/status/blocks/privacy; identities outside the permitted sample do not become invented avatars. Connect/visibility are rechecked after external calls. No SDK-only display names or private profile paths are used for unjoined preview cards.
- In-room avatar metadata uses the same directory, capped to its permitted first page. Large-community participants outside that sample, blocked/private images, missing uploads or unavailable services can remain initials. The existing private image endpoint reauthorizes requests. Names after connection come from the existing server-issued LiveKit participant identity/name, preserving current room semantics.
- Successful recent joins are capped to eight IDs in VoiceProvider memory, only after the existing connection path completes successfully. They persist through client navigation in this signed-in tab, not refresh/restart or across devices. They are filtered against fresh authorized directory rows before display, and clear with the authenticated provider on logout/tab close. No localStorage, IndexedDB, PWA cache, database activity history or unsent queue is added.
- Live snapshots refresh approximately once per minute while visible/online and on connectivity/known access changes. Offline/expired snapshots are cleared; late request generations cannot overwrite a newer response. Current-room indicators use real provider connection/participant state. Visibility, worker enforcement and provider observations remain eventually refreshed rather than an assertion that every media packet has synchronous database authorization.
- Suggested live conversations must be joinable, unlocked and actually observed with participants. Rank matching current member interests first, then connected count/name/UUID; exclude the currently connected room. No fake popularity/member activity is used.
- Default room capacity of 12 for a permitted, never-configured room comes from the existing admission implementation; actual configured limits override it. Observed fullness is advisory; the original transactional admission endpoint remains authoritative.

## Six Hangout types

Use existing **Manage channels & moderation** tools to create/select a channel category with one of these exact names (case-insensitive), and assign its voice channels:

- Casual Conversation
- Gaming Together
- Watch & Discuss
- Creative Hangout
- Faith & Life
- Community Meetup

This is an explicit presentation mapping of host-selected categories. Existing categories and rooms are not renamed or guessed into types. Unmatched legacy categories display “Community hangout” and remain in All Hangouts. The dashboard filter supports all six types. Watch & Discuss is a conversational theme; this phase does not add a streaming player, screen sharing, synchronized playback or unreviewed embeds.

## Required extension before temporary member-created Hangouts

General temporary user-created Hangouts are **not supported or implemented**. Existing approved community channel creation and Squad Up's specific reserved-room lifecycle remain functional; no Create Hangout button pretends a broader backend exists. Before adding that product capability, design and approve:

1. A normalized temporary-room definition with authenticated creator/community, explicit audience/membership/blocks, allowed type/topic, capacity, expiration and lifecycle tombstones. Never accept arbitrary LiveKit names/grants from the browser.
2. Transactional creation/approval/member quotas, abuse limits, community and platform moderation, private-room invitations, ownership/host changes, cancellation and audited reasons. Ordinary member creation needs an explicit policy rather than bypassing existing approved-host restrictions.
3. Integration with the current server admission/token/worker path, current permissions on reads/subscriptions/media, safe TTL/idle cleanup and disconnection on permission loss. Do not drop existing channel messages/files or replace the persistent provider.
4. Account-isolation, concurrent capacity/creation, privilege-escalation, private invitation, expiry/reconnect and real-device media tests, plus capacity/operational monitoring and recovery procedures.

Durable cross-device recent-room history would also need a separate consent/retention-aware per-user table/RLS and server-verified actual connection recording (e.g. validated LiveKit events or checked session identity), owner-only reads filtered by current room access, block/account-deletion cleanup and authorization tests. Issuing a token is not proof that the member joined. This phase intentionally keeps only in-memory successful joins.

## Physical two-device acceptance — still required

After an explicitly approved release, use two distinct approved accounts on two real devices, each signed in at the canonical HTTPS site:

1. Join the same authorized room, using headphones. Join muted from the dashboard, open the room and allow microphone permission when unmuting. Choose input/output devices where supported. Tap **Enable voice audio playback** if the browser requests it.
2. Speak from each device in turn; confirm the other device hears actual audio and speaking indicators match the speaker. Check user-uploaded avatars only where visibility allows.
3. Verify mute and deafen/undeafen, leave/rejoin, denied microphone permission and available device switching. Do not use speaker loopback as proof of two-way audio.
4. Keep one device speaking while the other navigates two text channels, community overview, events, profile and back. Confirm the same two connected participants remain and the compact panel controls the real session.
5. Interrupt/reconnect networking. Verify explicit reconnect/offline states, no duplicate participants and no false success when admission/worker access is unavailable.
6. As an authorized moderator, remove the other participant; verify server-side removal and temporary rejection. Confirm a normal member cannot remove users/change room settings and an uninvited/private-channel account cannot obtain a token or preview restricted room details.
7. Separately test iOS Safari/installed PWA and Android Chrome, autoplay, screen locking/backgrounding, calls/headsets and mobile OS interruptions. Foreground SPA navigation persistence is not a guarantee of background audio under mobile OS suspension.

**This execution environment has no physical phones/computers or microphone hardware to perform that acceptance. Automated real multi-account browser/WebRTC results below do not substitute for it. No production-readiness claim is made.**

## Executed verification

- Lint, typecheck, production build/`next start`, configured client-bundle credential scan and tracked-source/history credential-pattern scan pass. These scans cover recognized/configured values, not every possible secret format.
- **351 unit tests / 60 files pass**. New tests cover verified identity before SDK access, actual SDK identity/authorized-roster intersections, denied connect counts/previews, provider failure as unknown, revocation during external reads, explicit category mapping, authorized recent-history filtering, deterministic live suggestions and disabled dashboard joining when activity cannot be checked.
- **125 selected isolated service checks pass across seven commands**: voice/database/actual LiveKit 18; communities 32; workspace 7; People rail 11; all-member rail 8; actual private Realtime/API 11; Squad Up 28 plus 10 real concurrent-capacity checks. No production fixtures or SQL ran.
- Initial selected browser run executed eight desktop/mobile scenarios: **five passed and three failed**. Two new dashboard cases failed to launch because their launch-options override omitted this machine's installed Chromium path; that test configuration was corrected. The expanded mobile voice case navigated again before the preceding channel had committed; it now waits for each actual selected-channel URL and heading before opening the next drawer. No server limit, permission or media success assertion was removed.
- Final production-build run passed **6/6 in 1.2 minutes**, comprising both dashboard scenarios, both responsive/axe `/voice` route cases and both expanded real-audio cases. Together with the earlier passing community/Squad Up cases, **10 distinct browser scenarios passed across runs**, not a single clean full final-build matrix.
- The dashboard cases test real room/category/topic data, private-community/channel exclusion, search/type filters, empty recent history, an actual join-muted connection, successful in-memory recent-room recording, opening the existing room interface and leaving. They check overflow at 320/760/1024/1440px plus desktop/mobile axe.
- The voice cases exchange decoded audio between two authenticated accounts through actual LiveKit/WebRTC using generated browser capture tones. Audio remains active through two text channels, community overview, community events, profile, Hangouts dashboard and the room again. Existing mute/deafen/device/reconnect/leave/moderator/unauthorized-token/microphone-denial checks pass. Home reports two actual connected participants and the dashboard retains the genuinely joined room in the tab's recent list.
- Desktop and mobile dashboard/card screenshots and the connected participant grid were visually inspected. Test device names/tone inputs are clearly automation fixtures; no production participants are fabricated.

## Known limitations / follow-ups

Physical separate-device/audio-hardware/Safari/background acceptance remains open as described above. No temporary-room or durable cross-device history feature is claimed. Previews and room discovery are bounded; large communities may show initials for participants outside the directory sample. Count/fullness/type suggestions are observations, not a token/admission guarantee: room suspensions, worker freshness and capacity remain authoritative at the existing endpoint.

An existing **Navigation preferences unavailable** warning was visible during the expanded voice-navigation run while the actual room/audio and role checks passed. That shared navigation-preference behavior was not diagnosed or hidden by this milestone; a separate tested navigation-preference fix may be needed. No unrelated backend or permission change was substituted for it.

## Release and rollback

No new SQL is needed. Preserve the existing Supabase, canonical `APP_URL`, LiveKit URL/key/secret, worker health, TLS and provider/WebRTC connectivity configuration. Publishing `main` triggers Vercel and requires explicit release authorization. Confirm Ready and complete the physical acceptance above after release. Roll back using the previous application deployment; no schema reset, provider replacement or community recreation is part of rollback.
