# Development log

## 2026-10-23 — Phase 5: persistent real-time channel messaging

### Delivered

- Added PostgreSQL messages, threads/replies, reactions, private attachment metadata, read receipts, safe link previews, moderation metadata, and seven versioned migrations. Reads, writes, searches, downloads, and private Realtime subscriptions independently enforce live membership and channel permissions. Server-derived identities, restrictive RLS, mutation budgets, bounded queries, and indexed pagination protect access.
- Implemented transactional, committed ID-only Supabase Realtime Broadcast delivery. Stable client message IDs and ordered revisions reconcile retries and reconnects without duplicates. Permission changes rotate private topic epochs; session refresh and authoritative catch-up recheck access. Offline sends retain an explicit retry state rather than claiming delivery.
- Built responsive real chat with older history, separate thread pagination, replies, reactions, own edits/deletes, moderator deletion reasons, typing expiry, read/unread indicators, visible avatars, UTC timestamps, search, shareable message links, and safe Markdown. Photos and animated GIFs are decoded/re-encoded; PDF/text/CSV files are validated and downloaded through authenticated no-store routes. No public attachment URLs are issued.
- Added opt-in HTTPS link previews with public-address DNS validation, pinned connections, redirect revalidation, strict response bounds, and text-only metadata. Added claimed/retryable Storage cleanup and integrated authored-file cleanup into account deletion. Voice, direct messages, feeds, and other sample features remain explicitly disconnected or labeled.
- Verified current Supabase Broadcast/authorization/database-change guidance and the official self-hosted Realtime service. Extended the local stack with genuine Realtime WAL delivery and WebSocket routing. Documented setup, security boundaries, operational limits, cleanup scheduling, and completed screens in `docs/MESSAGING.md` and related guides.
- Added `supabase/phase5-setup.sql`, a single transactional installer containing all seven migrations and CLI migration history. A fresh-schema test against real local services verified the installer and rolled back its test changes. Hosted Supabase was not modified: the operator must apply this installer and configure private-only Realtime before the new Vercel features work.

### Validation

- 111 unit/server/component tests passed. All 77 database checks passed (21 retained identity/access checks, 32 retained community checks, and 24 messaging checks). All 23 API/Realtime checks passed (13 retained and 10 new), including committed delivery, rollback silence, forged broadcasts, unauthorized subscriptions/mutations, stale topics, simultaneous retries, and reconnection reconciliation.
- Both new desktop/mobile flows exchanged messages between two genuinely authenticated browser sessions, including threads, edits, reactions, private uploads/downloads, offline retry, search, shared links, and access revocation. Accessibility, responsive overflow, and browser-error checks were included.
- The complete serial browser run passed 51 of 52 cases. The retained desktop community moderation flow exposed unstable conditional form identities; stable member-specific form keys corrected it, and its focused rerun passed with a database-persistence assertion. All 52 cases therefore passed across the full run and focused regression rerun. Earlier parallel accessibility timeouts passed in the serial run; no assertion was removed.
- Lint, typecheck, unit tests, production build, and client-bundle secret scan were run for final verification. Local migration checksum verification and fresh installer validation passed. These checks establish functional behavior and access isolation, not a load-test or malware-scanning certification.

## 2026-10-23 — Phase 4: communities, channels, and membership

### Delivered

