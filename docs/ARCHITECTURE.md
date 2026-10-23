# Application architecture

## Current runtime

Next.js 16 App Router and React 19 replace the Phase 2 Vite application runtime. Vite remains only as Vitest’s unit-test transformer. Next’s `proxy.ts` refreshes Supabase cookies using `@supabase/ssr` and verified claims; protected layouts/pages and every mutation independently authorize with `auth.getUser()`. Authentication is not delegated to a client router or a proxy-only gate.

The original Phase 2 repository began empty, without a blueprint or roadmap. Phase 3 implemented authentication/profiles; Phase 4 follows the explicit communities and membership request. `next dev` generated the framework’s `AGENTS.md`; it is preserved, and the bundled current Next.js guides were consulted.

## Source map

- `app/layout.tsx`: local fonts, global styles, metadata, and HTML root.
- `app/page.tsx`: public welcome.
- `app/login`, `register`, `forgot-password`, `reset-password`: real account forms with server actions.
- `app/auth/confirm/route.ts`: one-use verification/recovery token hashes.
- `app/auth/callback/route.ts`: PKCE code exchange and allowlisted internal redirects.
- `app/onboarding`: verified-user, three-step identity/games/interests setup.
- `app/(members)/layout.tsx`: verified identity, own profile loading, and responsive shell.
- `app/(members)/[...path]/page.tsx`: onboarding completion gate for retained preview screens.
- `app/(members)/home`, `communities`, `channels`: server-loaded community discovery, details, invitations, and authorized channel workspaces.
- `src/lib/communities`: typed data projections, strict server form validation, authenticated transactional commands.
- `src/components/communities`: real directory, host/member management, accessible command feedback, and native mobile channel dialog.
- `app/(members)/profile` and `settings`: real profile and account workflows; no demo persistence.
- `app/people/[username]`: opt-in, minimal profile projection. No public user directory.
- `app/api/avatars/[id]`: per-request visibility-authorized media streaming; no public bucket URLs.
- `src/lib/auth`: server guards, Zod validation, state types, auth actions, HMAC abuse budgeting.
- `src/lib/supabase`: per-request SSR clients, server-only admin client, and cookie-refresh integration.
- `src/lib/profiles`: own-profile data transfer objects and validated profile/avatar/preferences/deletion actions.
- `src/components/auth`: polished auth, onboarding/profile, and account settings forms.
- `src/components/MemberContext.tsx`: minimal safe identity DTO for shell personalization.
- `src/screens`: retained Phase 2 community presentation.
- `src/compat/navigation.tsx`: small presentational compatibility layer mapping Phase 2 `to` links to Next Link and route hooks. It performs no authorization.
- `supabase/migrations`: ordered, immutable SQL migrations; RLS, grants, scoped RPCs, age evidence, private storage, and active-viewer checks.
- `supabase/templates`, `supabase/config.toml`: documented email/local settings.
- `scripts/`: local-only service setup, migration checksums, real database/API tests, and client-artifact secret checks.
- `e2e/`: real local-account browser tests at desktop and phone sizes.

## Trust boundaries

Client form data, hidden fields, roles, IDs, filenames, MIME claims, and redirect destinations are untrusted. Actions derive identity from a verified current session, validate user-editable values, and return only narrow notices/errors. The admin client never enters client code. Ordinary data reads and profile mutations use authenticated RLS clients; database routines have fixed search paths, explicit grants, and session-derived ownership.

User preferences and interests stay owner-private regardless of profile visibility. Public/member profile projections expose only fields listed in `docs/SUPABASE.md`. Media obeys the same policy. Members-only access also checks the live viewer record to reject stale JWTs belonging to deleted, unverified, ineligible, or banned identities.

Profile saves update profile, interests, favorite games, and platforms atomically. Auth identity deletion cascades related tables, with storage cleanup performed through the Storage API first. Storage/API failures are real errors, never success simulations.

## Retained service boundaries

Community discovery, membership, roles, categories, channel definitions/permissions, invitations, and audit are now persisted. Home community cards use accessible database rows. Channel text messaging is connected in Phase 5. Voice uses real LiveKit media in Phase 6, and Phase 7 connects social feeds to real posts and private media. Direct messages, sample online friends, events, and the platform admin shell retain explicitly labeled development boundaries. Direct-message sends remain unavailable. Channel text sends only report delivery after a committed database response. No client-editable admin role was added; the admin shell grants no operational permissions.

## Deployment

Build with `npm run build`, run with `npm run preview`/`next start`, and supply secure configuration before public launch. Server actions require a Next runtime. Authenticated content, RSC payloads, callbacks, and avatars must never be cached publicly. Publishing the cloud filesystem/configuration does not apply hosted SQL migrations or configure Supabase SMTP and redirect policies. See `docs/SUPABASE.md` for the exact external requirements.

## Community authorization

