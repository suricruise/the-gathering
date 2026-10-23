# The Gathering

A premium dark gaming community with real Supabase authentication, gamer profiles, communities, memberships, persistent Realtime messaging, social sharing, Squad Up reservations, friendships, private messages, faith spaces, events, notifications and actual LiveKit voice. It uses Next.js 16 App Router, React 19, TypeScript and `@supabase/ssr`. Member discovery, contact privacy, private Realtime DMs and friend notifications are real services. Faith spaces, events and opted-in in-app notifications use real community permissions. Platform administration uses server-enforced roles, protected reports and audited controls. Phase 12 is a release candidate; hosted launch gates remain open.

For Phase 9 setup and verification, see [Friends & private messages](docs/PEOPLE.md). The safe installer applies only pending Phase 9 migrations and skips recorded versions.

Voice setup requires a LiveKit project and an always-on authorization worker; follow the [voice setup guide](docs/VOICE.md). Voice is unavailable until configured, and never simulates a connection.

For Phase 10, follow [Faith, events and notifications](docs/FAITH_EVENTS_NOTIFICATIONS.md). Its pending-only installer is safe to rerun; scheduled reminders require a private scheduler. Email and push remain disabled.

## Develop

Use Node.js 24.x (validated with 24.19) and npm 10+.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

Configure Supabase through secure environment settings or ignored `.env.local`; see [.env.example](.env.example) and the complete [Supabase guide](docs/SUPABASE.md). Without configuration, public welcome/auth screens render and protected routes fail closed; authentication never pretends to succeed.

For the tested local integration stack:

```sh
npm run db:test-stack
npm run db:seed:communities
npm run test:gateway
# In another terminal:
npm run dev
```

The smaller stack runs real Supabase Auth, REST, Storage, and Realtime against PostgreSQL 17. Standard Supabase CLI setup is also documented in the guide. Local helpers generate only local development credentials and never copy credentials supplied in chat. Do not expose the test stack publicly.

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:communities
npm run test:messaging
npm run test:social
npm run test:social:setup
npm run test:squads
npm run test:people
npm run test:people:realtime
npm run test:people:setup
npm run test:spaces
npm run test:spaces:realtime
npm run test:spaces:setup
npm run test:squads:setup
npm run test:integration
npm run test:realtime
npm run test:e2e
npm run build
npm run test:bundle
```

Real integration tests require the local services and gateway. Browser tests use installed `/usr/bin/chromium`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or a Playwright-installed Chromium. They run desktop/mobile flows and automated axe WCAG A/AA checks. `test:bundle` confirms the configured server secret is absent from client build artifacts.

Run `npm run preview` after a production build. Hosting now requires a **Next.js server/runtime**, not the previous Vite static `dist/` or SPA fallback. `APP_URL` must match the deployed HTTPS origin. Next’s bundled agent guidance is preserved in `AGENTS.md`.

## Communities

Discover and join public communities, accept invitations, manage roles and channels, and control private-channel access with server authorization and RLS. Community creation requires operator approval. See the [community setup and permission guide](docs/COMMUNITIES.md) for the Phase 4 migration, idempotent development seed, first-owner provisioning, role matrix, and operational limits. Text messaging is live; Phase 6 connects voice through LiveKit with server authorization.

## Channel messaging

Text channels now persist before delivering private Broadcast invalidations. They support paginated history, threads/replies, reactions, own edits/deletes, moderator deletion, typing/read indicators, private photos/GIFs/files, safe Markdown, accessible-channel search, and opt-in link previews. Stable IDs and server revisions reconcile retries and reconnect catch-up. See [messaging setup/security/verification](docs/MESSAGING.md) and the [single-file Phase 5 SQL setup](supabase/phase5-setup.sql). Apply the migration before promoting the new app deployment, disable public Realtime subscriptions, and schedule the private attachment cleanup worker.

## Account flows

- `/register` → verification email → `/onboarding` → authenticated `/home`
- `/login` and secure logout with persistent HttpOnly, SameSite cookies
- `/forgot-password` → recovery email → `/reset-password`
- `/profile`: unique handle, display name, bio, favorite games/platforms/interests, private avatar uploads, and visibility
- `/settings`: private preferences, current-password verification, password change, and confirmed permanent account deletion
- `/people/:username`: minimal, explicitly visible profile; private/missing profiles share an unavailable response

Registration is 18+ with server and database enforcement of age self-attestation. Profiles default to private. Username checks are authenticated and throttled, and no public availability endpoint exists. All user data tables enable RLS. Normal users cannot directly write profile tables or upload arbitrary files.

See [Supabase configuration and security](docs/SUPABASE.md), [screens](docs/SCREENS.md), [architecture](docs/ARCHITECTURE.md), and the [development log](DEVELOPMENT_LOG.md).

## Phase 6 voice

LiveKit rooms support real microphone audio, mute/deafen, device selection, live participants, speaking/quality indicators, reconnect states and persistent navigation. Moderators can remove lower-ranked members; owners/admins can lock rooms and change capacity. Follow [voice setup and acceptance testing](docs/VOICE.md), apply the [single-file Phase 6 SQL setup](supabase/phase6-setup.sql), and deploy the always-on enforcement worker before enabling production voice. No recording is requested by the application.

## Phase 7 social sharing

The member feed now uses real persistent posts, photos/GIFs, validated MP4 clips, safe link cards/previews, reactions, comments, follows, audience filters and scoped reporting/moderation. No fabricated social posts are seeded. Apply the [one-time Phase 7 SQL installer](supabase/phase7-setup.sql) before using the new feed, then follow the [production setup and security guide](docs/SOCIAL.md). Keep the private social-media cleanup job scheduled.

## Phase 8 Squad Up

Create and discover real gaming sessions with platform/cross-play rules, player reservations, host approval, scoped audiences, community game nights and isolated LiveKit group rooms. Follow the [Squad Up production and security guide](docs/SQUAD_UP.md), apply the [one-time Phase 8 SQL installer](supabase/phase8-setup.sql), and schedule private session cleanup. Existing community voice permissions remain intact.

Phase 11 adds real scoped administration, protected reports, account/community/channel controls, appeals and audit history. See [administration setup](docs/ADMINISTRATION.md) for the safe pending-only installer, first platform-owner provisioning and evidence-retention job.

## Phase 12 release candidate

Start with the [launch readiness report](docs/LAUNCH_READINESS.md). Deliverables: [deployment checklist](docs/DEPLOYMENT.md), [administrator operations](docs/OPERATIONS.md), [user acceptance](docs/USER_ACCEPTANCE.md), [backup/recovery](docs/BACKUP_RECOVERY.md), [security findings](docs/SECURITY_REVIEW.md), and [known limitations](docs/KNOWN_LIMITATIONS.md). Terms, privacy and community rules are explicitly review drafts at `/terms`, `/privacy`, `/community-rules`.

The pending-only [Phase 12 installer](supabase/phase12-setup.sql) requires Phase 11 and explicit production approval. Do not push/merge to the production-connected branch or change hosted databases before owner confirmation.

Additional checks: `npm run test:launch`, `npm run test:launch:setup`, `npm run test:recovery`, `npm run test:security`, `npm audit`, and `npm run check:production`. Local recovery tests create only a uniquely named local restore database and refuse hosted URLs. Public `/api/health` is liveness only; private `/api/ops/health` needs a server-only bearer token and checks real dependencies.