- Replaced actual discovery/community/channel routes with authenticated Supabase data, real public joining/leaving, invitation-only discoverable/private communities, descriptions, and four bundled original cover images. Home community cards use accessible database rows; sample feed/events/online activity remain explicitly labeled.
- Added a versioned migration for communities, immutable role definitions, membership/status, channel categories/order, text/voice definitions, scoped role/user permission overrides, hashed invitations, operator-only creation approvals, and append-only security activity. All eight exposed community tables and the private approval table enable RLS. Direct ordinary writes are revoked.
- Implemented session-derived, transactional server/database commands. Community locks serialize membership/role/permission/invitation changes; live verified adult checks reject stale banned/unverified identities. Private channel metadata and access require membership and a grant, with deny precedence and documented owner/admin access. Composite foreign keys prevent cross-community assignments.
- Built approved-host creation, community/category/channel settings, ordering, invitation issue/revoke/accept, roster projections, role assignment, ownership transfer, kick/ban/unban, and staff security activity. Moderators cannot manage peers/superiors or escalate roles; administrators cannot appoint peers or owners. Membership changes are independently audited by a database trigger. Invitations always grant member, expire after seven days, are single-use, and expose no stored token digest to staff.
- Added an opt-in, loopback-only idempotent development seed for The Gathering and three interest-based communities, initial gaming text/voice channels, categories, and explicit moderator access to seeded staff channels. Repeated seeding preserves existing settings/members/overrides; no sample identities, counts, connections, or automatic host approvals are fabricated.
- Kept real authentication/profile/account flows and the responsive shell. New channel workspaces retain disconnected send/voice controls; mobile channels use a keyboard-accessible native modal drawer. Added pending/error/empty/unavailable feedback and generic missing/private responses.
- Documented migration order, SQL Editor installation, host approval, first-owner bootstrap/recovery, visibility/role matrices, roster privacy, operational limits, seed/testing, and completed screens in `docs/COMMUNITIES.md`, Supabase/screen/architecture guides, and README. The repository still has no `PROJECT_BLUEPRINT.md` or `ROADMAP.md`; existing guidance and development log were read.

### Validation

- 82 unit/server/component tests passed, including all previous tests plus strict command validation, authenticated actor isolation, failed-operation feedback, unpredictable invitation links, and a form-reset regression.
- 21 existing database access-control tests, 32 new community authorization checks, and 13 existing real Supabase API integration tests passed. New coverage includes private-channel isolation/grants/denials, privilege escalation, direct-write denial, cross-community references, bans, invitation reuse/expiry/revocation/hash protection, ownership transfer, audit tampering, live identity checks, and account deletion. SQL checks roll back their local test data.
- New migration applied to real local PostgreSQL/Auth/Storage services; repeat startup/checksum verification passed. Development seed ran twice successfully, including legacy central-channel links.
- Lint, typecheck, production build, and client-bundle secret scan passed. All 50 real browser tests passed at desktop/mobile sizes, including the 46 retained tests and four new community flows. New channel/member/management screens passed automated axe checks, overflow checks, and browser-error assertions; desktop/mobile management screenshots were visually inspected.
- Browser review found and fixed a missing heading in the nonmember channel state and a control named `reset` shadowing the native form reset method. The affected host flows passed after correction at both desktop/mobile sizes.
- Hosted database changes require the project operator's SQL Editor or an authorized database connection; no hosted SQL or accounts were changed by this phase. Apply `202610230001_communities.sql` after the Phase 3 baseline before using the connected features on Vercel.

## 2026-10-23 — Hosted signup setup and error handling

- Read-only hosted checks confirmed email signup is enabled, while the application tables and auth-limiter RPC are absent from the exposed API schema. Registration stops before account creation; a missing RPC previously appeared as an exhausted rate budget. No hosted accounts or database records were modified.
- Auth limiter now distinguishes a genuine denial from dependency/configuration failures, continues to fail closed, and logs only sanitized diagnostic codes. Added regression coverage for limiter responses, missing configuration/RPC, transport failures, and signup dependency failure.
- Added `supabase/initial-setup.sql` for a fresh project SQL Editor setup, using all four existing migrations in a transaction with a pre-existing-table guard and CLI migration history. Documented hosted installation and failure diagnosis.
- Validation: 71 tests, 21 database access-control assertions, lint, typecheck, production build, and client-bundle secret check passed. Validated the setup SQL against real local PostgreSQL/Auth/Storage schemas inside a rolled-back transaction, including four history records, six RLS tables, private avatars, and the auth limiter. Hosted SQL application still requires the project owner’s SQL Editor or database credentials.

## 2026-10-22 — Phase 3: authentication and gamer profiles

### Delivered