All community reads/writes use the authenticated SSR client. Community RLS hides private communities from outsiders and channels from nonmembers or members without view permission. Direct writes are denied; the session-derived `community_command` RPC checks live adult verification, locks the community, validates role hierarchy and scoped references, and records changes. A trigger separately audits membership/role/status mutations. Approval lives in an operator-only private table; the public admin preview cannot grant it. Invitations store only random-token digests, expire, and are single-use under the same community lock. Composite foreign keys prevent cross-community category/override assignments. See `COMMUNITIES.md` for the full permission matrix, privacy projection, limits, deployment, and initial-owner procedure.

## Persistent Broadcast messaging

`src/lib/chat` implements strict input validation, session-constrained reads/commands, stable-ID/revision reconciliation, safe image/file processing, public-address-pinned preview fetches, and account file cleanup. `src/components/chat` renders safe Markdown, real message controls, thread/history/search state, and the in-memory authenticated Realtime transport.

The `/api/chat/session` endpoint validates the live user/channel before returning only an access JWT and current private epoch topic. Refresh cookies stay HttpOnly. `/api/chat/upload` validates Origin, streams/limits/decodes bytes, stores a private object with the server-only client, and registers it through the authenticated RPC. `/api/chat/attachments/:id` rechecks current RLS and streams no-store bytes; it never issues public/signed URLs. `/api/chat/typing` sends authenticated server-derived ephemeral indicators independently of sequential Server Actions.

PostgreSQL commits messages before WAL Broadcast delivery. Events invalidate stable IDs; no body/history is broadcast. Scoped RPCs and RLS enforce live channel permissions, per-user budgets, own edits, moderated deletion, and attachment claims. Reactions and previews revise the parent message; replies also revise their root. Channel write locks preserve commit ordering for catch-up cursors, and topic epochs rotate on access changes to address Realtime’s cached authorization. A private scheduled worker cleans staged/deleted/orphaned files through the Storage API. See `MESSAGING.md` for the complete trust/operational contract.

## LiveKit voice

The persistent member layout hosts the official LiveKit React room context and audio renderer around one client `Room`. Next handlers under `/api/voice` verify trusted Origin and Supabase `getUser`, commit request budgets, reserve authorized room capacity, and mint microphone-only 60-second room-scoped tokens using the Node server SDK. Identity, room/epoch, permissions and participant limit derive from PostgreSQL, never caller-controlled roles or grants.

An independent always-on worker reconciles actual LiveKit participants with a service-only, current ACL snapshot every two seconds, removing revoked memberships, room suspensions, bans, stale tickets, expired sessions and obsolete rooms. A successful enforcement heartbeat is required for admission. Owner/admin room settings rotate epochs and close existing rooms; moderation observes rank and audits commands. No voice media traverses Supabase, no provider secrets reach clients, and no recording is enabled by the application. See `VOICE.md` for provider revocation semantics, outage limitations, infrastructure and physical-device verification.

## Phase 7 social boundary

Server actions validate input and independently verify identity before RLS-backed social RPCs. Private Storage bytes flow only through authenticated media routes; staged ownership is claimed transactionally at publication. MP4 inspection runs in a bounded Node worker traced into the upload deployment. The feed uses stable cursor queries and explicit refresh, with no fabricated posts or success states. Scoped moderation/audits and account/scheduled media cleanup are documented in [SOCIAL.md](SOCIAL.md).

## Phase 8 group discovery and voice

Squad Up uses authenticated server actions and RLS-backed session RPCs. Composite member keys, ordered user locks and a per-session row lock serialize joins, approvals and blocks. Capacity counts reserved accepted places; actual wall-clock expiry is rechecked after waits. Group voice reservations are separate from community channels. Public voice RPC wrappers preserve the original private community authorization and merge group rooms into the service-only enforcement snapshot. All tokens retain existing short-lived microphone-only grants. See [SQUAD_UP.md](SQUAD_UP.md) for audiences, compatibility, activity privacy, operator configuration, scheduled cleanup and tests.

## Phase 9: friendships and private direct messages

`src/lib/people` validates every server action, independently authenticates it, and calls RLS-scoped RPCs. `src/components/people` supplies the member directory, contact privacy, friendship requests, conversations, reports, live shell notification counts and real friends rail. Explicit `/messages` routes replace the retained Phase 2 fixture screen.

Eight new RLS tables hold privacy, normalized friendship pairs, normalized one-to-one conversations, immutable messages, own mute/read preferences, friend notifications, abuse reports and private fixed-row budgets. The existing member block list is global for contact features; its original squad separation trigger remains in place. Ordered identity advisory locks are shared with squads and serialize block/send/request/accept races. Accepted friendships now govern friends-only squads.

`dm:<conversation UUID>` and `people:<authenticated UUID>` are private authorized Broadcast topics. Definer commands persist before calling `realtime.send`; notices contain IDs only. Restrictive receive/insert guards prevent unrelated permissive policies from granting access or allowing client Broadcast injection. All message content is fetched through a fresh participant/ban/block check. Existing cached subscribers never receive text bodies, histories, emails or profile metadata. Reauthorization, token refresh, reconnection and periodic authorized reconciliation repair missed events. Stable message IDs make retries idempotent; sequence cursors page older history. Background data reads use private no-store GET endpoints and presence uses an origin-checked POST; session expiry returns JSON denial without navigation. This preserves password-change/logout redirects and avoids rerendering unrelated routes during polling.

