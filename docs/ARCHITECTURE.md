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

Community discovery, membership, roles, categories, channel definitions/permissions, invitations, and audit are now persisted. Home community cards use accessible database rows. Channel text messaging is connected in Phase 5. Voice, direct messages, demo online friends, feeds, squads, events, and the platform admin shell remain development fixtures. Voice/direct-message controls remain unavailable. Channel text sends only report delivery after a committed database response. No client-editable admin role was added; the admin shell grants no operational permissions.

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