- Migrated the application runtime from Vite/React Router to Next.js 16 App Router, retaining the responsive Phase 2 community screens. Vite remains only for Vitest transformation. Preserved the framework-generated `AGENTS.md` and consulted its bundled current authentication, server-action, data-security, proxy, and cookies guides.
- Integrated `@supabase/ssr` with per-request clients, async cookie handling, verified-claims refresh in `proxy.ts`, and independent `getUser()` authorization in protected layouts, pages, and mutations. Auth cookies are persistent, HttpOnly, SameSite=Lax, and Secure in production; authenticated responses are private/no-store.
- Added real email signup/verification, login/logout, PKCE and token-hash callbacks, password recovery, current-password-verified account password changes, and protected routes. Missing configuration fails closed instead of simulating authentication.
- Added polished three-step onboarding for identity/privacy, games/platforms, and private interests. The dashboard/sidebar use the real member identity and avatar. Profile editing is server-persisted, with transactional favorite/interests updates and a visible-profile link.
- Enforced 18+ age self-attestation at both server validation and `auth.users` insertion. Stored immutable age evidence privately; mutable user metadata and client-supplied roles/IDs are never authorization sources.
- Added four versioned migrations for profiles, private preferences/interests, games, platforms, favorite relations, private age evidence/abuse budgets, private avatar storage, minimal opt-in profile/media projections, and active-viewer validation. All user tables enable RLS. Direct user-data mutations are revoked in favor of scoped session-derived RPCs.
- Protected handle selection with normalization, a unique constraint, authenticated claim budgets that persist after collisions, and generic failures. No public username directory or availability API was introduced.
- Added server-only avatar upload: verified caller, actual image decoding, size/pixel/type limits, metadata stripping, 512px WebP re-encoding, random owner-scoped keys, and per-request visibility-authorized no-store streaming. No anonymous/authenticated arbitrary storage writes or permanent public media URLs.
- Added account preferences and deletion with explicit confirmation, password reauthentication, own-prefix Storage cleanup, Admin deletion of only the verified identity, related-row cascades, and rate-record cleanup. Members-only lookups reject stale JWTs from deleted/unverified/ineligible/banned viewers.
- Documented hosted setup, redirects, SMTP/templates, secure variables, migrations, local services, launch limitations, and deployment in `docs/SUPABASE.md`, README, architecture, and screen inventory. Next.js now requires a server runtime; the old static Vite `dist/` is obsolete.

### Validation completed

- Lint: passed with no warnings.
- Typecheck: passed, including routes, application, server actions, tests, and browser configuration.
- Vitest: **64 tests passed**, none failed or skipped. Includes server input/age validation, authorization failures, submitted-ID/role isolation, unsafe avatar rejection, deletion reauthentication/cleanup failures, and UI/onboarding behavior.
- PostgreSQL access-control suite: **21 tests passed** in a rolled-back transaction against the real local Auth/Storage schema. Includes RLS, owner isolation, restricted data, direct-write denial, age bypass rejection, atomic updates, unique-claim budgets, avatar ownership, stale viewer rejection, deletion cascades, and avatar protection even in the presence of an unrelated broad permissive storage policy.
- Real Supabase API integration: **13 tests passed**, none failed or skipped. Includes unverified login denial, direct Auth age gate, separate sessions, refresh, REST isolation, private/public projections, Storage upload denial, and deleted-user JWT denial.
- Playwright: **46 tests passed**, none failed or skipped, across desktop and mobile. Includes actual local verification/recovery emails, onboarding, cookie persistence, profile/avatar edits and visibility, logout, password changes, saved settings, deletion with a wrong-password attempt, protected routes, keyboard navigation, overflow checks, and 32 automated axe WCAG A/AA scans.
- Additional onboarding review: six axe scans (all three steps at desktop and phone sizes) reported zero violations and no horizontal overflow; desktop login and mobile onboarding screenshots were visually inspected. Automated scans supplement manual accessibility review and do not establish complete certification.
- Production Next.js build: passed. Client-bundle scan confirmed the configured server secret is absent from client build artifacts.
- Production browser smoke: passed real login, protected routing, persisted profile edit/reload, Secure/HttpOnly/SameSite cookies, private caching, logout, and denied post-logout access, with no browser errors.
- The standard Supabase CLI database image hit the Docker runtime’s unpacking-space limit. A smaller isolated stack using official Supabase Auth/REST/Storage images with official PostgreSQL 17 was successfully started; all four app migrations were applied and repeat startup/checksum validation passed. No package, checksum, or TLS verification was bypassed.
- Browser testing caught and fixed a premature onboarding submission caused by reusing a changing step button, along with stable accessible names for selected game/platform cards and precise test assertions for independent form notices. No assertions or required checks were disabled to make the final suite pass.

### Reusable configuration and hosted status