Presence is an opt-in heartbeat, visible only to accepted, unblocked friends and based on a visible tab within 90 seconds. There are no fabricated online indicators or exposed last-seen times. Discovery additionally requires a visible profile and explicit discovery opt-in; search never reads emails. Known conversation partners/request senders intentionally share their display name even when their general profile is private.

Reports are readable only by their reporter; reported message evidence is accessible to trusted operators through the service role, never a client-controlled moderator flag. There is no end-to-end encryption claim. Account deletion cascades contact records/messages and operational budgets. Community invite redemption checks blocks between issuer and recipient inside its transaction.

## Phase 10: faith, events and notifications

`src/lib/spaces` contains strict identity-free schemas, independently verified server commands, read-only client requests and deterministic event wall-time conversion. Dynamic `/faith`, `/events`, and `/notifications` pages use the same verified member shell. Private no-store GET endpoints never redirect background requests; command actions commit separate request budgets before transactional RPCs.

Four versioned migrations create fourteen RLS tables: requests/comments/encouragements, events/own RSVPs, recipient notifications/preferences, scoped targeted community/game invitations, private notices, and inaccessible budgets/audit/token/outbox tables. Privacy helpers accept trusted internal identities, but only current-user boolean policy helpers are executable by browsers. Raw writes and linked event-resource columns are not granted. Prayer access requires active community membership plus author/staff visibility; hidden states do not expose content to ordinary members. Blocks and global bans apply to reads, comments, invitations and notification resources.

Triggers on channel messages, posts/comments and prayer comments produce ID-only personal-topic invalidations after committed inserts. Notification records store a fixed kind and resource IDs, never prayer text/comment bodies, titles, bearer tokens or private notice bodies. Both display and emission honor preferences and current resource access. A bridge preserves existing friend notification APIs/read state; the bell adds one unified permitted unread count. Mention delivery is opt-in and capped at five distinct accessible recipients.

Community invitation tokens remain private and redeem through the original membership/ban/block command with an intended-recipient guard. Gaming acceptance supplies navigation only; original join approval, capacity and voice authorization remain authoritative. Blocks decline pending targeted invitations permanently. Private moderator notice bodies have a separate recipient-only read path.

Events store PostgreSQL-validated UTC instants plus an IANA zone; DST gaps are rejected, intervals are bounded and updates/cancellations require current host/staff access. The reminder RPC is service-only, bounded, serialized and deduplicated per event revision/Going RSVP. It requires both reminder preference gates, which are synchronized with existing account settings. The opt-in scheduled GitHub workflow is disabled until operator configuration. A private empty/disabled outbox defines future email/push transport boundaries without claiming those deliveries.

## Phase 11 administrative boundary

`private.platform_roles` is independent of community roles. All central mutations derive the actor from Auth and acquire a common transaction lock before live role checks; legacy community role writes use the same lock. RLS/private grants prevent evidence or role-table access outside explicit RPCs. `private.moderation_cases` contains bounded reported-item snapshots with expiry, while `private.admin_audit` retains minimal immutable client-facing action metadata. Eight new RLS tables cover roles, policy, text/media evidence, audit, appeals, announcements and community settings. Existing social/DM reports and earlier audit tables feed the central workspace without giving community moderators general DM access.

Archive/disable wrappers cover channel/community, faith/events, notification resources and squad/voice audience checks. Policies are explicitly rebound after function renames because PostgreSQL policy expressions retain function OIDs. Report reads conceal expired evidence immediately; a service-only private job erases it. No public cleanup endpoint, email directory or client owner-creation path is provided. LiveKit removals revoke admission and use the existing independent worker for actual media enforcement. See `docs/ADMINISTRATION.md`.

Reported media stays in its existing private bucket under an expiring evidence hold. The authenticated evidence endpoint obtains fresh scoped permission before server-only Storage access, serves no-store responses and never creates public URLs. Message/social cleanup honors holds and releases deleted media after expiry.

## Phase 12 release operations

Legacy preview modules/data and the catch-all fallback were removed. Private application histories remain cursor-paginated; the admin member directory adds a bounded stable sequence cursor. Supporting deletion/scope indexes and a root-message partial pagination index address measured local query paths. Index creation needs an approved production maintenance window.

An Auth-table deletion trigger shares the ownership mutation lock and prevents ownerless accounts/communities, including direct service Auth deletion; the app preflights before removing files. `private.operational_runs` stores successful maintenance completion only, with service-only RPCs. A bearer-authorized no-store health route checks database security/maintenance and real LiveKit service connectivity; public liveness returns no dependency data. Next instrumentation/client error boundaries emit allowlisted redacted events, with no external tracker configured. See the launch report for hosted and physical-device limits.