Saved updated Next.js install/start instructions and declared `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL`, and a server-only `SUPABASE_SECRET_KEY` requirement. The declared secret destination adds `klkwwieabhtayfxfdqec.supabase.co` to the saved restricted-network requirements. Draft saving is confirmed; it does not apply hosted SQL, supply secret values, or publish the environment.

The hosted project has **not** been migrated or live-validated by this task. Rotate the server secret posted in chat, add replacement credentials securely in environment settings, configure the canonical app URL/SMTP/email redirects, and apply the ordered migrations through an authorized database/CLI/SQL-editor connection. No hosted secret from chat was copied into source, logs, setup scripts, or saved configuration values. Local tests used locally generated development credentials only.

Age enforcement here is self-attestation, not independent age verification. Community chat, voice, feed, events, squads, and operational admin services remain explicitly labeled development content and disconnected.

## 2026-10-22 — Phase 2: responsive interface foundation

### Starting context

The selected repository `suricruise/the-gathering` was empty, with an unborn local branch and no remote refs. The requested `AGENTS.md`, `PROJECT_BLUEPRINT.md`, `ROADMAP.md`, and prior `DEVELOPMENT_LOG.md` were not present. Phase 2 was implemented from the user’s explicit screen, design, accessibility, and validation requirements. No application source or prior user work was overwritten.

### Delivered

- React 19 / TypeScript / Vite app with working direct routes and all 13 requested primary screens.
- Premium navy, indigo/purple, and cyan design system with original CSS landscape art, local fonts, rounded surfaces, and subtle motion.
- Desktop collapsible navigation, community/channel navigation, optional online-friends rail, and persistent disconnected voice state.
- Mobile bottom navigation, complete navigation drawer, channel drawer, responsive conversations, safe-area spacing, and persistent voice status strip.
- All requested reusable components plus explicit loading, empty, unavailable, not-found, and recoverable rendering-error states.
- Locally working community/squad/feed/event filters, sample reactions/bookmarks, demo profile editing, and browser-only settings persistence with failure feedback.
- Explicit demo content and service boundaries. Sending chat/DMs, joining voice, authentication, memberships, squad requests, publishing, registration, and admin actions remain unavailable. No successful chat or voice connection is simulated.
- Keyboard focus styles, skip link, route focus, drawer focus trapping/restoration, Escape dismissal, semantic labels, text status equivalents, and reduced-motion support.
- Screen and architecture documentation in `docs/` and reproducible developer commands in `README.md`.

### Validation

Final checks completed successfully:

- Frozen dependency reinstall: `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` passed.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed, including application, tests, and browser-test configuration.
- `npm test`: 33 tests passed; none failed or skipped.
- `npm run build`: production build passed.
- `npm run test:e2e`: 30 real Chromium tests passed; none failed or skipped. Includes 26 automated axe WCAG A/AA scans (13 screens at 1440px desktop and 390px mobile), horizontal-overflow checks, real navigation, disabled-service checks, keyboard skip navigation, and notification controls.
- Additional layout inspection covered 13 routes at 320px, 768px, 1024px, and 1920px. Two decorative welcome-orbit overflows were diagnosed and fixed; targeted 320px and 768px rechecks passed.
- Production browser smoke passed against the built app: welcome → home → filtered discovery → community details; direct channel URL with disabled sending; browser settings saved and restored after reload. No browser exceptions or failed asset responses occurred.
- Desktop welcome/dashboard and phone dashboard screenshots were visually inspected.

The first checks caught and resolved a TypeScript test option, focus-cleanup warning, avatar ARIA semantics, secondary-text contrast, and a browser-test timing issue. No checks were disabled to make the final suite pass. Automated accessibility checks supplement manual review; they are not a complete accessibility certification.

Browser checks use the cloud machine’s installed Chromium; the Playwright browser download was blocked by network policy, so no browser download or expanded network access is required here.

### Reusable cloud environment

Saved and verified an `install_script` for frozen installation, typechecking, and production build, and replaced the earlier empty-repository `start_skill` with current development-server and validation instructions. These are saved drafts for environment settings review; they have not been published by this task.

### Remaining service work

Connect real authentication and authorization, user/community data, messages, voice signaling, event registration, notifications, and moderation through backend services in a subsequent phase. The admin route is explicitly a public development shell and does not confer privileges. Production hosting needs an SPA route fallback.
